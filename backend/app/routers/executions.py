import asyncio
import json
from collections.abc import Generator
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..schemas import ApiExecutionCreate, ExecutionStartRequest, UiExecutionCreate
from ..services import execution_worker, executions

router = APIRouter(tags=["test executions"])


def websocket_session(websocket: WebSocket) -> Generator[Session, None, None]:
    with websocket.app.state.session_factory() as session:
        yield session


@router.post("/api/v1/executions/start", status_code=status.HTTP_202_ACCEPTED)
def start_execution(
    payload: ExecutionStartRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    result = executions.start_execution(session, payload)
    if request.app.state.auto_run_executions:
        background_tasks.add_task(
            execution_worker.run_execution,
            request.app.state.session_factory,
            result["executionId"],
            api_transport=request.app.state.api_debug_transport,
            ui_runner=request.app.state.ui_runner,
        )
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
    executions.stop_execution_by_code(session, execution_id)
    return {"code": 200, "message": "Execution stopped successfully"}


@router.get("/api/v1/executions/{execution_id}/summary")
def get_execution_summary(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    return {"code": 200, "data": executions.execution_summary(session, execution_id)}


@router.get("/api/v1/executions/{execution_id}/details")
def get_execution_details(
    execution_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    return {"code": 200, "data": executions.execution_details(session, execution_id)}


@router.websocket("/ws/execution/{execution_id}")
async def execution_events(
    websocket: WebSocket,
    execution_id: str,
) -> None:
    await websocket.accept()
    seen_events: dict[tuple, str] = {}
    try:
        while True:
            with websocket.app.state.session_factory() as session:
                execution = executions.get_execution_by_code(session, execution_id)
                current_events = executions.execution_events(session, execution_id)
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
                await websocket.send_json(event)
                seen_events[key] = encoded
            if is_terminal:
                break
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        return
    await websocket.close()


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
