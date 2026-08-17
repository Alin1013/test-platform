"""调试路由：API/UI 用例的即时试运行，统一包裹返回结构。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..schemas import ApiCaseDebugRequest, DebugRunRequest, UiCaseDebugRequest
from ..services import debug_runner


router = APIRouter(tags=["debug"])


def _envelope(data: dict) -> dict:
    """把调试结果包装成统一响应结构。"""
    return {"code": 200, "message": "Debug run completed", "data": data}


@router.post("/api/v1/debug/api-run")
def debug_api(
    payload: ApiCaseDebugRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /api/v1/debug/api-run：调试单个 API 用例。"""
    return _envelope(
        debug_runner.run_api(
            session,
            payload,
            transport=getattr(request.app.state, "api_debug_transport", None),
        )
    )


@router.post("/api/v1/debug/ui-run")
def debug_ui(
    payload: UiCaseDebugRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /api/v1/debug/ui-run：调试单个 UI 用例。"""
    return _envelope(
        debug_runner.run_ui(session, payload, ui_runner=request.app.state.ui_runner)
    )


@router.post("/api/v1/debug-run")
def debug_run(
    payload: DebugRunRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /api/v1/debug-run：通用调试入口，按用例类型分发。"""
    return _envelope(
        debug_runner.run_debug(
            session,
            payload,
            transport=getattr(request.app.state, "api_debug_transport", None),
            ui_runner=request.app.state.ui_runner,
        )
    )
