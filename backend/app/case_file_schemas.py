"""用例文件导出的请求模型：支持按类型/模块/优先级/状态/关键字筛选。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from .schemas import CaseStatus, CaseType, Priority


class TestCaseExportRequest(BaseModel):
    """导出请求：format 指定 CSV 或 XLSX，其余字段为可选筛选条件。"""

    model_config = ConfigDict(extra="forbid")

    format: Literal["csv", "xlsx"] = "xlsx"
    type: CaseType | None = None
    module_id: str | None = None
    priority: Priority | None = None
    status: CaseStatus | None = None
    keyword: str | None = None
