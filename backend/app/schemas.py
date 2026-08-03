from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


CaseType = Literal["functional", "api", "ui"]
Priority = Literal["P0", "P1", "P2", "P3"]
CaseStatus = Literal["维护中", "已通过", "草稿", "已失败", "已停用"]
HttpMethod = Literal["GET", "POST", "PUT", "DELETE"]


class ApiDetailsCreate(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    method: HttpMethod
    expected_code: int = Field(ge=100, le=599)
    headers: dict[str, Any] = Field(default_factory=dict)
    request_body: dict[str, Any] | list[Any] | None = None
    expected_response: dict[str, Any] | list[Any] | None = None


class ApiDetailsUpdate(BaseModel):
    url: str | None = Field(default=None, min_length=1, max_length=2048)
    method: HttpMethod | None = None
    expected_code: int | None = Field(default=None, ge=100, le=599)
    headers: dict[str, Any] | None = None
    request_body: dict[str, Any] | list[Any] | None = None
    expected_response: dict[str, Any] | list[Any] | None = None


class UiDetailsCreate(BaseModel):
    steps: list[dict[str, Any]] | list[str] = Field(default_factory=list)


class TestCaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str | None = Field(default=None, max_length=32)
    title: str = Field(min_length=1, max_length=255)
    type: CaseType
    module_id: str = Field(min_length=1, max_length=64)
    priority: Priority
    status: CaseStatus = "草稿"
    author_id: int = 1
    api_details: ApiDetailsCreate | None = None
    ui_details: UiDetailsCreate | None = None

    @model_validator(mode="after")
    def details_match_type(self) -> "TestCaseCreate":
        if self.type == "api" and self.api_details is None:
            raise ValueError("api_details is required for API cases")
        if self.type != "api" and self.api_details is not None:
            raise ValueError("api_details is only valid for API cases")
        if self.type != "ui" and self.ui_details is not None:
            raise ValueError("ui_details is only valid for UI cases")
        return self


class TestCaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=255)
    module_id: str | None = Field(default=None, min_length=1, max_length=64)
    priority: Priority | None = None
    status: CaseStatus | None = None
    author_id: int | None = None
    api_details: ApiDetailsUpdate | None = None
    ui_details: UiDetailsCreate | None = None


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=64)
    email: EmailStr
    department: str = Field(min_length=1, max_length=128)
    role: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=12, max_length=128)


class UserStatusUpdate(BaseModel):
    status: Literal["enabled", "disabled"]


class RolePermissionsUpdate(BaseModel):
    permissions: dict[str, bool]
