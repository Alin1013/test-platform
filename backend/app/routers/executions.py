"""执行相关路由：启动/停止执行、查询结果以及 WebSocket 实时事件推送。"""

from collections.abc import Generator
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..schemas import ApiExecutionCreate, ExecutionStartRequest, UiExecutionCreate
from ..services import executions

router = APIRouter(tags=["test executions"])


def websocket_session(websocket: WebSocket) -> Generator[Session, None, None]:
    """WebSocket 专属会话依赖：避免 HTTP 请求级依赖复用。"""
    with websocket.app.state.session_factory() as session:
        yield session


@router.post("/api/v1/executions/start", status_code=status.HTTP_202_ACCEPTED)
def start_execution(
    payload: ExecutionStartRequest,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /api/v1/executions/start：创建执行任务并入队，返回 202。"""
    result = executions.start_execution(session, payload)
    return {
        "code": 202,
        "message": "Execution accepted",
        "data": result,
    }


@router.post("/api/v1/executions/{execution_id}/stop")
def stop_execution(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /api/v1/executions/{id}/stop：按执行编号停止执行。"""
    executions.stop_execution_by_code(session, execution_id)
    return {"code": 200, "message": "Execution stopped successfully"}


@router.get("/api/v1/executions/{execution_id}/summary")
def get_execution_summary(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """GET /executions/{id}/summary：返回执行汇总（用例数与通过率等）。"""
    return {"code": 200, "data": executions.execution_summary(session, execution_id)}


@router.get("/api/v1/executions/{execution_id}/details")
def get_execution_details(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """GET /executions/{id}/details：返回逐条用例的执行明细。"""
    return {"code": 200, "data": executions.execution_details(session, execution_id)}


@router.websocket("/ws/execution/{execution_id}")
async def execution_events(
    websocket: WebSocket,
    execution_id: str,
) -> None:
    """WebSocket 实时推送执行事件流，客户端断开即结束。"""
    await websocket.accept()
    try:
        async for event in executions.execution_event_stream(
            websocket.app.state.session_factory,
            execution_id,
        ):
            await websocket.send_json(event)
    except WebSocketDisconnect:
        return
    await websocket.close()


@router.post("/api/v1/ui-test/executions")
def start_ui_test_execution(
    payload: UiExecutionCreate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /api/v1/ui-test/executions：启动 UI 用例执行。"""
    return {
        "code": 200,
        "message": "success",
        "data": executions.start_ui_execution(session, payload),
    }


@router.get("/api/v1/ui-test/executions/{execution_id}")
def get_ui_test_execution(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """GET /ui-test/executions/{id}：查询 UI 执行结果。"""
    return {
        "code": 200,
        "data": executions.ui_execution_result(session, execution_id),
    }


@router.post("/api/v1/ui-test/executions/{execution_id}/stop")
def stop_ui_test_execution(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /ui-test/executions/{id}/stop：停止 UI 执行。"""
    executions.stop_execution(session, execution_id, "UI")
    return {"code": 200, "message": "Execution stopped successfully"}


@router.websocket("/ws/ui-test/execution/{execution_id}")
async def ui_test_execution_events(
    websocket: WebSocket,
    execution_id: str,
    session: Annotated[Session, Depends(websocket_session)],
) -> None:
    """WebSocket 推送 UI 执行进度事件。"""
    await websocket.accept()
    for event in executions.ui_execution_events(session, execution_id):
        await websocket.send_json(event)
    await websocket.close()


@router.post("/api/v1/api-test/executions")
def start_api_test_execution(
    payload: ApiExecutionCreate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /api/v1/api-test/executions：启动 API 用例执行。"""
    return {
        "code": 200,
        "message": "Execution started",
        "data": executions.start_api_execution(session, payload),
    }


@router.get("/api/v1/api-test/executions/{execution_id}/report")
def get_api_test_execution_report(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """GET /api-test/executions/{id}/report：返回 API 执行报告。"""
    return {
        "code": 200,
        "data": executions.api_execution_report(session, execution_id),
    }


@router.post("/api/v1/api-test/executions/{execution_id}/stop")
def stop_api_test_execution(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /api-test/executions/{id}/stop：停止 API 执行。"""
    executions.stop_execution(session, execution_id, "API")
    return {"code": 200, "message": "Execution stopped successfully"}
