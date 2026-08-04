from collections.abc import Generator
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..schemas import ApiExecutionCreate, UiExecutionCreate
from ..services import executions

router = APIRouter(tags=["test executions"])


def websocket_session(websocket: WebSocket) -> Generator[Session, None, None]:
    with websocket.app.state.session_factory() as session:
        yield session


@router.post("/api/v1/ui-test/executions")
def start_ui_test_execution(
    payload: UiExecutionCreate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
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
    return {
        "code": 200,
        "data": executions.ui_execution_result(session, execution_id),
    }


@router.post("/api/v1/ui-test/executions/{execution_id}/stop")
def stop_ui_test_execution(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    executions.stop_execution(session, execution_id, "UI")
    return {"code": 200, "message": "Execution stopped successfully"}


@router.websocket("/ws/ui-test/execution/{execution_id}")
async def ui_test_execution_events(
    websocket: WebSocket,
    execution_id: str,
    session: Annotated[Session, Depends(websocket_session)],
) -> None:
    await websocket.accept()
    for event in executions.ui_execution_events(session, execution_id):
        await websocket.send_json(event)
    await websocket.close()


@router.post("/api/v1/api-test/executions")
def start_api_test_execution(
    payload: ApiExecutionCreate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
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
    return {
        "code": 200,
        "data": executions.api_execution_report(session, execution_id),
    }


@router.post("/api/v1/api-test/executions/{execution_id}/stop")
def stop_api_test_execution(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    executions.stop_execution(session, execution_id, "API")
    return {"code": 200, "message": "Execution stopped successfully"}
