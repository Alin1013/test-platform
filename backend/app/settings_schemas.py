from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WebhookTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channel: Literal["wechatWork", "feishu", "dingtalk"]
    webhookUrl: str = Field(min_length=1, max_length=2048)


class WebhookTestResponse(BaseModel):
    success: bool
    message: str
