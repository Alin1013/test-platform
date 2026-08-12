from time import perf_counter
from typing import Any, Protocol

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..schemas import (
    ApiCaseDebugRequest,
    ApiDebugRunRequest,
    DebugRunRequest,
    UiCaseDebugRequest,
)
from . import api_runner
from .settings import get_environment
from .variables import render_value


class UiRunner(Protocol):
    def run(
        self, *, steps: list[dict[str, Any]], config: dict[str, Any]
    ) -> dict[str, Any]: ...


def run_api(
    session: Session,
    payload: ApiCaseDebugRequest,
    *,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    started_at = perf_counter()
    try:
        return api_runner.debug_api_case(session, payload, transport=transport)
    except HTTPException as error:
        if error.status_code != 502:
            raise
        return {
            "success": False,
            "error": str(error.detail),
            "statusCode": None,
            "responseTimeMs": round((perf_counter() - started_at) * 1000),
            "responseHeaders": {},
            "responseBody": None,
            "assertions": [],
            "extracts": {},
            "requestData": None,
        }


def run_ui(
    session: Session,
    payload: UiCaseDebugRequest,
    *,
    ui_runner: UiRunner,
) -> dict[str, Any]:
    environment = get_environment(session, payload.environment)
    variables = {**payload.variables, "baseUrl": environment["baseUrl"]}
    steps = render_value(
        [step.model_dump() for step in payload.steps],
        variables,
    )
    try:
        result = ui_runner.run(
            steps=steps,
            config={
                "browser": payload.browser,
                "headless": payload.headless,
                "timeoutSeconds": payload.timeout_seconds,
            },
        )
    except Exception as error:
        return {
            "success": False,
            "status": "FAILED",
            "durationMs": 0,
            "stepResults": [],
            "logs": [str(error)],
            "screenshotUrl": None,
            "videoUrl": None,
            "traceUrl": None,
            "errorMessage": str(error),
        }
    return {"success": result["status"] == "PASSED", **result}


def run_debug(
    session: Session,
    payload: DebugRunRequest,
    *,
    transport: httpx.BaseTransport | None,
    ui_runner: UiRunner,
) -> dict[str, Any]:
    if isinstance(payload, ApiDebugRunRequest):
        return run_api(session, payload.config, transport=transport)
    return run_ui(session, payload.config, ui_runner=ui_runner)
