"""XMind 相关的请求模型：确认生成结果、任务确认与导出。"""
from typing import Literal

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
    """确认异步 XMind 任务：仅需目标模块，所有通过的用例统一入库到该模块。"""

    model_config = ConfigDict(extra="forbid")

    module_id: str = Field(min_length=1, max_length=64)


class XMindExportRequest(BaseModel):
    """导出 XMind 文件：携带已生成的用例列表。"""

    model_config = ConfigDict(extra="forbid")

    cases: list[GeneratedFunctionalCase] = Field(
        min_length=1,
        max_length=MAX_GENERATED_CASES,
    )


# ===== 用例审核：单条用例编辑 / 审核状态 =====
# 审核状态取值：pending 待审核、passed 通过、needs_modification 待修改
# 合并时仅取 passed 的用例写入正式用例库。
# 审核字段以驼峰命名与预览用例 JSON 中的中文字段风格保持一致，前端直接以驼峰提交。
XMindCaseReviewStatus = Literal["pending", "passed", "needs_modification"]


class XMindCaseUpdateRequest(BaseModel):
    """单条用例更新请求：所有字段可选，仅提交需要修改的字段。"""

    model_config = ConfigDict(extra="forbid")

    reviewStatus: XMindCaseReviewStatus | None = None
    reviewNote: str | None = Field(default=None, max_length=2000)
    用例目录: str | None = Field(default=None, max_length=200)
    用例名称: str | None = Field(default=None, max_length=200)
    需求ID: str | None = Field(default=None, max_length=200)
    前置条件: str | None = Field(default=None, max_length=2000)
    用例等级: str | None = None
    归属迭代: str | None = Field(default=None, max_length=200)
    用例步骤: str | None = Field(default=None, max_length=8000)
    预期结果: str | None = Field(default=None, max_length=8000)
