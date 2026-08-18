"""XMind 路由：上传解析、异步生成任务、任务确认与导出。"""

import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..xmind_schemas import (
    XMindCaseUpdateRequest,
    XMindConfirmRequest,
    XMindExportRequest,
    XMindTaskConfirmRequest,
)
from ..services import xmind
from ..services import case_files
from ..services.xmind_skill import XMindGenerationError, XMindLLMUnavailable

router = APIRouter(prefix="/api/v1/xmind", tags=["xmind"])


@router.post("/upload-parse", status_code=status.HTTP_201_CREATED)
async def upload_and_parse_xmind(
    request: Request,
    file: Annotated[UploadFile, File()],
    uploader_id: Annotated[int, Form()] = 1,
    save_cases: Annotated[bool, Form()] = False,
    module_mapping: Annotated[str | None, Form()] = None,
    session: Session = Depends(get_session),
) -> dict:
    """上传 .xmind 文件并解析；save_cases 为真时按模块映射保存用例。"""
    original_name = file.filename or "upload.xmind"
    if not original_name.lower().endswith(".xmind"):
        raise HTTPException(status_code=415, detail="Only .xmind files are supported")
    content = await file.read(xmind.MAX_UPLOAD_BYTES + 1)
    parsed_mapping = None
    if save_cases:
        if not module_mapping:
            raise HTTPException(
                status_code=422, detail="module_mapping is required when save_cases is true"
            )
        try:
            parsed_mapping = json.loads(module_mapping)
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=422, detail="module_mapping must be valid JSON") from error
        if not isinstance(parsed_mapping, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in parsed_mapping.items()
        ):
            raise HTTPException(status_code=422, detail="module_mapping must be a string map")
    try:
        return xmind.save_upload(
            session,
            original_name=original_name,
            content=content,
            uploader_id=uploader_id,
            upload_dir=Path(request.app.state.upload_dir),
            module_mapping=parsed_mapping,
        )
    except xmind.XMindParseError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def create_xmind_generation_task(
    request: Request,
    file: Annotated[UploadFile, File()],
    uploader_id: Annotated[int, Form()] = 1,
    session: Session = Depends(get_session),
) -> dict:
    """上传 .xmind 并创建异步 AI 生成任务。"""
    original_name = file.filename or "upload.xmind"
    if not original_name.lower().endswith(".xmind"):
        raise HTTPException(status_code=415, detail="Only .xmind files are supported")
    content = await file.read(xmind.MAX_UPLOAD_BYTES + 1)
    try:
        return xmind.create_generation_task(
            session,
            original_name=original_name,
            content=content,
            uploader_id=uploader_id,
            upload_dir=Path(request.app.state.upload_dir),
        )
    except xmind.XMindParseError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/tasks")
def list_xmind_tasks(
    session: Session = Depends(get_session),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: str | None = None,
) -> dict:
    """GET /tasks：分页列出 XMind 生成任务。"""
    return xmind.list_generation_tasks(
        session,
        page=page,
        page_size=page_size,
        status=status,
    )


@router.get("/tasks/{task_id}")
def get_xmind_task(task_id: int, session: Session = Depends(get_session)) -> dict:
    """GET /tasks/{id}：查询单个生成任务详情。"""
    return xmind.get_generation_task(session, task_id)


@router.post("/tasks/{task_id}/retry")
def retry_xmind_task(task_id: int, session: Session = Depends(get_session)) -> dict:
    """POST /tasks/{id}/retry：重置失败任务并重新入队。"""
    return xmind.retry_generation_task(session, task_id)


@router.post("/tasks/{task_id}/cancel", status_code=status.HTTP_200_OK)
def cancel_xmind_task(task_id: int, session: Session = Depends(get_session)) -> dict:
    """POST /tasks/{id}/cancel：取消排队中或生成中的任务。"""
    return xmind.cancel_generation_task(session, task_id)


@router.patch("/tasks/{task_id}/cases/{case_id}")
def update_xmind_task_case(
    task_id: int,
    case_id: str,
    payload: XMindCaseUpdateRequest,
    session: Session = Depends(get_session),
) -> dict:
    """PATCH /tasks/{id}/cases/{caseId}：更新单条用例的审核状态、评价或字段。"""
    return xmind.update_xmind_task_case(session, task_id, case_id, payload)


@router.delete("/tasks/{task_id}/cases/{case_id}", status_code=status.HTTP_200_OK)
def delete_xmind_task_case(
    task_id: int,
    case_id: str,
    session: Session = Depends(get_session),
) -> dict:
    """DELETE /tasks/{id}/cases/{caseId}：删除单条用例。"""
    return xmind.delete_xmind_task_case(session, task_id, case_id)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_xmind_task(
    request: Request,
    task_id: int,
    session: Session = Depends(get_session),
) -> None:
    """DELETE /tasks/{id}：删除生成任务记录与上传文件；运行中的任务拒绝删除。"""
    # 上传文件与服务层函数签名一致，需要从应用状态中拿到上传目录。
    xmind.delete_generation_task(
        session,
        task_id,
        upload_dir=Path(request.app.state.upload_dir),
    )


@router.post("/tasks/{task_id}/confirm", status_code=status.HTTP_201_CREATED)
def confirm_xmind_task(
    task_id: int,
    payload: XMindTaskConfirmRequest,
    session: Session = Depends(get_session),
) -> dict:
    """POST /tasks/{id}/confirm：确认任务生成的用例并写入用例库。"""
    return xmind.confirm_generated_task(session, task_id, payload)


@router.post("/confirm", status_code=status.HTTP_201_CREATED)
def confirm_xmind_cases(
    payload: XMindConfirmRequest,
    session: Session = Depends(get_session),
) -> dict:
    """POST /confirm：直接确认一组生成的用例。"""
    return xmind.confirm_generated_cases(session, payload)


@router.post("/export")
def export_xmind_cases(payload: XMindExportRequest) -> StreamingResponse:
    """POST /export：把生成结果导出为文件流下载。"""
    exported = case_files.export_generated_cases(
        [case.model_dump(by_alias=True) for case in payload.cases]
    )
    return StreamingResponse(
        iter([exported.content]),
        media_type=exported.media_type,
        headers={"Content-Disposition": f'attachment; filename="{exported.filename}"'},
    )
