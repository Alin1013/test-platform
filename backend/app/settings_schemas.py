"""系统设置模块的请求/响应模型：Webhook 连接测试。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WebhookTestRequest(BaseModel):
    """Webhook 测试请求：目标渠道与回调地址。"""

    model_config = ConfigDict(extra="forbid")

    channel: Literal["wechatWork", "feishu", "dingtalk"]
    webhookUrl: str = Field(min_length=1, max_length=2048)


class WebhookTestResponse(BaseModel):
    """Webhook 测试结果：成功与否及提示信息。"""

    success: bool
    message: str
