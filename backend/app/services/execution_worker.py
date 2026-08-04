from __future__ import annotations

from datetime import datetime, timezone
from time import sleep
from typing import Any, Protocol

import httpx
from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from ..models import ExecutionTask, TestExecution, TestExecutionDetail
from ..schemas import ApiCaseDebugRequest
from . import api_runner, executions


class UiRunner(Protocol):
    def run(
        self, *, steps: list[dict[str, Any]], config: dict[str, Any]
    ) -> dict[str, Any]: ...


def _api_payload(
    execution: TestExecution,
    detail: TestExecutionDetail,
    variables: dict[str, str],
) -> ApiCaseDebugRequest:
    request = detail.request_payload or {}
    return ApiCaseDebugRequest(
        environment=execution.env_name,
        variables=variables,
        url=request.get("url", ""),
        method=request.get("method", "GET"),
        expected_code=request.get("expectedCode", 200),
        headers=request.get("headers", {}),
        query_params=request.get("queryParams", []),
        body_type=request.get("bodyType", "none"),
        body_content=request.get("bodyContent"),
        body_fields=request.get("bodyFields", []),
        request_body=request.get("body"),
        assertions=request.get("assertionRules", []),
        extracts=request.get("extractRules", []),
    )


def _run_api_detail(
    session: Session,
    execution: TestExecution,
    detail: TestExecutionDetail,
    variables: dict[str, str],
    transport: httpx.BaseTransport | None,
) -> None:
    iterations = execution.config_json.get("iterations", 1)
    ramp_up_ms = execution.config_json.get("rampUpTime", 0)
    total_duration = 0
    result: dict[str, Any] | None = None
    for iteration in range(iterations):
        result = api_runner.debug_api_case(
            session,
            _api_payload(execution, detail, variables),
            transport=transport,
        )
        total_duration += result["responseTimeMs"]
        variables.update(
            {
                key: str(value)
                for key, value in result["extracts"].items()
                if value is not None
            }
        )
        if ramp_up_ms and iteration + 1 < iterations:
            sleep(ramp_up_ms / 1000)

    if result is None:
        raise RuntimeError("API execution produced no result")
    detail.duration_ms = total_duration
    detail.response_payload = result
    detail.assertion_results = result["assertions"]
    detail.status = (
        "PASSED"
        if all(assertion["passed"] for assertion in result["assertions"])
        else "FAILED"
    )


def _run_ui_detail(
    execution: TestExecution,
    detail: TestExecutionDetail,
    ui_runner: UiRunner | None,
) -> None:
    if ui_runner is None:
        raise RuntimeError("UI runner is not configured")
    request = detail.request_payload or {}
    config = {
        **execution.config_json,
        "timeoutSeconds": request.get("timeoutSeconds", 30),
    }
    attempts = request.get("retryCount", 0) + 1
    result: dict[str, Any] | None = None
    for _ in range(attempts):
        result = ui_runner.run(steps=request.get("steps", []), config=config)
        if result["status"] == "PASSED":
            break
    if result is None:
        raise RuntimeError("UI execution produced no result")
    detail.status = result["status"]
    detail.duration_ms = result.get("durationMs", 0)
    detail.response_payload = result
    detail.assertion_results = result.get("assertions", [])


def _finish_execution(session: Session, execution: TestExecution) -> None:
    execution.passed_count = sum(
        detail.status == "PASSED" for detail in execution.details
    )
    execution.failed_count = sum(
        detail.status == "FAILED" for detail in execution.details
    )
    execution.duration_ms = sum(detail.duration_ms for detail in execution.details)
    execution.end_time = datetime.now(timezone.utc)
    if execution.status != "CANCELLED":
        execution.status = "COMPLETED"
    if execution.task is not None and execution.task.status != "CANCELLED":
        execution.task.status = "COMPLETED"
        execution.task.completed_at = execution.end_time


def _claim_execution(
    session_factory: sessionmaker[Session], execution_code: str
) -> bool:
    claimed_at = datetime.now(timezone.utc)
    with session_factory() as session:
        execution_id = session.scalar(
            select(TestExecution.id).where(
                TestExecution.execution_code == execution_code
            )
        )
        if execution_id is None:
            return False
        result = session.execute(
            update(ExecutionTask)
            .where(
                ExecutionTask.execution_id == execution_id,
                ExecutionTask.status == "PENDING",
                ExecutionTask.available_at <= claimed_at,
            )
            .values(
                status="RUNNING",
                attempts=ExecutionTask.attempts + 1,
                locked_at=claimed_at,
            )
        )
        if result.rowcount != 1:
            session.rollback()
            return False
        session.execute(
            update(TestExecution)
            .where(
                TestExecution.id == execution_id,
                TestExecution.status == "PENDING",
            )
            .values(status="RUNNING", start_time=claimed_at)
        )
        session.commit()
    return True


def run_execution(
    session_factory: sessionmaker[Session],
    execution_code: str,
    *,
    api_transport: httpx.BaseTransport | None = None,
    ui_runner: UiRunner | None = None,
) -> bool:
    if not _claim_execution(session_factory, execution_code):
        return False
    variables: dict[str, str] = {}
    try:
        with session_factory() as session:
            execution = executions.get_execution_by_code(session, execution_code)
            variables.update(execution.config_json.get("variables", {}))
            detail_ids = [detail.id for detail in execution.details]

        for detail_id in detail_ids:
            with session_factory() as session:
                execution = executions.get_execution_by_code(session, execution_code)
                if execution.status == "CANCELLED":
                    break
                detail = session.get(TestExecutionDetail, detail_id)
                if detail is None or detail.status != "PENDING":
                    continue
                detail.status = "RUNNING"
                session.commit()
                try:
                    if execution.type == "API":
                        _run_api_detail(
                            session, execution, detail, variables, api_transport
                        )
                    else:
                        _run_ui_detail(execution, detail, ui_runner)
                except Exception as error:
                    detail.status = "FAILED"
                    detail.response_payload = {"errorMessage": str(error)}
                session.commit()

        with session_factory() as session:
            execution = executions.get_execution_by_code(session, execution_code)
            _finish_execution(session, execution)
            session.commit()
        return True
    except Exception as error:
        with session_factory() as session:
            execution = executions.get_execution_by_code(session, execution_code)
            execution.status = "FAILED"
            execution.end_time = datetime.now(timezone.utc)
            if execution.task is not None:
                execution.task.status = "FAILED"
                execution.task.last_error = str(error)
                execution.task.completed_at = execution.end_time
            session.commit()
        raise


def run_next_execution(
    session_factory: sessionmaker[Session],
    *,
    api_transport: httpx.BaseTransport | None = None,
    ui_runner: UiRunner | None = None,
) -> str | None:
    with session_factory() as session:
        execution_code = session.scalar(
            select(TestExecution.execution_code)
            .join(ExecutionTask)
            .where(
                ExecutionTask.status == "PENDING",
                ExecutionTask.available_at <= datetime.now(timezone.utc),
            )
            .order_by(ExecutionTask.id)
        )
        if execution_code is None:
            return None
    claimed = run_execution(
        session_factory,
        execution_code,
        api_transport=api_transport,
        ui_runner=ui_runner,
    )
    return execution_code if claimed else None
