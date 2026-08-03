from typing import Literal

from pydantic import BaseModel, ConfigDict

from .schemas import CaseStatus, CaseType, Priority


class TestCaseExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["csv", "xlsx"] = "xlsx"
    type: CaseType | None = None
    module_id: str | None = None
    priority: Priority | None = None
    status: CaseStatus | None = None
    keyword: str | None = None
