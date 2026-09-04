"""异常分析 API 的请求、结果和历史记录模型。"""

import json
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


AnomalySourceType = Literal["TEXT", "LOG", "SCREENSHOT", "FILE", "EXECUTION"]
AnalysisStatus = Literal["COMPLETED", "FAILED"]
Severity = Literal["HIGH", "MEDIUM", "LOW", "UNKNOWN"]
CONTEXT_MAX_CHARS = 20_000


class AnomalyAnalysisRequest(BaseModel):
    """文本/执行上下文分析请求；内容上限对应 MVP 的 100 KB 发送预算。"""

    model_config = ConfigDict(extra="forbid")

    sourceType: AnomalySourceType = "TEXT"
    sourceId: str | None = Field(default=None, max_length=128)
    content: str = Field(default="", max_length=100_000)
    context: dict[str, Any] = Field(default_factory=dict)
    additionalDescription: str = Field(default="", max_length=4_000)

    @field_validator("context")
    @classmethod
    def validate_context_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        """限制 JSON 上下文体积，防止执行响应或恶意嵌套对象耗尽分析预算。"""
        try:
            serialized = json.dumps(value, ensure_ascii=False, default=str)
        except (TypeError, ValueError) as error:
            raise ValueError("context 必须是可序列化的 JSON 对象") from error
        if len(serialized) > CONTEXT_MAX_CHARS:
            raise ValueError("context 超过 20,000 字符限制，请截取关键执行信息后重试")
        return value


class AnomalyFileRequest(BaseModel):
    """文件/截图上传的结构化表单字段。"""

    model_config = ConfigDict(extra="forbid")

    sourceType: Literal["SCREENSHOT", "FILE", "LOG"] = "FILE"
    sourceId: str | None = Field(default=None, max_length=128)
    context: dict[str, Any] = Field(default_factory=dict)
    additionalDescription: str = Field(default="", max_length=4_000)

    @field_validator("context")
    @classmethod
    def validate_context_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        """限制上传分析携带的上下文体积，与文本分析入口保持相同安全边界。"""
        try:
            serialized = json.dumps(value, ensure_ascii=False, default=str)
        except (TypeError, ValueError) as error:
            raise ValueError("context 必须是可序列化的 JSON 对象") from error
        if len(serialized) > CONTEXT_MAX_CHARS:
            raise ValueError("context 超过 20,000 字符限制，请截取关键执行信息后重试")
        return value


class PossibleCause(BaseModel):
    """单条可能原因及其证据。"""

    model_config = ConfigDict(extra="ignore")

    cause: str = Field(default="未知原因", max_length=1_000)
    level: Severity = "UNKNOWN"
    evidence: str = Field(default="", max_length=2_000)

    @field_validator("level", mode="before")
    @classmethod
    def normalize_level(cls, value: object) -> object:
        """兼容模型返回的中文等级，统一为接口约定的英文枚举。"""
        return {"高": "HIGH", "中": "MEDIUM", "低": "LOW", "未知": "UNKNOWN"}.get(value, value)


class AnomalyResult(BaseModel):
    """模型必须返回的结构化异常分析结果。"""

    model_config = ConfigDict(extra="ignore")

    summary: str = Field(default="未能生成异常摘要", max_length=2_000)
    category: str = Field(default="UNKNOWN", max_length=128)
    severity: Severity = "UNKNOWN"
    possibleCauses: list[PossibleCause] = Field(default_factory=list, max_length=20)
    analysisBasis: list[str] = Field(default_factory=list, max_length=30)
    suggestions: list[str] = Field(default_factory=list, max_length=30)
    solutions: list[str] = Field(default_factory=list, max_length=30)
    verification: list[str] = Field(default_factory=list, max_length=30)
    requiredInformation: list[str] = Field(default_factory=list, max_length=20)
    risk: Literal["HIGH", "MEDIUM", "LOW", "NONE"] = "NONE"

    @field_validator("severity", mode="before")
    @classmethod
    def normalize_severity(cls, value: object) -> object:
        """将模型可能输出的中文严重程度转换为稳定枚举。"""
        return {"高": "HIGH", "中": "MEDIUM", "低": "LOW", "未知": "UNKNOWN"}.get(value, value)

    @field_validator("risk", mode="before")
    @classmethod
    def normalize_risk(cls, value: object) -> object:
        """将模型可能输出的中文风险等级转换为稳定枚举。"""
        return {"高": "HIGH", "中": "MEDIUM", "低": "LOW", "无": "NONE"}.get(value, value)


class AnomalyAnalysisResponse(AnomalyResult):
    """异常分析接口和历史列表共用的响应模型。"""

    analysisId: int
    sourceType: AnomalySourceType
    sourceId: str | None = None
    status: AnalysisStatus
    createdAt: datetime
    helpful: bool | None = None
    modelName: str | None = None


class AnomalyFeedbackRequest(BaseModel):
    """用户对分析结果的帮助程度反馈。"""

    model_config = ConfigDict(extra="forbid")

    helpful: bool


class AnomalyHistoryResponse(BaseModel):
    """分页历史响应，保持与平台其余列表接口一致。"""

    items: list[AnomalyAnalysisResponse]
    total: int
    page: int
    pageSize: int
