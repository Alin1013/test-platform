from typing import Annotated, Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..case_file_schemas import TestCaseExportRequest
from ..dependencies import get_session
from ..schemas import (
    CaseStatus,
    CaseType,
    Priority,
    ApiCaseDebugRequest,
    TestCaseCreate,
    TestCaseUpdate,
)
from ..services import api_runner, case_files, test_cases

router = APIRouter(prefix="/api/v1", tags=["test cases"])


@router.get("/modules")
def modules(
    session: Annotated[Session, Depends(get_session)], project_id: int = 1
) -> list[dict]:
    return test_cases.module_tree(session, project_id)


@router.get("/test-cases")
def list_test_cases(
    session: Annotated[Session, Depends(get_session)],
    type: CaseType | None = None,
    module_id: str | None = None,
    priority: Priority | None = None,
    status: CaseStatus | None = None,
    keyword: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    return test_cases.list_cases(
        session,
        case_type=type,
        module_id=module_id,
        priority=priority,
        status=status,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )


@router.post("/test-cases", status_code=status.HTTP_201_CREATED)
def create_test_case(
    payload: TestCaseCreate, session: Annotated[Session, Depends(get_session)]
) -> dict:
    return test_cases.create_case(session, payload)


def _create_automation_case(
    session: Session, payload: TestCaseCreate, expected_type: Literal["api", "ui"]
) -> dict:
    if payload.type != expected_type:
        label = "API" if expected_type == "api" else "UI automation"
        raise HTTPException(status_code=422, detail=f"Only {label} cases are accepted")
    return test_cases.create_case(session, payload)


@router.post("/api-cases", status_code=status.HTTP_201_CREATED)
def create_api_case(
    payload: TestCaseCreate, session: Annotated[Session, Depends(get_session)]
) -> dict:
    return _create_automation_case(session, payload, "api")


@router.post("/api-cases/debug")
def debug_api_case(
    payload: ApiCaseDebugRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    return {
        "code": 200,
        "message": "Debug request completed",
        "data": api_runner.debug_api_case(
            session,
            payload,
            transport=getattr(request.app.state, "api_debug_transport", None),
        ),
    }


@router.post("/ui-cases", status_code=status.HTTP_201_CREATED)
def create_ui_case(
    payload: TestCaseCreate, session: Annotated[Session, Depends(get_session)]
) -> dict:
    return _create_automation_case(session, payload, "ui")


@router.post("/test-cases/export")
def export_test_cases(
    payload: TestCaseExportRequest,
    session: Annotated[Session, Depends(get_session)],
) -> StreamingResponse:
    exported = case_files.export_cases(session, payload)
    return StreamingResponse(
        iter([exported.content]),
        media_type=exported.media_type,
        headers={"Content-Disposition": f'attachment; filename="{exported.filename}"'},
    )


@router.post("/test-cases/import", status_code=status.HTTP_201_CREATED)
async def import_test_cases(
    file: Annotated[UploadFile, File()],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    content = await file.read(case_files.MAX_IMPORT_BYTES + 1)
    return case_files.import_cases(session, file.filename or "upload", content)


@router.put("/test-cases/{case_id}")
def update_test_case(
    case_id: int,
    payload: TestCaseUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    return test_cases.update_case(session, case_id, payload)


@router.delete("/test-cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_case(
    case_id: int, session: Annotated[Session, Depends(get_session)]
) -> Response:
    test_cases.delete_case(session, case_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
