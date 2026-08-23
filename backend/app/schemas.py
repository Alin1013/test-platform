"""核心 Pydantic 模型：用例、模块、执行配置与系统设置的类型定义与校验。"""

import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

CaseType = Literal["functional", "api", "ui"]
# 用例类型：功能 / API / UI。
Priority = Literal["P0", "P1", "P2", "P3"]
# 优先级：P0 最高，P3 最低。
CaseStatus = Literal["维护中", "已通过", "草稿", "已失败", "已停用"]
# 用例状态。
HttpMethod = Literal["GET", "POST", "PUT", "DELETE"]
# API 用例支持的 HTTP 方法。
UiAction = Literal["click", "input", "navigate", "hover", "wait", "assert"]
# UI 用例支持的步骤动作。
UiLocatorType = Literal["", "xpath", "css", "id", "text"]
# UI 元素定位器类型。
UiAssertion = Literal["none", "textEquals", "isVisible", "urlEquals"]
# UI 断言类型。
ApiBodyType = Literal["none", "json", "form-data", "x-www-form-urlencoded"]
# API 请求体类型。
ApiAssertionType = Literal["statusCode", "jsonPath", "responseTime"]
# API 断言类型。
ApiComparison = Literal["equals", "contains", "notNull"]
# API 断言比较方式。


class ApiKeyValueItem(BaseModel):
    """API 请求的键值对：可开关、key 与 value。"""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    key: str = Field(max_length=255)
    value: str = Field(max_length=4000)


class ApiResponseAssertion(BaseModel):
    """API 响应断言：类型、取值表达式、比较方式与期望值。"""

    model_config = ConfigDict(extra="forbid")

    type: ApiAssertionType
    target: str = Field(default="", max_length=2048)
    comparison: ApiComparison = "equals"
    expected: str = Field(default="", max_length=4000)


class ApiExtractVariable(BaseModel):
    """从响应中提取变量的声明：名称与 JSONPath。"""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")
    jsonPath: str = Field(min_length=1, max_length=2048, pattern=r"^\$")


def _normalize_legacy_automation_config(data: Any) -> Any:
    """兼容旧版自动化配置：把 expected_response.automation_config 提升到顶层。"""
    if not isinstance(data, dict):
        return data
    normalized = dict(data)
    expected_response = normalized.get("expected_response")
    if not isinstance(expected_response, dict):
        return normalized
    automation_config = expected_response.get("automation_config")
    if not isinstance(automation_config, dict):
        return normalized

    for field in ("query_params", "body_type", "body_fields", "assertions", "extracts"):
        if field not in normalized and field in automation_config:
            normalized[field] = automation_config[field]
    if (
        "body_content" not in normalized
        and normalized.get("body_type") == "json"
        and normalized.get("request_body") is not None
    ):
        normalized["body_content"] = json.dumps(
            normalized["request_body"], ensure_ascii=False
        )
    return normalized


class ApiDetailsCreate(BaseModel):
    """API 用例详情（创建）：URL、方法、请求体、断言与提取变量。"""

    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, max_length=2048)
    method: HttpMethod
    expected_code: int = Field(ge=100, le=599)
    headers: dict[str, Any] = Field(default_factory=dict)
    query_params: list[ApiKeyValueItem] = Field(default_factory=list, max_length=100)
    body_type: ApiBodyType = "none"
    body_content: str | None = Field(default=None, max_length=1_000_000)
    body_fields: list[ApiKeyValueItem] = Field(default_factory=list, max_length=100)
    request_body: dict[str, Any] | list[Any] | None = None
    expected_response: dict[str, Any] | list[Any] | None = None
    assertions: list[ApiResponseAssertion] = Field(default_factory=list, max_length=100)
    extracts: list[ApiExtractVariable] = Field(default_factory=list, max_length=100)

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_config(cls, data: Any) -> Any:
        return _normalize_legacy_automation_config(data)


class ApiDetailsUpdate(BaseModel):
    """API 用例详情（更新）：所有字段可空，仅更新提供的字段。"""

    model_config = ConfigDict(extra="forbid")

    url: str | None = Field(default=None, min_length=1, max_length=2048)
    method: HttpMethod | None = None
    expected_code: int | None = Field(default=None, ge=100, le=599)
    headers: dict[str, Any] | None = None
    query_params: list[ApiKeyValueItem] | None = Field(default=None, max_length=100)
    body_type: ApiBodyType | None = None
    body_content: str | None = Field(default=None, max_length=1_000_000)
    body_fields: list[ApiKeyValueItem] | None = Field(default=None, max_length=100)
    request_body: dict[str, Any] | list[Any] | None = None
    expected_response: dict[str, Any] | list[Any] | None = None
    assertions: list[ApiResponseAssertion] | None = Field(default=None, max_length=100)
    extracts: list[ApiExtractVariable] | None = Field(default=None, max_length=100)

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_config(cls, data: Any) -> Any:
        return _normalize_legacy_automation_config(data)


class ApiCaseDebugRequest(ApiDetailsCreate):
    """API 调试请求：在详情基础上追加环境与运行时变量。"""

    environment: str | None = Field(
        default=None, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    )
    variables: dict[str, str] = Field(default_factory=dict, max_length=100)


class TestModuleCreate(BaseModel):
    """模块创建：名称、父模块、所属项目与用例类型。"""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=128)
    parent_id: str | None = Field(default=None, max_length=64)
    project_id: int = Field(default=1, gt=0)
    module_type: str = Field(min_length=1, max_length=16)


class TestModuleUpdate(BaseModel):
    """模块更新：仅支持重命名。"""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=128)


class UiStep(BaseModel):
    """UI 用例步骤：动作、定位器、输入值与断言。"""

    model_config = ConfigDict(extra="forbid")

    stepIndex: int | None = Field(default=None, ge=1)
    action: UiAction
    locatorType: UiLocatorType
    target: str = Field(default="", max_length=2048)
    value: str = Field(default="", max_length=4000)
    assertion: UiAssertion = "none"
    expected: str = Field(default="", max_length=4000)

    @model_validator(mode="before")
    @classmethod
    def normalize_design_step(cls, data: Any) -> Any:
        """兼容设计稿格式：selector 映射到 target，动作/定位器别名归一化。"""
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if "selector" in normalized and "target" not in normalized:
            normalized["target"] = normalized.pop("selector")
        action_aliases = {
            "OpenUrl": "navigate",
            "Input": "input",
            "Click": "click",
            "Hover": "hover",
            "Wait": "wait",
            "AssertText": "assert",
        }
        original_action = normalized.get("action")
        normalized["action"] = action_aliases.get(original_action, original_action)
        locator_aliases = {
            "XPath": "xpath",
            "CSS Selector": "css",
            "ID": "id",
            "Text": "text",
        }
        original_locator = normalized.get("locatorType")
        normalized["locatorType"] = locator_aliases.get(
            original_locator, original_locator
        )
        if original_action == "AssertText":
            normalized.setdefault("assertion", "textEquals")
            normalized.setdefault("expected", normalized.get("value", ""))
        return normalized

    @model_validator(mode="after")
    def assert_action_requires_assertion(self) -> "UiStep":
        """断言动作必须显式指定断言类型。"""
        if self.action == "assert" and self.assertion == "none":
            raise ValueError("Assert steps must specify an assertion")
        return self


class UiDetailsCreate(BaseModel):
    """UI 用例详情：浏览器、环境、超时与步骤列表。"""

    model_config = ConfigDict(extra="forbid")

    description: str = Field(default="", max_length=4000)
    dependency_case_id: int | None = Field(default=None, gt=0)
    browser: Literal["chrome", "firefox"] = "chrome"
    environment: str = Field(
        default="test", min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    )
    timeout_seconds: int = Field(default=30, ge=1, le=3600)
    retry_count: int = Field(default=1, ge=0, le=3)
    steps: list[UiStep] = Field(default_factory=list)


class UiCaseDebugRequest(BaseModel):
    """UI 调试请求：环境、变量、浏览器参数与步骤。"""

    model_config = ConfigDict(extra="forbid")

    environment: str = Field(
        default="test", min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    )
    variables: dict[str, str] = Field(default_factory=dict, max_length=100)
    browser: Literal["chrome", "firefox", "safari", "edge"] = "chrome"
    headless: bool = True
    timeout_seconds: int = Field(default=30, ge=1, le=3600)
    steps: list[UiStep] = Field(min_length=1, max_length=200)


class ApiDebugRunRequest(BaseModel):
    """API 调试运行请求（判别联合的一支）。"""

    model_config = ConfigDict(extra="forbid")

    type: Literal["API"]
    config: ApiCaseDebugRequest


class UiDebugRunRequest(BaseModel):
    """UI 调试运行请求（判别联合的一支）。"""

    model_config = ConfigDict(extra="forbid")

    type: Literal["UI"]
    config: UiCaseDebugRequest


DebugRunRequest = Annotated[
    ApiDebugRunRequest | UiDebugRunRequest,
    Field(discriminator="type"),
]


class TestCaseCreate(BaseModel):
    """用例创建：公共字段 + 按类型携带 API/UI 详情。"""

    model_config = ConfigDict(extra="forbid")

    code: str | None = Field(default=None, max_length=32)
    title: str = Field(min_length=1, max_length=255)
    type: CaseType
    module_id: str = Field(min_length=1, max_length=64)
    priority: Priority
    status: CaseStatus = "草稿"
    author_id: int = 1
    requirement_id: str | None = Field(default=None, max_length=128)
    precondition: str = Field(default="", max_length=10000)
    test_steps: str = Field(default="", max_length=10000)
    expected_result: str = Field(default="", max_length=10000)
    iteration: str = Field(default="", max_length=128)
    is_smoke: bool = False
    api_details: ApiDetailsCreate | None = None
    ui_details: UiDetailsCreate | None = None

    @model_validator(mode="after")
    def details_match_type(self) -> "TestCaseCreate":
        """校验详情与用例类型匹配：API 必须有 api_details，UI 的 ui_details 互斥。"""
        if self.type == "api" and self.api_details is None:
            raise ValueError("api_details is required for API cases")
        if self.type != "api" and self.api_details is not None:
            raise ValueError("api_details is only valid for API cases")
        if self.type != "ui" and self.ui_details is not None:
            raise ValueError("ui_details is only valid for UI cases")
        return self


class TestCaseUpdate(BaseModel):
    """用例更新：所有字段可空，仅更新提供的字段。"""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=255)
    module_id: str | None = Field(default=None, min_length=1, max_length=64)
    priority: Priority | None = None
    status: CaseStatus | None = None
    author_id: int | None = None
    requirement_id: str | None = Field(default=None, max_length=128)
    precondition: str | None = Field(default=None, max_length=10000)
    test_steps: str | None = Field(default=None, max_length=10000)
    expected_result: str | None = Field(default=None, max_length=10000)
    iteration: str | None = Field(default=None, max_length=128)
    is_smoke: bool | None = None
    api_details: ApiDetailsUpdate | None = None
    ui_details: UiDetailsCreate | None = None


class UiExecutionCreate(BaseModel):
    """UI 执行创建：项目、套件、环境、浏览器与并发数。"""

    model_config = ConfigDict(extra="forbid")

    projectId: int = Field(gt=0)
    suiteIds: list[int] = Field(min_length=1, max_length=100)
    environment: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    browser: Literal["chrome", "firefox", "safari", "edge"]
    headless: bool = True
    concurrency: int = Field(default=1, ge=1, le=20)

    @model_validator(mode="after")
    def suites_are_unique(self) -> "UiExecutionCreate":
        """套件 ID 列表不允许重复。"""
        if len(self.suiteIds) != len(set(self.suiteIds)):
            raise ValueError("suiteIds must be unique")
        return self


class ApiExecutionCreate(BaseModel):
    """API 执行创建：项目、套件、环境标识、全局头、迭代与压测参数。"""

    model_config = ConfigDict(extra="forbid")

    projectId: int = Field(gt=0)
    suiteIds: list[int] = Field(min_length=1, max_length=100)
    environment: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    globalHeaders: dict[str, str] = Field(default_factory=dict)
    iterations: int = Field(default=1, ge=1, le=100)
    rampUpTime: int = Field(default=0, ge=0, le=60000)

    @model_validator(mode="after")
    def suites_are_unique(self) -> "ApiExecutionCreate":
        """套件 ID 列表不允许重复。"""
        if len(self.suiteIds) != len(set(self.suiteIds)):
            raise ValueError("suiteIds must be unique")
        return self


class UiExecutionConfig(BaseModel):
    """UI 执行配置：浏览器、无头模式与并发数。"""

    model_config = ConfigDict(extra="forbid")

    browser: Literal["chrome", "firefox", "safari", "edge"]
    headless: bool = True
    concurrency: int = Field(default=1, ge=1, le=20)


class ApiExecutionConfig(BaseModel):
    """API 执行配置：全局头、变量、迭代、压测与并发。"""

    model_config = ConfigDict(extra="forbid")

    globalHeaders: dict[str, str] = Field(default_factory=dict)
    variables: dict[str, str] = Field(default_factory=dict, max_length=100)
    iterations: int = Field(default=1, ge=1, le=100)
    rampUpTime: int = Field(default=0, ge=0, le=60000)
    concurrency: int = Field(default=1, ge=1, le=20)


class ExecutionStartRequest(BaseModel):
    """通用执行启动请求：按 type 区分 UI/API，并携带对应配置。"""

    model_config = ConfigDict(extra="forbid")

    type: Literal["UI", "API"]
    projectId: int = Field(gt=0)
    caseIds: list[int] = Field(min_length=1, max_length=100)
    envName: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    config: UiExecutionConfig | ApiExecutionConfig

    @model_validator(mode="after")
    def config_matches_type(self) -> "ExecutionStartRequest":
        """校验配置类型与执行类型一致，且用例 ID 不重复。"""
        expected_config = UiExecutionConfig if self.type == "UI" else ApiExecutionConfig
        if not isinstance(self.config, expected_config):
            raise ValueError(f"config does not match execution type {self.type}")
        if len(self.caseIds) != len(set(self.caseIds)):
            raise ValueError("caseIds must be unique")
        return self


class UserCreate(BaseModel):
    """人员管理：新建用户请求。"""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=64)
    email: EmailStr
    department: str = Field(min_length=1, max_length=128)
    role: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class UserStatusUpdate(BaseModel):
    """用户启停请求。"""

    status: Literal["enabled", "disabled"]


class UserRoleUpdate(BaseModel):
    """用户角色调整请求；角色名称必须指向已配置的角色。"""

    model_config = ConfigDict(extra="forbid")

    role: str = Field(min_length=1, max_length=64)


class RolePermissionsUpdate(BaseModel):
    """角色权限整体替换请求。"""

    permissions: dict[str, bool]


class RoleCreate(BaseModel):
    """角色配置：创建角色时只要求唯一名称，权限默认由服务层初始化。"""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=64)


class RoleUpdate(BaseModel):
    """角色配置：修改角色展示名称，不改变已保存的权限位。"""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=64)


class SettingsModel(BaseModel):
    """设置分组的公共基类：禁止多余字段。"""

    model_config = ConfigDict(extra="forbid")


class GeneralSettings(SettingsModel):
    """通用设置：平台名称、公告与用例编号前缀。"""

    platformName: str = Field(min_length=1, max_length=40)
    announcement: str = Field(max_length=500)
    caseNumberPrefix: str = Field(pattern=r"^[A-Za-z0-9_-]+$", max_length=16)


class TestEnvironment(SettingsModel):
    """执行环境：id、展示名与 baseUrl。"""

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=32)
    baseUrl: str = Field(min_length=1, max_length=2048, pattern=r"^https?://")


class ExecutionSettings(SettingsModel):
    """执行设置：环境列表、默认环境、重试与超时。"""

    environments: list[TestEnvironment] = Field(min_length=1, max_length=32)
    defaultEnvironmentId: str = Field(min_length=1, max_length=64)
    retryCount: int = Field(ge=0, le=3)
    apiTimeoutMs: int = Field(ge=1000, le=300000)

    @model_validator(mode="after")
    def default_environment_exists(self) -> "ExecutionSettings":
        """校验环境 id/名称唯一且默认环境存在。"""
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
    """通知设置：三类 Webhook 地址（允许为空）。"""

    wechatWork: str = Field(max_length=2048, pattern=r"^$|^https?://")
    feishu: str = Field(max_length=2048, pattern=r"^$|^https?://")
    dingtalk: str = Field(max_length=2048, pattern=r"^$|^https?://")


class AiSettings(SettingsModel):
    """AI 设置：API Key、Base URL 与默认模型。"""

    apiKey: str = Field(max_length=4096)
    baseUrl: str = Field(min_length=1, max_length=2048, pattern=r"^https?://")
    defaultModel: str = Field(min_length=1, max_length=128)


class SystemSettings(SettingsModel):
    """系统设置聚合：通用、执行、通知与 AI 四组配置。"""

    general: GeneralSettings
    execution: ExecutionSettings
    notifications: NotificationSettings
    ai: AiSettings
