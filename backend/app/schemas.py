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
    password: str = Field(min_length=8, max_length=128)


class UserStatusUpdate(BaseModel):
    status: Literal["enabled", "disabled"]


class RolePermissionsUpdate(BaseModel):
    permissions: dict[str, bool]


class SettingsModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GeneralSettings(SettingsModel):
    platformName: str = Field(min_length=1, max_length=40)
    announcement: str = Field(max_length=500)
    caseNumberPrefix: str = Field(pattern=r"^[A-Za-z0-9_-]+$", max_length=16)


class TestEnvironment(SettingsModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=32)
    baseUrl: str = Field(min_length=1, max_length=2048, pattern=r"^https?://")


class ExecutionSettings(SettingsModel):
    environments: list[TestEnvironment] = Field(min_length=1, max_length=32)
    defaultEnvironmentId: str = Field(min_length=1, max_length=64)
    retryCount: int = Field(ge=0, le=3)
    apiTimeoutMs: int = Field(ge=1000, le=300000)

    @model_validator(mode="after")
    def default_environment_exists(self) -> "ExecutionSettings":
        environment_ids = [environment.id for environment in self.environments]
        if len(environment_ids) != len(set(environment_ids)):
            raise ValueError("environment ids must be unique")
        environment_names = [environment.name.casefold() for environment in self.environments]
        if len(environment_names) != len(set(environment_names)):
            raise ValueError("environment names must be unique")
        if self.defaultEnvironmentId not in environment_ids:
            raise ValueError("defaultEnvironmentId must reference an environment")
        return self


class NotificationSettings(SettingsModel):
    wechatWork: str = Field(max_length=2048, pattern=r"^$|^https?://")
    feishu: str = Field(max_length=2048, pattern=r"^$|^https?://")
    dingtalk: str = Field(max_length=2048, pattern=r"^$|^https?://")


class AiSettings(SettingsModel):
    apiKey: str = Field(max_length=4096)
    baseUrl: str = Field(min_length=1, max_length=2048, pattern=r"^https?://")
    defaultModel: str = Field(min_length=1, max_length=128)


class SystemSettings(SettingsModel):
    general: GeneralSettings
    execution: ExecutionSettings
    notifications: NotificationSettings
    ai: AiSettings
