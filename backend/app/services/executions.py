import asyncio
import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload, sessionmaker

from ..models import (
    ExecutionTask,
    Module,
    TestCase,
    TestExecution,
    TestExecutionDetail,
    User,
)
from ..schemas import (
    ApiExecutionConfig,
    ApiExecutionCreate,
    ExecutionStartRequest,
    UiExecutionConfig,
    UiExecutionCreate,
)
from .settings import get_environment


def _execution_code(prefix: str) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"{prefix}_{timestamp}_{uuid4().hex[:6]}"


def _execution_query():
    return select(TestExecution).options(
        selectinload(TestExecution.creator),
        selectinload(TestExecution.details),
    )


def _selected_cases(
    session: Session,
    *,
    project_id: int,
    suite_ids: list[int],
    case_type: str,
) -> list[TestCase]:
    cases = session.scalars(
        select(TestCase)
        .join(Module)
        .options(
            selectinload(TestCase.api_details),
            selectinload(TestCase.ui_details),
        )
        .where(TestCase.id.in_(suite_ids), Module.project_id == project_id)
    ).all()
    cases_by_id = {test_case.id: test_case for test_case in cases}
    if len(cases_by_id) != len(suite_ids):
        raise HTTPException(status_code=404, detail="Selected test case not found")
    if any(test_case.type != case_type for test_case in cases):
        label = "UI automation" if case_type == "ui" else "API"
        raise HTTPException(
            status_code=422,
            detail=f"Selected cases must all be {label} cases",
        )
    return [cases_by_id[suite_id] for suite_id in suite_ids]


def _creator(session: Session, user_id: int = 1) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Execution creator not found")
    return user


def start_ui_execution(
    session: Session,
    payload: UiExecutionCreate,
    *,
    initial_status: str = "RUNNING",
) -> dict:
    get_environment(session, payload.environment)
    cases = _selected_cases(
        session,
        project_id=payload.projectId,
        suite_ids=payload.suiteIds,
        case_type="ui",
    )
    execution = TestExecution(
        execution_code=_execution_code("ui_exec"),
        type="UI",
        project_id=payload.projectId,
        env_name=payload.environment,
        status=initial_status,
        config_json=payload.model_dump(),
        total_count=len(cases),
        start_time=datetime.now(timezone.utc) if initial_status == "RUNNING" else None,
        creator=_creator(session),
    )
    execution.details = [
        TestExecutionDetail(
            target_id=test_case.id,
            target_name=test_case.title,
            status="PENDING",
            duration_ms=0,
            request_payload={
                "steps": test_case.ui_details.steps if test_case.ui_details else [],
                "timeoutSeconds": (
                    test_case.ui_details.timeout_seconds
                    if test_case.ui_details
                    else 30
                ),
                "retryCount": (
                    test_case.ui_details.retry_count if test_case.ui_details else 0
                ),
            },
            response_payload={
                "logs": ["测试用例已加入执行队列"],
                "screenshotUrl": None,
                "videoUrl": None,
                "errorMessage": None,
            },
            assertion_results=[],
        )
        for test_case in cases
    ]
    if initial_status == "PENDING":
        execution.task = ExecutionTask(
            status="PENDING", available_at=datetime.now(timezone.utc)
        )
    session.add(execution)
    session.commit()
    return {
        "executionId": execution.execution_code,
        "status": execution.status,
        "startTime": execution.start_time,
    }


def start_api_execution(session: Session, payload: ApiExecutionCreate) -> dict:
    return _start_api_execution(
        session,
        project_id=payload.projectId,
        case_ids=payload.suiteIds,
        env_name=str(payload.envId),
        global_headers=payload.globalHeaders,
        iterations=payload.iterations,
        ramp_up_time=payload.rampUpTime,
        variables={},
        concurrency=1,
    )


def _start_api_execution(
    session: Session,
    *,
    project_id: int,
    case_ids: list[int],
    env_name: str,
    global_headers: dict[str, str],
    iterations: int,
    ramp_up_time: int,
    variables: dict[str, str],
    concurrency: int,
    initial_status: str = "RUNNING",
) -> dict:
    cases = _selected_cases(
        session,
        project_id=project_id,
        suite_ids=case_ids,
        case_type="api",
    )
    if concurrency > 1 and any(
        test_case.api_details and test_case.api_details.extracts
        for test_case in cases
    ):
        raise HTTPException(
            status_code=422,
            detail="API concurrency requires cases without extraction rules",
        )
    config = {
        "projectId": project_id,
        "suiteIds": case_ids,
        "environment": env_name,
        "globalHeaders": global_headers,
        "variables": variables,
        "iterations": iterations,
        "rampUpTime": ramp_up_time,
        "concurrency": concurrency,
    }
    execution = TestExecution(
        execution_code=_execution_code("api_exec"),
        type="API",
        project_id=project_id,
        env_name=env_name,
        status=initial_status,
        config_json=config,
        total_count=len(cases),
        start_time=datetime.now(timezone.utc) if initial_status == "RUNNING" else None,
        creator=_creator(session),
    )
    execution.details = []
    for test_case in cases:
        api_details = test_case.api_details
        if api_details is None:
            raise HTTPException(status_code=422, detail="API case details are missing")
        execution.details.append(
            TestExecutionDetail(
                target_id=test_case.id,
                target_name=test_case.title,
                status="PENDING",
                duration_ms=0,
                request_payload={
                    "method": api_details.method,
                    "url": api_details.url,
                    "headers": {**api_details.headers, **global_headers},
                    "queryParams": api_details.query_params,
                    "bodyType": api_details.body_type,
                    "bodyContent": api_details.body_content,
                    "bodyFields": api_details.body_fields,
                    "body": api_details.request_body,
                    "expectedCode": api_details.expected_code,
                    "assertionRules": api_details.assertions
                    or [
                        {
                            "type": "statusCode",
                            "target": "",
                            "comparison": "equals",
                            "expected": str(api_details.expected_code),
                        }
                    ],
                    "extractRules": api_details.extracts,
                },
                response_payload=None,
                assertion_results=[],
            )
        )
    if initial_status == "PENDING":
        execution.task = ExecutionTask(
            status="PENDING", available_at=datetime.now(timezone.utc)
        )
    session.add(execution)
    session.commit()
    return {"executionId": execution.execution_code, "status": execution.status}


def start_execution(session: Session, payload: ExecutionStartRequest) -> dict:
    get_environment(session, payload.envName)
    if payload.type == "UI":
        config = payload.config
        if not isinstance(config, UiExecutionConfig):
            raise HTTPException(status_code=422, detail="Invalid UI execution config")
        return start_ui_execution(
            session,
            UiExecutionCreate(
                projectId=payload.projectId,
                suiteIds=payload.caseIds,
                environment=payload.envName,
                browser=config.browser,
                headless=config.headless,
                concurrency=config.concurrency,
            ),
            initial_status="PENDING",
        )

    config = payload.config
    if not isinstance(config, ApiExecutionConfig):
        raise HTTPException(status_code=422, detail="Invalid API execution config")
    return _start_api_execution(
        session,
        project_id=payload.projectId,
        case_ids=payload.caseIds,
        env_name=payload.envName,
        global_headers=config.globalHeaders,
        iterations=config.iterations,
        ramp_up_time=config.rampUpTime,
        variables=config.variables,
        concurrency=config.concurrency,
        initial_status="PENDING",
    )


def get_execution(session: Session, execution_code: str, execution_type: str) -> TestExecution:
    execution = session.scalar(
        _execution_query().where(
            TestExecution.execution_code == execution_code,
            TestExecution.type == execution_type,
        )
    )
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


def get_execution_by_code(session: Session, execution_code: str) -> TestExecution:
    execution = session.scalar(
        _execution_query().where(TestExecution.execution_code == execution_code)
    )
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


def _summary(execution: TestExecution) -> dict[str, int]:
    counts = {
        status: sum(detail.status == status for detail in execution.details)
        for status in ("PASSED", "FAILED", "RUNNING", "PENDING")
    }
    return {
        "total": len(execution.details),
        "passed": counts["PASSED"],
        "failed": counts["FAILED"],
        "running": counts["RUNNING"],
        "pending": counts["PENDING"],
        "durationMs": sum(detail.duration_ms for detail in execution.details),
    }


def ui_execution_result(session: Session, execution_code: str) -> dict:
    execution = get_execution(session, execution_code, "UI")
    browser = execution.config_json["browser"]
    return {
        "executionId": execution.execution_code,
        "status": execution.status,
        "summary": _summary(execution),
        "cases": [
            {
                "caseId": detail.target_id,
                "caseName": detail.target_name,
                "browser": browser,
                "status": detail.status,
                "durationMs": detail.duration_ms,
                "errorMessage": (detail.response_payload or {}).get("errorMessage"),
                "screenshotUrl": (detail.response_payload or {}).get("screenshotUrl"),
                "videoUrl": (detail.response_payload or {}).get("videoUrl"),
                "steps": (detail.request_payload or {}).get("steps", []),
                "stepResults": (detail.response_payload or {}).get(
                    "stepResults", []
                ),
                "logs": (detail.response_payload or {}).get("logs", []),
            }
            for detail in execution.details
        ],
    }


def api_execution_report(session: Session, execution_code: str) -> dict:
    execution = get_execution(session, execution_code, "API")
    passed = sum(detail.status == "PASSED" for detail in execution.details)
    failed = sum(detail.status == "FAILED" for detail in execution.details)
    pending = sum(detail.status in {"PENDING", "RUNNING"} for detail in execution.details)
    completed_durations = [
        detail.duration_ms
        for detail in execution.details
        if detail.status in {"PASSED", "FAILED"}
    ]
    average = (
        round(sum(completed_durations) / len(completed_durations))
        if completed_durations
        else 0
    )
    return {
        "executionId": execution.execution_code,
        "status": execution.status,
        "summary": {
            "totalApi": len(execution.details),
            "passedApi": passed,
            "failedApi": failed,
            "pendingApi": pending,
            "avgResponseTimeMs": average,
        },
        "results": [
            {
                "apiId": detail.target_id,
                "name": detail.target_name,
                "method": (detail.request_payload or {}).get("method"),
                "url": (detail.request_payload or {}).get("url"),
                "responseCode": (detail.response_payload or {}).get("responseCode"),
                "responseTimeMs": detail.duration_ms,
                "status": detail.status,
                "requestData": {
                    "headers": (detail.request_payload or {}).get("headers", {}),
                    "body": (detail.request_payload or {}).get("body"),
                },
                "responseData": (detail.response_payload or {}).get("body"),
                "assertions": detail.assertion_results,
            }
            for detail in execution.details
        ],
    }


def execution_summary(session: Session, execution_code: str) -> dict:
    execution = get_execution_by_code(session, execution_code)
    summary = _summary(execution)
    completed_durations = [
        detail.duration_ms
        for detail in execution.details
        if detail.status in {"PASSED", "FAILED"}
    ]
    completed_count = summary["passed"] + summary["failed"]
    return {
        "executionId": execution.execution_code,
        "type": execution.type,
        "envName": execution.env_name,
        "status": execution.status,
        "totalCount": execution.total_count or len(execution.details),
        "passedCount": summary["passed"],
        "failedCount": summary["failed"],
        "runningCount": summary["running"],
        "pendingCount": summary["pending"],
        "passRate": (
            round(summary["passed"] / completed_count * 100, 2)
            if completed_count
            else 0.0
        ),
        "avgLatencyMs": (
            round(sum(completed_durations) / len(completed_durations))
            if completed_durations
            else 0
        ),
        "durationMs": execution.duration_ms or summary["durationMs"],
        "startTime": execution.start_time,
        "endTime": execution.end_time,
    }


def execution_details(session: Session, execution_code: str) -> dict:
    execution = get_execution_by_code(session, execution_code)
    if execution.type == "UI":
        items = ui_execution_result(session, execution_code)["cases"]
    else:
        items = [
            {
                "caseId": detail.target_id,
                "caseName": detail.target_name,
                "status": detail.status,
                "durationMs": detail.duration_ms,
                "requestData": (detail.response_payload or {}).get("requestData")
                or {
                    "method": (detail.request_payload or {}).get("method"),
                    "url": (detail.request_payload or {}).get("url"),
                    "headers": (detail.request_payload or {}).get("headers", {}),
                    "queryParams": (detail.request_payload or {}).get(
                        "queryParams", []
                    ),
                    "bodyType": (detail.request_payload or {}).get("bodyType", "none"),
                    "bodyContent": (detail.request_payload or {}).get("bodyContent"),
                    "bodyFields": (detail.request_payload or {}).get("bodyFields", []),
                },
                "responseData": detail.response_payload,
                "assertionRules": (detail.request_payload or {}).get(
                    "assertionRules", []
                ),
                "assertionResults": detail.assertion_results,
                "extractRules": (detail.request_payload or {}).get("extractRules", []),
            }
            for detail in execution.details
        ]
    return {
        "executionId": execution.execution_code,
        "type": execution.type,
        "status": execution.status,
        "items": items,
    }


def stop_execution(session: Session, execution_code: str, execution_type: str) -> None:
    execution = get_execution(session, execution_code, execution_type)
    _cancel_execution(session, execution)


def _cancel_execution(session: Session, execution: TestExecution) -> None:
    if execution.status in {"COMPLETED", "FAILED", "CANCELLED"}:
        return
    execution.status = "CANCELLED"
    execution.end_time = datetime.now(timezone.utc)
    if execution.task is not None:
        execution.task.status = "CANCELLED"
        execution.task.completed_at = execution.end_time
    if execution.start_time is not None:
        start_time = execution.start_time
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        execution.duration_ms = max(
            0, round((execution.end_time - start_time).total_seconds() * 1000)
        )
    for detail in execution.details:
        if detail.status in {"PENDING", "RUNNING"}:
            detail.status = "SKIPPED"
    session.commit()


def stop_execution_by_code(session: Session, execution_code: str) -> None:
    execution = get_execution_by_code(session, execution_code)
    _cancel_execution(session, execution)


def ui_execution_events(session: Session, execution_code: str) -> list[dict]:
    execution = get_execution(session, execution_code, "UI")
    return [
        {
            "event": "STEP_START",
            "caseId": detail.target_id,
            "stepIndex": 0,
            "action": "等待执行",
            "status": detail.status,
            "log": (detail.response_payload or {}).get("logs", ["测试用例已加入执行队列"])[0],
        }
        for detail in execution.details
    ]


def execution_events(session: Session, execution_code: str) -> list[dict]:
    execution = get_execution_by_code(session, execution_code)
    completed = sum(
        detail.status in {"PASSED", "FAILED", "SKIPPED"}
        for detail in execution.details
    )
    total = execution.total_count
    events = [
        {
            "type": "PROGRESS_UPDATE",
            "executionId": execution.execution_code,
            "status": execution.status,
            "totalCount": total,
            "completedCount": completed,
            "passedCount": sum(
                detail.status == "PASSED" for detail in execution.details
            ),
            "failedCount": sum(
                detail.status == "FAILED" for detail in execution.details
            ),
            "progress": round(completed / total * 100) if total else 0,
        }
    ]
    for detail in execution.details:
        events.append(
            {
                "type": "CASE_STATUS_CHANGE",
                "executionId": execution.execution_code,
                "caseId": detail.target_id,
                "caseName": detail.target_name,
                "status": detail.status,
            }
        )
        if execution.type == "UI":
            for index, log in enumerate(
                (detail.response_payload or {}).get("logs", [])
            ):
                events.append(
                    {
                        "type": "STEP_LOG",
                        "executionId": execution.execution_code,
                        "caseId": detail.target_id,
                        "stepIndex": index,
                        "status": detail.status,
                        "log": log,
                    }
                )
    return events


async def execution_event_stream(
    session_factory: sessionmaker[Session],
    execution_code: str,
    *,
    poll_interval: float = 0.25,
) -> AsyncIterator[dict]:
    seen_events: dict[tuple, str] = {}
    while True:
        with session_factory() as session:
            execution = get_execution_by_code(session, execution_code)
            current_events = execution_events(session, execution_code)
            is_terminal = execution.status in {
                "COMPLETED",
                "FAILED",
                "CANCELLED",
            }
        for event in current_events:
            key = (
                event["type"],
                event.get("caseId"),
                event.get("stepIndex"),
            )
            encoded = json.dumps(event, ensure_ascii=False, sort_keys=True)
            if seen_events.get(key) == encoded:
                continue
            seen_events[key] = encoded
            yield event
        if is_terminal:
            return
        await asyncio.sleep(poll_interval)
