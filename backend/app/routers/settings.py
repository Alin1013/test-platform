"""系统设置路由：读取/替换全局配置并测试 Webhook。"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..schemas import SystemSettings
from ..services import settings, webhooks
from ..settings_schemas import WebhookTestRequest, WebhookTestResponse

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("", response_model=SystemSettings)
def get_system_settings(
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """GET /api/v1/settings：读取平台全局配置。"""
    return settings.get_settings(session)


@router.post("", response_model=SystemSettings)
def replace_system_settings(
    payload: SystemSettings, session: Annotated[Session, Depends(get_session)]
) -> dict:
    """POST /api/v1/settings：整体替换平台配置。"""
    return settings.replace_settings(session, payload)


@router.post("/test-webhook", response_model=WebhookTestResponse)
def test_webhook_connection(payload: WebhookTestRequest) -> dict:
    """POST /test-webhook：发送测试消息验证 Webhook 可用性。"""
    return webhooks.test_connection(payload)
