"""异常分析路由：文本分析、文件上传、历史查询与用户反馈。"""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy.orm import Session

from ..anomaly_schemas import (
    AnomalyAnalysisRequest,
    AnomalyAnalysisResponse,
    AnomalyFeedbackRequest,
    AnomalyFileRequest,
    AnomalyHistoryResponse,
)
from ..dependencies import get_current_user, get_session
from ..models import User
from ..services import anomaly_analysis


router = APIRouter(prefix="/api/v1/ai/anomaly", tags=["ai anomaly analysis"])


@router.post("/analyze", response_model=AnomalyAnalysisResponse)
async def analyze_text(
    payload: AnomalyAnalysisRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /analyze：分析粘贴文本或测试执行上下文。"""
    if not payload.content.strip() and not payload.context:
        raise HTTPException(status_code=422, detail="请提供异常文本或测试执行上下文")
    prepared = anomaly_analysis.prepare_text(payload.content or json.dumps(payload.context, ensure_ascii=False))
    return await anomaly_analysis.analyze(
        session,
        user=user,
        payload=payload,
        prepared=prepared,
        llm_transport=getattr(request.app.state, "xmind_llm_transport", None),
    )


@router.post("/upload", response_model=AnomalyAnalysisResponse)
async def analyze_upload(
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    file: Annotated[UploadFile, File()],
    source_type: Annotated[str, Form()] = "FILE",
    source_id: Annotated[str | None, Form()] = None,
    context_json: Annotated[str, Form()] = "{}",
    additional_description: Annotated[str, Form()] = "",
) -> dict:
    """POST /upload：分析日志/文本文件或多模态截图。"""
    try:
        context = json.loads(context_json or "{}")
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=422, detail="context_json 必须是合法 JSON") from error
    if not isinstance(context, dict):
        raise HTTPException(status_code=422, detail="context_json 必须是对象")
    try:
        payload = AnomalyFileRequest(
            sourceType=source_type,
            sourceId=source_id,
            context=context,
            additionalDescription=additional_description,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    prepared = await anomaly_analysis.prepare_upload(file, payload.sourceType)
    return await anomaly_analysis.analyze(
        session,
        user=user,
        payload=payload,
        prepared=prepared,
        llm_transport=getattr(request.app.state, "xmind_llm_transport", None),
    )


@router.get("/history", response_model=AnomalyHistoryResponse)
def history(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    """GET /history：分页读取当前用户的分析记录。"""
    return anomaly_analysis.list_history(session, user=user, page=page, page_size=page_size)


@router.patch("/history/{analysis_id}/feedback", response_model=AnomalyAnalysisResponse)
def feedback(
    analysis_id: int,
    payload: AnomalyFeedbackRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """PATCH /history/{id}/feedback：保存“有帮助/没帮助”反馈。"""
    return anomaly_analysis.update_feedback(
        session, user=user, analysis_id=analysis_id, helpful=payload.helpful
    )
