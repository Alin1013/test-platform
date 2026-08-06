"""将 XMind 节点树生成并规范化为功能测试用例预览。"""

import asyncio
import json
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, ValidationError

STANDARD_HEADERS = (
    "用例目录",
    "用例名称",
    "需求ID",
    "前置条件",
    "用例类型",
    "用例状态",
    "用例等级",
    "创建人",
    "归属迭代",
    "用例步骤",
    "预期结果",
)

MAX_ATTEMPTS = 3
MAX_GENERATED_CASES = 5000
DEFAULT_MAX_CONCURRENCY = 4
DEFAULT_RETRY_DELAY_SECONDS = 0.2

SYSTEM_PROMPT = """你是一名资深软件测试专家，负责把 XMind 功能节点拆解成高覆盖率的功能测试用例。

请在内部分析需求，不要输出思维链、解释或 Markdown。每个功能点至少生成一个正向流程和一个逆向、边界或异常测试点；覆盖非空校验、特殊字符、重复提交、网络异常、权限越界等适用场景。

只生成功能测试用例，不生成接口自动化或 UI 自动化配置，不猜测 URL、HTTP 方法和状态码。用例步骤和预期结果必须使用编号格式（1.、2.、3.）。用例目录必须使用给定的 XMind 目录路径。

必须返回一个 JSON 对象，格式为 {"cases": [...]}。数组中的每个对象只能包含以下 11 个中文字段：
用例目录、用例名称、需求ID、前置条件、用例类型、用例状态、用例等级、创建人、归属迭代、用例步骤、预期结果。
"""


class XMindSkillError(ValueError):
    """模型响应无法满足生成 Skill 的业务契约。"""


class XMindLLMUnavailable(XMindSkillError):
    """平台没有可用的模型配置。"""


class XMindGenerationError(XMindSkillError):
    """所有分组均未能在重试上限内完成生成。"""


class GeneratedFunctionalCase(BaseModel):
    """LLM 输出与 XLSX 导出的单条功能用例。"""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )

    directory: str = Field(
        default="",
        max_length=1000,
        validation_alias=AliasChoices("用例目录", "directory"),
        serialization_alias="用例目录",
    )
    name: str = Field(
        default="",
        max_length=255,
        validation_alias=AliasChoices("用例名称", "name", "title"),
        serialization_alias="用例名称",
    )
    requirement_id: str = Field(
        default="",
        max_length=128,
        validation_alias=AliasChoices("需求ID", "requirement_id"),
        serialization_alias="需求ID",
    )
    precondition: str = Field(
        default="",
        max_length=10000,
        validation_alias=AliasChoices("前置条件", "precondition"),
        serialization_alias="前置条件",
    )
    case_type: str = Field(
        default="",
        max_length=32,
        validation_alias=AliasChoices("用例类型", "case_type", "type"),
        serialization_alias="用例类型",
    )
    status: str = Field(
        default="",
        max_length=32,
        validation_alias=AliasChoices("用例状态", "status"),
        serialization_alias="用例状态",
    )
    priority: str = Field(
        default="",
        max_length=8,
        validation_alias=AliasChoices("用例等级", "priority", "level"),
        serialization_alias="用例等级",
    )
    creator: str = Field(
        default="",
        max_length=64,
        validation_alias=AliasChoices("创建人", "creator"),
        serialization_alias="创建人",
    )
    iteration: str = Field(
        default="",
        max_length=128,
        validation_alias=AliasChoices("归属迭代", "iteration"),
        serialization_alias="归属迭代",
    )
    steps: str = Field(
        default="",
        max_length=10000,
        validation_alias=AliasChoices("用例步骤", "steps", "test_steps"),
        serialization_alias="用例步骤",
    )
    expected_result: str = Field(
        default="",
        max_length=10000,
        validation_alias=AliasChoices("预期结果", "expected_result"),
        serialization_alias="预期结果",
    )


class LLMClient(Protocol):
    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        model: str,
        base_url: str,
        api_key: str,
    ) -> str:
        """Return the assistant message content as text."""


class OpenAICompatibleClient:
    """调用 OpenAI、DeepSeek、Qwen 等兼容 Chat Completions 的模型端点。"""

    def __init__(
        self,
        *,
        transport: httpx.BaseTransport | httpx.AsyncBaseTransport | None = None,
        timeout_seconds: float = 90,
    ) -> None:
        self.transport = transport
        self.timeout_seconds = timeout_seconds

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        model: str,
        base_url: str,
        api_key: str,
    ) -> str:
        endpoint = f"{base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": model,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        headers = {"Authorization": f"Bearer {api_key}"}
        try:
            async with httpx.AsyncClient(
                transport=self.transport,
                timeout=self.timeout_seconds,
            ) as client:
                response = await client.post(endpoint, headers=headers, json=payload)
        except httpx.HTTPError as error:
            raise XMindSkillError("LLM 请求失败") from error
        if response.status_code >= 400:
            raise XMindSkillError("LLM 服务返回错误")
        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise XMindSkillError("LLM 响应格式无效") from error
        if not isinstance(content, str) or not content.strip():
            raise XMindSkillError("LLM 响应内容为空")
        return content


@dataclass(frozen=True)
class GenerationGroup:
    directory: str
    tree: dict[str, Any]


@dataclass(frozen=True)
class LLMConfig:
    api_key: str
    base_url: str
    model: str


def generation_groups(tree: list[dict[str, Any]]) -> list[GenerationGroup]:
    groups: list[GenerationGroup] = []
    for root in tree:
        root_title = str(root.get("title") or "未命名节点")
        children = root.get("children") or []
        if not children:
            groups.append(GenerationGroup(directory=root_title, tree=root))
            continue
        for child in children:
            child_title = str(child.get("title") or "未命名节点")
            groups.append(
                GenerationGroup(
                    directory=f"{root_title}/{child_title}",
                    tree=child,
                )
            )
    return groups


def _as_non_empty(value: str, fallback: str) -> str:
    return value.strip() or fallback


def _priority(value: str) -> str:
    aliases = {
        "最高": "P0",
        "高": "P0",
        "较高": "P1",
        "中": "P1",
        "低": "P2",
        "较低": "P2",
        "很低": "P3",
    }
    normalized = value.strip().upper()
    return aliases.get(normalized, normalized if normalized in {"P0", "P1", "P2", "P3"} else "P2")


def align_generated_cases(
    raw_cases: Any,
    *,
    directory: str,
    creator: str,
) -> list[dict[str, str]]:
    if isinstance(raw_cases, dict):
        raw_cases = raw_cases.get("cases")
    if not isinstance(raw_cases, list) or not raw_cases:
        raise XMindSkillError("LLM 未生成有效用例")

    aligned: list[dict[str, str]] = []
    for raw_case in raw_cases:
        try:
            case = GeneratedFunctionalCase.model_validate(raw_case)
        except (ValidationError, TypeError) as error:
            raise XMindSkillError("LLM 用例字段不符合结构约束") from error
        values = case.model_dump(by_alias=True)
        # 目录归属由 XMind 分组决定，不能让模型把用例写入其他路径。
        values["用例目录"] = directory.strip()
        values["用例名称"] = _as_non_empty(values["用例名称"], "未命名测试用例")
        values["前置条件"] = _as_non_empty(values["前置条件"], "无")
        values["用例步骤"] = _as_non_empty(values["用例步骤"], "1. 执行默认测试操作")
        values["预期结果"] = _as_non_empty(values["预期结果"], "1. 系统表现正常")
        values["用例类型"] = "功能测试"
        values["用例状态"] = "草稿"
        values["用例等级"] = _priority(values["用例等级"])
        values["创建人"] = _as_non_empty(values["创建人"], creator)
        aligned.append({header: str(values.get(header, "")) for header in STANDARD_HEADERS})
    return aligned


def _prompt_for_group(group: GenerationGroup) -> str:
    return json.dumps(
        {
            "用例目录": group.directory,
            "xmind_tree": group.tree,
        },
        ensure_ascii=False,
    )


class XMindToTestCaseSkill:
    """把树形需求隐藏在一个小接口后的生成 Skill。"""

    def __init__(
        self,
        client: LLMClient,
        *,
        max_attempts: int = MAX_ATTEMPTS,
        max_concurrency: int = DEFAULT_MAX_CONCURRENCY,
        retry_delay_seconds: float = DEFAULT_RETRY_DELAY_SECONDS,
    ) -> None:
        self.client = client
        self.max_attempts = min(MAX_ATTEMPTS, max(1, max_attempts))
        self.max_concurrency = max(1, max_concurrency)
        self.retry_delay_seconds = max(0, retry_delay_seconds)

    async def generate(
        self,
        tree: list[dict[str, Any]],
        *,
        config: LLMConfig,
        creator: str,
    ) -> list[dict[str, str]]:
        if not config.api_key.strip():
            raise XMindLLMUnavailable("请先在系统设置中配置 LLM API Key")
        groups = generation_groups(tree)
        if not groups:
            raise XMindGenerationError("XMind 没有可生成的功能分组")

        semaphore = asyncio.Semaphore(self.max_concurrency)

        async def generate_group(group: GenerationGroup) -> list[dict[str, str]]:
            async with semaphore:
                return await self._generate_group(group, config=config, creator=creator)

        results = await asyncio.gather(
            *(generate_group(group) for group in groups),
            return_exceptions=True,
        )
        if any(isinstance(result, Exception) for result in results):
            raise XMindGenerationError("XMind 用例生成失败，请稍后重试")
        cases: list[dict[str, str]] = []
        for result in results:
            cases.extend(result)  # type: ignore[arg-type]
        if len(cases) > MAX_GENERATED_CASES:
            raise XMindGenerationError(
                f"生成用例超过 {MAX_GENERATED_CASES} 条限制，请拆分 XMind 后重试"
            )
        return cases

    async def _generate_group(
        self,
        group: GenerationGroup,
        *,
        config: LLMConfig,
        creator: str,
    ) -> list[dict[str, str]]:
        last_error: Exception | None = None
        for attempt in range(self.max_attempts):
            try:
                content = await self.client.complete(
                    system_prompt=SYSTEM_PROMPT,
                    user_prompt=_prompt_for_group(group),
                    model=config.model,
                    base_url=config.base_url,
                    api_key=config.api_key,
                )
                try:
                    decoded = json.loads(content)
                except json.JSONDecodeError as error:
                    raise XMindSkillError("LLM 未返回合法 JSON") from error
                return align_generated_cases(
                    decoded,
                    directory=group.directory,
                    creator=creator,
                )
            except asyncio.CancelledError:
                raise
            except Exception as error:
                last_error = error
                if attempt + 1 < self.max_attempts and self.retry_delay_seconds:
                    await asyncio.sleep(self.retry_delay_seconds * (attempt + 1))
        raise XMindGenerationError("XMind 分组生成失败") from last_error
