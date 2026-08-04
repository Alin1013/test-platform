from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Module, TestCase, TestExecution, TestExecutionDetail, User
from ..schemas import ApiExecutionCreate, UiExecutionCreate
from .settings import get_settings


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


def start_ui_execution(session: Session, payload: UiExecutionCreate) -> dict:
    configured_environment_ids = {
        environment["id"]
        for environment in get_settings(session)["execution"]["environments"]
    }
    if payload.environment not in configured_environment_ids:
        raise HTTPException(status_code=422, detail="Execution environment is not configured")
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
        status="RUNNING",
        config_json=payload.model_dump(),
        creator=_creator(session),
    )
    execution.details = [
        TestExecutionDetail(
            target_id=test_case.id,
            target_name=test_case.title,
            status="PENDING",
            duration_ms=0,
            request_payload={"steps": test_case.ui_details.steps if test_case.ui_details else []},
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
    session.add(execution)
    session.commit()
    return {
        "executionId": execution.execution_code,
        "status": execution.status,
        "startTime": execution.created_at,
    }


def start_api_execution(session: Session, payload: ApiExecutionCreate) -> dict:
    cases = _selected_cases(
        session,
        project_id=payload.projectId,
        suite_ids=payload.suiteIds,
        case_type="api",
    )
    execution = TestExecution(
        execution_code=_execution_code("api_exec"),
        type="API",
        project_id=payload.projectId,
        status="RUNNING",
        config_json=payload.model_dump(),
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
                    "headers": {**api_details.headers, **payload.globalHeaders},
                    "body": api_details.request_body,
                },
                response_payload=None,
                assertion_results=[],
            )
        )
    session.add(execution)
    session.commit()
    return {"executionId": execution.execution_code, "status": execution.status}


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


def stop_execution(session: Session, execution_code: str, execution_type: str) -> None:
    execution = get_execution(session, execution_code, execution_type)
    if execution.status in {"COMPLETED", "FAILED", "CANCELED"}:
        return
    execution.status = "CANCELED"
    for detail in execution.details:
        if detail.status in {"PENDING", "RUNNING"}:
            detail.status = "SKIPPED"
    session.commit()


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
