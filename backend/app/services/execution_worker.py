"""执行任务消费器：领取任务、并发运行用例明细并汇总执行结果。"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import partial
from time import sleep
from typing import Any, Callable, Protocol

import httpx
from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from ..models import ExecutionTask, TestExecution, TestExecutionDetail
from ..schemas import ApiCaseDebugRequest
from . import api_runner, executions


class UiRunner(Protocol):
    """UI 运行器接口协议。"""

    def run(
        self, *, steps: list[dict[str, Any]], config: dict[str, Any]
    ) -> dict[str, Any]: ...


class ExecutionCancelled(Exception):
    """执行被取消时抛出，用于中止当前用例并跳过结果回写。"""

    pass


def _api_payload(
    execution: TestExecution,
    detail: TestExecutionDetail,
    variables: dict[str, str],
) -> ApiCaseDebugRequest:
    """把执行明细中保存的请求快照还原为可运行的 API 调试请求。"""
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
    should_cancel: Callable[[], bool],
) -> dict[str, Any]:
    """按迭代数运行 API 用例；变量链式提取，压测参数控制间隔。"""
    iterations = execution.config_json.get("iterations", 1)
    ramp_up_ms = execution.config_json.get("rampUpTime", 0)
    total_duration = 0
    result: dict[str, Any] | None = None
    for iteration in range(iterations):
        if should_cancel():
            raise ExecutionCancelled
        result = api_runner.debug_api_case(
            session,
            _api_payload(execution, detail, variables),
            transport=transport,
        )
        total_duration += result["responseTimeMs"]
        variables.update(
            # 前一次迭代提取的变量会参与后续迭代的请求渲染。
            {
                key: str(value)
                for key, value in result["extracts"].items()
                if value is not None
            }
        )
        if should_cancel():
            raise ExecutionCancelled
        if ramp_up_ms and iteration + 1 < iterations:
            sleep(ramp_up_ms / 1000)

    if result is None:
        raise RuntimeError("API execution produced no result")
    return {
        "status": (
            "PASSED"
            if all(assertion["passed"] for assertion in result["assertions"])
            else "FAILED"
        ),
        "duration_ms": total_duration,
        "response_payload": result,
        "assertion_results": result["assertions"],
    }


def _run_ui_detail(
    execution: TestExecution,
    detail: TestExecutionDetail,
    ui_runner: UiRunner | None,
    should_cancel: Callable[[], bool],
    on_step: Callable[[dict[str, Any], str], None],
) -> dict[str, Any]:
    """按重试次数运行 UI 用例；PASSED/SKIPPED 时提前结束重试。"""
    if ui_runner is None:
        raise RuntimeError("UI runner is not configured")
    request = detail.request_payload or {}
    config = {
        **execution.config_json,
        "timeoutSeconds": request.get("timeoutSeconds", 30),
        "shouldCancel": should_cancel,
        "onStep": on_step,
    }
    attempts = request.get("retryCount", 0) + 1
    result: dict[str, Any] | None = None
    for _ in range(attempts):
        if should_cancel():
            raise ExecutionCancelled
        result = ui_runner.run(steps=request.get("steps", []), config=config)
        if result["status"] in {"PASSED", "SKIPPED"}:
            break
    if result is None:
        raise RuntimeError("UI execution produced no result")
    return {
        "status": result["status"],
        "duration_ms": result.get("durationMs", 0),
        "response_payload": result,
        "assertion_results": result.get("assertions", []),
    }


def _is_cancelled(
    session_factory: sessionmaker[Session], execution_code: str
) -> bool:
    """检查执行主记录是否已被取消。"""
    with session_factory() as session:
        status = session.scalar(
            select(TestExecution.status).where(
                TestExecution.execution_code == execution_code
            )
        )
    return status == "CANCELLED"


def _record_ui_step(
    session_factory: sessionmaker[Session],
    execution_code: str,
    detail_id: int,
    step_result: dict[str, Any],
    log: str,
) -> None:
    """把 UI 单步执行结果实时追加到明细响应中（WebSocket 进度来源）。"""
    with session_factory() as session:
        execution_status = session.scalar(
            select(TestExecution.status).where(
                TestExecution.execution_code == execution_code
            )
        )
        detail = session.get(TestExecutionDetail, detail_id)
        if execution_status == "CANCELLED" or detail is None:
            return
        response_payload = dict(detail.response_payload or {})
        response_payload["logs"] = [*response_payload.get("logs", []), log]
        response_payload["stepResults"] = [
            *response_payload.get("stepResults", []),
            step_result,
        ]
        detail.response_payload = response_payload
        session.commit()


def _execute_detail(
    session_factory: sessionmaker[Session],
    execution_code: str,
    detail_id: int,
    variables: dict[str, str],
    api_transport: httpx.BaseTransport | None,
    ui_runner: UiRunner | None,
) -> None:
    """执行单个用例明细：标记 RUNNING、运行、回写结果；支持中途取消。"""
    should_cancel = partial(_is_cancelled, session_factory, execution_code)
    with session_factory() as session:
        execution = executions.get_execution_by_code(session, execution_code)
        if execution.status == "CANCELLED":
            return
        detail = session.get(TestExecutionDetail, detail_id)
        if detail is None or detail.status != "PENDING":
            return
        detail.status = "RUNNING"
        if execution.type == "UI":
            detail.response_payload = {
                "logs": [],
                "stepResults": [],
                "screenshotUrl": None,
                "videoUrl": None,
                "traceUrl": None,
                "errorMessage": None,
            }
        session.commit()
        try:
            if execution.type == "API":
                outcome = _run_api_detail(
                    session,
                    execution,
                    detail,
                    variables,
                    api_transport,
                    should_cancel,
                )
            else:
                outcome = _run_ui_detail(
                    execution,
                    detail,
                    ui_runner,
                    should_cancel,
                    partial(
                        _record_ui_step,
                        session_factory,
                        execution_code,
                        detail_id,
                    ),
                )
        except ExecutionCancelled:
            return
        except Exception as error:
            outcome = {
                "status": "FAILED",
                "duration_ms": 0,
                "response_payload": {
                    "errorMessage": str(error),
                    "screenshotUrl": None,
                    "videoUrl": None,
                    "traceUrl": None,
                },
                "assertion_results": [],
            }

    with session_factory() as session:
        execution = executions.get_execution_by_code(session, execution_code)
        detail = session.get(TestExecutionDetail, detail_id)
        if (
            execution.status == "CANCELLED"
            or detail is None
            or detail.status == "SKIPPED"
        ):
            return
        detail.status = outcome["status"]
        detail.duration_ms = outcome["duration_ms"]
        detail.response_payload = outcome["response_payload"]
        detail.assertion_results = outcome["assertion_results"]
        session.commit()


def _finish_execution(session: Session, execution: TestExecution) -> None:
    """汇总执行统计并收尾：通过/失败数、耗时与任务状态。"""
    execution.passed_count = sum(
        detail.status == "PASSED" for detail in execution.details
    )
    execution.failed_count = sum(
        detail.status == "FAILED" for detail in execution.details
    )
    finished_at = (
        execution.end_time
        if execution.status == "CANCELLED" and execution.end_time is not None
        else datetime.now(timezone.utc)
    )
    execution.end_time = finished_at
    if execution.start_time is not None:
        started_at = execution.start_time
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        if finished_at.tzinfo is None:
            finished_at = finished_at.replace(tzinfo=timezone.utc)
        execution.duration_ms = max(
            0,
            round((finished_at - started_at).total_seconds() * 1000),
        )
    if execution.status != "CANCELLED":
        execution.status = "COMPLETED"
    if execution.task is not None and execution.task.status != "CANCELLED":
        execution.task.status = "COMPLETED"
        execution.task.completed_at = execution.end_time


def _claim_execution(
    session_factory: sessionmaker[Session], execution_code: str
) -> bool:
    """原子领取执行任务：PENDING→RUNNING，防止多 worker 重复执行。"""
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
    """执行一次完整执行：领取任务、按并发度跑完所有明细、汇总结果。"""
    if not _claim_execution(session_factory, execution_code):
        return False
    variables: dict[str, str] = {}
    try:
        with session_factory() as session:
            execution = executions.get_execution_by_code(session, execution_code)
            variables.update(execution.config_json.get("variables", {}))
            detail_ids = [detail.id for detail in execution.details]
            execution_type = execution.type
            concurrency = execution.config_json.get("concurrency", 1)

        if execution_type == "UI":
            # UI 执行共享同一运行器实例，按配置并发度提交线程池。
            run_detail = partial(
                _execute_detail,
                session_factory,
                execution_code,
                variables=variables,
                api_transport=api_transport,
                ui_runner=ui_runner,
            )
            with ThreadPoolExecutor(max_workers=concurrency) as executor:
                futures = [executor.submit(run_detail, detail_id) for detail_id in detail_ids]
                for future in futures:
                    future.result()
        elif concurrency > 1:
            # API 并发执行时每个线程独立复制变量，避免互相污染。
            with ThreadPoolExecutor(max_workers=concurrency) as executor:
                futures = [
                    executor.submit(
                        _execute_detail,
                        session_factory,
                        execution_code,
                        detail_id,
                        dict(variables),
                        api_transport,
                        ui_runner,
                    )
                    for detail_id in detail_ids
                ]
                for future in futures:
                    future.result()
        else:
            for detail_id in detail_ids:
                if _is_cancelled(session_factory, execution_code):
                    break
                _execute_detail(
                    session_factory,
                    execution_code,
                    detail_id,
                    variables,
                    api_transport,
                    ui_runner,
                )

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
    """消费队列中最早的可执行任务；无任务时返回 None。"""
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
