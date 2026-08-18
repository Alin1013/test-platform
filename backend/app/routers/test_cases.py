"""用例管理路由：模块树、用例增删改查、导入导出与自动化用例调试。"""

from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse, StreamingResponse
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
    TestModuleCreate,
    TestModuleUpdate,
)
from ..services import case_files, debug_runner, test_cases

router = APIRouter(prefix="/api/v1", tags=["test cases"])


@router.get("/modules")
def modules(
    session: Annotated[Session, Depends(get_session)],
    project_id: int = 1,
    module_type: str | None = None,
) -> list[dict]:
    """GET /modules：按项目与用例类型返回模块树。"""
    return test_cases.module_tree(session, project_id, module_type)


@router.post("/modules")
def create_module(
    payload: TestModuleCreate, session: Annotated[Session, Depends(get_session)]
) -> JSONResponse:
    """POST /modules：创建模块；已存在同名模块时返回 200 而非冲突。"""
    module, created = test_cases.create_module(session, payload)
    return JSONResponse(status_code=201 if created else 200, content=module)


@router.patch("/modules/{module_id}")
def update_module(
    module_id: str,
    payload: TestModuleUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """PATCH /modules/{id}：重命名或移动模块。"""
    return test_cases.update_module(session, module_id, payload)


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module(
    module_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> Response:
    """DELETE /modules/{id}：删除空模块。"""
    test_cases.delete_module(session, module_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/test-cases/filter-options")
def get_test_case_filter_options(
    session: Annotated[Session, Depends(get_session)],
    type: CaseType | None = None,
) -> dict:
    """GET /test-cases/filter-options：返回筛选下拉所需的选项。"""
    return test_cases.get_filter_options(session, case_type=type)


@router.get("/test-cases")
def list_test_cases(
    session: Annotated[Session, Depends(get_session)],
    type: CaseType | None = None,
    module_id: str | None = None,
    priority: Priority | None = None,
    status: CaseStatus | None = None,
    project_name: str | None = None,
    iteration: str | None = None,
    is_smoke: bool | None = None,
    keyword: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    """GET /test-cases：按多条件组合筛选并分页查询用例。"""
    return test_cases.list_cases(
        session,
        case_type=type,
        module_id=module_id,
        priority=priority,
        status=status,
        project_name=project_name,
        iteration=iteration,
        is_smoke=is_smoke,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )


@router.post("/test-cases", status_code=status.HTTP_201_CREATED)
def create_test_case(
    payload: TestCaseCreate, session: Annotated[Session, Depends(get_session)]
) -> dict:
    """POST /test-cases：创建功能用例。"""
    return test_cases.create_case(session, payload)


@router.post("/api-cases", status_code=status.HTTP_201_CREATED)
def create_api_case(
    payload: TestCaseCreate, session: Annotated[Session, Depends(get_session)]
) -> dict:
    """POST /api-cases：创建 API 自动化用例。"""
    return test_cases.create_automation_case(session, payload, "api")


@router.post("/api-cases/debug")
def debug_api_case(
    payload: ApiCaseDebugRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /api-cases/debug：API 用例即时调试。"""
    return {
        "code": 200,
        "message": "Debug request completed",
        "data": debug_runner.run_api(
            session,
            payload,
            transport=getattr(request.app.state, "api_debug_transport", None),
        ),
    }


@router.post("/ui-cases", status_code=status.HTTP_201_CREATED)
def create_ui_case(
    payload: TestCaseCreate, session: Annotated[Session, Depends(get_session)]
) -> dict:
    """POST /ui-cases：创建 UI 自动化用例。"""
    return test_cases.create_automation_case(session, payload, "ui")


@router.put("/api-cases/{case_id}")
def update_api_case(
    case_id: int,
    payload: TestCaseUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """PUT /api-cases/{id}：更新 API 自动化用例。"""
    return test_cases.update_automation_case(session, case_id, payload, "api")


@router.put("/ui-cases/{case_id}")
def update_ui_case(
    case_id: int,
    payload: TestCaseUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """PUT /ui-cases/{id}：更新 UI 自动化用例。"""
    return test_cases.update_automation_case(session, case_id, payload, "ui")


@router.post("/test-cases/export")
def export_test_cases(
    payload: TestCaseExportRequest,
    session: Annotated[Session, Depends(get_session)],
) -> StreamingResponse:
    """POST /test-cases/export：按筛选条件导出 CSV/XLSX 文件。"""
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
    module_id: str | None = Query(default=None),
) -> dict:
    """POST /test-cases/import：从 CSV/XLSX 文件导入用例。"""
    content = await file.read(case_files.MAX_IMPORT_BYTES + 1)
    return case_files.import_cases(session, file.filename or "upload", content, module_id=module_id)


@router.put("/test-cases/{case_id}")
def update_test_case(
    case_id: int,
    payload: TestCaseUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """PUT /test-cases/{id}：更新功能用例。"""
    return test_cases.update_case(session, case_id, payload)


@router.delete("/test-cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_case(
    case_id: int, session: Annotated[Session, Depends(get_session)]
) -> Response:
    """DELETE /test-cases/{id}：删除用例。"""
    test_cases.delete_case(session, case_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
