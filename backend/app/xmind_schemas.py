"""XMind 相关的请求模型：确认生成结果、任务确认与导出。"""

from pydantic import BaseModel, ConfigDict, Field

from .services.xmind_skill import GeneratedFunctionalCase, MAX_GENERATED_CASES


class XMindConfirmRequest(BaseModel):
    """确认 XMind 生成的用例：上传者、模块映射与用例列表。"""

    model_config = ConfigDict(extra="forbid")

    uploader_id: int = Field(default=1, gt=0)
    module_mapping: dict[str, str] = Field(min_length=1, max_length=200)
    cases: list[GeneratedFunctionalCase] = Field(
        min_length=1,
        max_length=MAX_GENERATED_CASES,
    )


class XMindTaskConfirmRequest(BaseModel):
    """确认异步 XMind 任务：仅需模块映射，用例从任务结果读取。"""

    model_config = ConfigDict(extra="forbid")

    module_mapping: dict[str, str] = Field(min_length=1, max_length=200)


class XMindExportRequest(BaseModel):
    """导出 XMind 文件：携带已生成的用例列表。"""

    model_config = ConfigDict(extra="forbid")

    cases: list[GeneratedFunctionalCase] = Field(
        min_length=1,
        max_length=MAX_GENERATED_CASES,
    )
