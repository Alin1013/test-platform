"""AI 异常分析业务：内容标准化、脱敏、模型调用、持久化与反馈。"""

from __future__ import annotations

import base64
import io
import json
import mimetypes
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import PurePath
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..anomaly_schemas import (
    AnomalyAnalysisRequest,
    AnomalyAnalysisResponse,
    AnomalyFileRequest,
    AnomalyHistoryResponse,
    AnomalyResult,
    CONTEXT_MAX_CHARS,
)
from ..models import AnomalyAnalysisRecord, User
from .settings import get_settings
from .xmind_skill import OpenAICompatibleClient, XMindSkillError


MAX_TEXT_CHARS = 100_000
MAX_CONTEXT_CHARS = CONTEXT_MAX_CHARS
MAX_CONTEXT_DEPTH = 6
MAX_CONTEXT_ITEMS = 100
MAX_LOG_FILE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_BATCH_FILES = 20
MAX_BATCH_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_ARCHIVE_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 25 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 100
MAX_SINGLE_UPLOAD_BYTES = max(MAX_LOG_FILE_BYTES, MAX_IMAGE_BYTES, MAX_ARCHIVE_BYTES)
ALLOWED_TEXT_SUFFIXES = {".txt", ".log", ".json", ".xml", ".yaml", ".yml"}
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
ALLOWED_ARCHIVE_SUFFIXES = {".zip"}
ALLOWED_ARCHIVE_TYPES = {"application/zip", "application/x-zip-compressed"}

SYSTEM_PROMPT = """你是一名资深软件测试和故障分析专家。

你的任务是根据用户提供的测试失败信息、日志、截图或文件内容，识别异常并提供可执行的排查和解决建议。
要求：
1. 不确定的信息必须标记为“可能”。
2. 不得捏造不存在的日志、错误码和系统信息。
3. 优先依据用户实际提供的信息分析。
4. 给出 summary、category、severity、possibleCauses、analysisBasis、suggestions、solutions、verification、requiredInformation 和 risk。
5. 危险操作必须明确提示风险；不要建议系统自动执行任何命令。
6. 如果信息不足，应明确说明还需要哪些信息。
7. 只返回合法 JSON，不要 Markdown 或思维链。
"""


class AnomalyAnalysisError(ValueError):
    """异常分析无法完成或模型输出不符合结构约束。"""


def _persist_failure(session: Session, record: AnomalyAnalysisRecord, message: str) -> None:
    """尽力保存失败记录；数据库未迁移或暂时不可用时不能覆盖原始 502。"""
    record.error_message = message[:1000]
    try:
        session.commit()
    except SQLAlchemyError:
        # 例如旧数据库尚未执行异常分析迁移；回滚后由上层返回模型错误，而不是 500。
        session.rollback()


@dataclass(frozen=True)
class PreparedInput:
    """发送给模型和写入记录的脱敏输入。"""

    text: str
    image_data_url: str | None = None
    image_data_urls: tuple[str, ...] = ()


def _compact_logs(content: str) -> str:
    """压缩空行并优先保留异常行附近的日志上下文。"""
    lines = [line.rstrip() for line in content.replace("\r\n", "\n").split("\n")]
    lines = [line for index, line in enumerate(lines) if line.strip() or (index and lines[index - 1].strip())]
    if len("\n".join(lines)) <= MAX_TEXT_CHARS:
        return "\n".join(lines)
    markers = re.compile(r"error|exception|failed|failure|timeout|traceback|fatal", re.I)
    focus = [index for index, line in enumerate(lines) if markers.search(line)]
    if not focus:
        return "\n".join(lines)[:MAX_TEXT_CHARS]
    selected: set[int] = set()
    for index in focus:
        selected.update(range(max(0, index - 60), min(len(lines), index + 61)))
    excerpt = "\n".join(lines[index] for index in sorted(selected))
    return excerpt[:MAX_TEXT_CHARS]


def mask_sensitive_data(content: str) -> str:
    """遮盖令牌、凭据和常见个人信息，避免敏感数据发送到外部模型。"""
    masked = re.sub(
        r"(?i)(authorization\s*[\"']?\s*[:=]\s*[\"']?(?:bearer\s+)?|"
        r"cookie\s*[\"']?\s*[:=]\s*[\"']?|"
        r"(?:password|passwd|secret|access[_-]?key|secret[_-]?key|api[_-]?key|token)\s*[\"']?\s*[:=]\s*[\"']?)"
        r"[^\s,;\"'}\]]+",
        r"\1******",
        content,
    )
    masked = re.sub(r"(?<!\d)1\d{10}(?!\d)", "***********", masked)
    masked = re.sub(r"(?<!\d)\d{17}[\dXx](?!\d)", "******************", masked)
    return masked


def _normalized_key(key: object) -> str:
    """把上下文字段名归一化，便于识别 Authorization、token 等敏感键。"""
    return "".join(character for character in str(key).casefold() if character.isalnum())


SENSITIVE_CONTEXT_KEYS = {
    "authorization",
    "cookie",
    "setcookie",
    "password",
    "passwd",
    "token",
    "accesstoken",
    "refreshtoken",
    "secret",
    "clientsecret",
    "apikey",
    "accesskey",
    "secretkey",
}


def _sanitize_context_value(value: Any, *, depth: int = 0) -> Any:
    """递归脱敏执行上下文，并限制嵌套深度和集合大小，避免凭据或超大对象进入 Prompt。"""
    if depth > MAX_CONTEXT_DEPTH:
        return "（上下文嵌套过深，已截断）"
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= MAX_CONTEXT_ITEMS:
                sanitized["..."] = "（字段过多，已截断）"
                break
            key_text = str(key)
            if _normalized_key(key) in SENSITIVE_CONTEXT_KEYS:
                sanitized[key_text] = "******"
            else:
                sanitized[key_text] = _sanitize_context_value(item, depth=depth + 1)
        return sanitized
    if isinstance(value, list):
        return [
            _sanitize_context_value(item, depth=depth + 1)
            for item in value[:MAX_CONTEXT_ITEMS]
        ] + (["（列表过长，已截断）"] if len(value) > MAX_CONTEXT_ITEMS else [])
    if isinstance(value, tuple):
        return _sanitize_context_value(list(value), depth=depth)
    if isinstance(value, str):
        return mask_sensitive_data(value[:MAX_TEXT_CHARS])
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return mask_sensitive_data(str(value)[:MAX_TEXT_CHARS])


def _truncate_context(content: str) -> str:
    """限制格式化后的上下文总长度，保留前段稳定字段并标记截断。"""
    if len(content) <= MAX_CONTEXT_CHARS:
        return content
    return f"{content[:MAX_CONTEXT_CHARS]}\n（上下文超过 20,000 字符，后续内容已截断）"


def prepare_text(content: str) -> PreparedInput:
    """统一日志/文本内容，先截取再脱敏以控制发送体积。"""
    normalized = _compact_logs(content.strip())
    return PreparedInput(text=mask_sensitive_data(normalized[:MAX_TEXT_CHARS]))


async def prepare_upload(file: UploadFile, source_type: str) -> PreparedInput:
    """兼容旧的单文件调用，并复用批量上传的统一校验路径。"""
    return await prepare_uploads([file], source_type)


def _archive_member_name(name: str) -> str:
    """规范化归档成员名，拒绝绝对路径和目录穿越，避免解包写入宿主文件系统。"""
    normalized = name.replace("\\", "/")
    path = PurePath(normalized)
    if path.is_absolute() or ".." in path.parts:
        raise HTTPException(status_code=422, detail="压缩包包含不安全的文件路径")
    return "/".join(part for part in path.parts if part not in ("", "."))


def _prepare_image(content: bytes, *, name: str, content_type: str | None) -> PreparedInput:
    """将图片转换为模型可消费的 data URL，保留名称作为可读证据。"""
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="图片超过 10 MB 限制")
    mime = content_type if content_type in ALLOWED_IMAGE_TYPES else mimetypes.guess_type(name)[0]
    if mime not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="仅支持 PNG、JPEG、WebP 或 GIF 截图")
    encoded = base64.b64encode(content).decode("ascii")
    return PreparedInput(
        text=f"图片文件：{name}",
        image_data_url=f"data:{mime};base64,{encoded}",
    )


def _prepare_text_bytes(content: bytes, *, name: str) -> PreparedInput:
    """解码单个 UTF-8 文本文件，并在模型输入中保留文件边界。"""
    if len(content) > MAX_LOG_FILE_BYTES:
        raise HTTPException(status_code=413, detail="日志文件超过 5 MB 限制，请截取关键片段后重试")
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=422, detail=f"文件 {name} 必须使用 UTF-8 编码") from error
    prepared = prepare_text(text)
    return PreparedInput(text=f"文件：{name}\n{prepared.text}")


def _prepare_archive(content: bytes, *, name: str) -> list[PreparedInput]:
    """在内存中读取 ZIP 的文本/图片成员，并限制成员数与解压总量以抵御压缩炸弹。"""
    if len(content) > MAX_ARCHIVE_BYTES:
        raise HTTPException(status_code=413, detail="压缩包超过 10 MB 限制")
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as error:
        raise HTTPException(status_code=422, detail=f"压缩包 {name} 不是有效的 ZIP 文件") from error
    with archive:
        members = archive.infolist()
        if len(members) > MAX_ARCHIVE_MEMBERS:
            raise HTTPException(status_code=413, detail="压缩包文件数量超过 100 个限制")
        uncompressed_size = sum(member.file_size for member in members)
        if uncompressed_size > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
            raise HTTPException(status_code=413, detail="压缩包解压后超过 25 MB 限制")
        prepared: list[PreparedInput] = []
        for member in members:
            if member.is_dir() or member.flag_bits & 0x1:
                # 目录没有分析价值；加密成员无法在服务端安全解包，直接拒绝而不是静默丢失证据。
                if member.flag_bits & 0x1:
                    raise HTTPException(status_code=422, detail="暂不支持加密压缩包")
                continue
            member_name = _archive_member_name(member.filename)
            if not member_name:
                continue
            suffix = PurePath(member_name).suffix.lower()
            member_content = archive.read(member)
            display_name = f"{name}/{member_name}"
            if suffix in ALLOWED_TEXT_SUFFIXES:
                prepared.append(_prepare_text_bytes(member_content, name=display_name))
            elif mimetypes.guess_type(member_name)[0] in ALLOWED_IMAGE_TYPES:
                prepared.append(_prepare_image(member_content, name=display_name, content_type=None))
        if not prepared:
            raise HTTPException(status_code=415, detail="压缩包内没有可分析的 txt、log、json、xml、yaml 或图片文件")
        return prepared


def _prepare_upload_bytes(
    content: bytes,
    *,
    name: str,
    content_type: str | None,
    source_type: str,
) -> list[PreparedInput]:
    """按文件名、MIME 和入口模式选择图片、文本或 ZIP 解析器。"""
    suffix = PurePath(name).suffix.lower()
    if suffix in ALLOWED_ARCHIVE_SUFFIXES or content_type in ALLOWED_ARCHIVE_TYPES:
        if source_type == "SCREENSHOT":
            raise HTTPException(status_code=415, detail="截图入口仅支持 PNG、JPEG、WebP 或 GIF")
        return _prepare_archive(content, name=name)
    if source_type == "SCREENSHOT" or content_type in ALLOWED_IMAGE_TYPES:
        return [_prepare_image(content, name=name, content_type=content_type)]
    if suffix not in ALLOWED_TEXT_SUFFIXES:
        raise HTTPException(status_code=415, detail="当前文件格式暂不支持，请使用 txt、log、json、xml、yaml、图片或 zip")
    return [_prepare_text_bytes(content, name=name)]


async def prepare_uploads(files: list[UploadFile], source_type: str) -> PreparedInput:
    """读取并聚合批量上传文件；原始字节只在内存中短暂存在，不落盘。"""
    if not files:
        raise HTTPException(status_code=422, detail="请至少上传一个分析文件")
    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(status_code=413, detail="一次最多上传 20 个文件")

    prepared: list[PreparedInput] = []
    total_upload_bytes = 0
    for file in files:
        name = PurePath(file.filename or "upload").name
        content = await file.read(MAX_SINGLE_UPLOAD_BYTES + 1)
        total_upload_bytes += len(content)
        if total_upload_bytes > MAX_BATCH_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="本次上传总大小超过 50 MB 限制")
        prepared.extend(
            _prepare_upload_bytes(
                content,
                name=name,
                content_type=file.content_type,
                source_type=source_type,
            )
        )

    text_parts = [item.text for item in prepared if item.text.strip()]
    images = [
        item.image_data_url
        for item in prepared
        if item.image_data_url
    ]
    combined_text = mask_sensitive_data(_compact_logs("\n\n".join(text_parts))[:MAX_TEXT_CHARS])
    return PreparedInput(text=combined_text, image_data_urls=tuple(images))


def _context_text(context: dict[str, Any]) -> str:
    """以稳定顺序拼装已递归脱敏的测试上下文，避免泄露凭据或突破 Prompt 预算。"""
    labels = {
        "project": "项目",
        "environment": "环境",
        "testCase": "测试用例",
        "step": "测试步骤",
        "expected": "预期结果",
        "actual": "实际结果",
        "request": "接口请求",
        "response": "接口响应",
        "log": "关联日志",
    }
    sanitized_context = _sanitize_context_value(context)
    lines: list[str] = []
    for key, value in sanitized_context.items():
        if value in (None, "", [], {}):
            continue
        rendered = (
            json.dumps(value, ensure_ascii=False, separators=(",", ":"))
            if isinstance(value, (dict, list))
            else str(value)
        )
        lines.append(f"{labels.get(key, key)}：{rendered}")
    return _truncate_context("\n".join(lines))


def build_user_prompt(
    *, prepared: PreparedInput, context: dict[str, Any], additional_description: str
) -> str:
    """构造单 Prompt，保留平台上下文并声明内容已经脱敏。"""
    context_block = _context_text(context) or "（无额外测试上下文）"
    # 补充说明是自由文本，不能因为没有结构化字段名就绕过统一脱敏与长度约束。
    description = mask_sensitive_data(additional_description.strip()[:4_000]) or "（无）"
    return (
        "这是测试平台中的一次异常分析请求，下面的内容已完成基础脱敏。\n\n"
        f"测试上下文：\n{context_block}\n\n"
        f"用户补充说明：\n{description}\n\n"
        f"异常内容：\n{prepared.text}"
    )


def _dangerous_risk(result: AnomalyResult) -> AnomalyResult:
    """命中危险命令时强制提升风险级别，并追加人工确认提示。"""
    dangerous = re.compile(r"\b(?:rm\s+-rf|drop\s+table|delete\s+from|kubectl\s+delete|kill\s+-9|reboot)\b", re.I)
    all_text = "\n".join([*result.suggestions, *result.solutions, *result.verification])
    if not dangerous.search(all_text):
        return result
    warning = "建议包含可能影响数据或环境的高风险命令，执行前必须确认范围并保留回滚方案。"
    return result.model_copy(
        update={
            "risk": "HIGH",
            "solutions": [warning, *result.solutions],
        }
    )


def _serialize(record: AnomalyAnalysisRecord) -> dict[str, Any]:
    """把 ORM 记录转换为前端消费的 camelCase 结构。"""
    payload: dict[str, Any] = {}
    if record.result_json:
        try:
            payload = json.loads(record.result_json)
        except (TypeError, ValueError):
            payload = {}
    return {
        **AnomalyResult.model_validate(payload).model_dump(),
        "analysisId": record.id,
        "sourceType": record.source_type,
        "sourceId": record.source_id,
        "status": record.status,
        "createdAt": record.created_at,
        "helpful": record.helpful,
        "modelName": record.model_name,
    }


async def analyze(
    session: Session,
    *,
    user: User,
    payload: AnomalyAnalysisRequest | AnomalyFileRequest,
    prepared: PreparedInput,
    llm_transport: Any = None,
) -> dict[str, Any]:
    """完成一次同步分析并写入记录；所有失败都保留可追踪的失败记录。"""
    context = payload.context
    project_id = context.get("projectId")
    input_summary = prepared.text[:240]
    settings = get_settings(session)["ai"]
    record = AnomalyAnalysisRecord(
        project_id=project_id if isinstance(project_id, int) else None,
        user_id=user.id,
        source_type=payload.sourceType,
        source_id=payload.sourceId,
        input_summary=input_summary,
        input_content=prepared.text,
        status="FAILED",
    )
    session.add(record)
    try:
        if not settings.get("apiKey", "").strip():
            raise HTTPException(status_code=503, detail="AI分析服务未配置，请先在系统设置中填写 API Key")
        prompt = build_user_prompt(
            prepared=prepared,
            context=context,
            additional_description=payload.additionalDescription,
        )
        user_prompt: str | list[dict[str, Any]] = prompt
        image_urls = prepared.image_data_urls or (
            (prepared.image_data_url,) if prepared.image_data_url else ()
        )
        if image_urls:
            # 多个截图与文本共用一个 user message，避免批量上传被拆成互相无关的分析任务。
            user_prompt = [
                {"type": "text", "text": prompt},
                *({"type": "image_url", "image_url": {"url": url}} for url in image_urls),
            ]
        client = OpenAICompatibleClient(transport=llm_transport)
        raw = await client.complete(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,  # type: ignore[arg-type]
            model=settings["defaultModel"],
            base_url=settings["baseUrl"],
            api_key=settings["apiKey"],
        )
        try:
            parsed = json.loads(raw)
            required_fields = {
                "summary",
                "category",
                "severity",
                "possibleCauses",
                "analysisBasis",
                "suggestions",
                "solutions",
                "verification",
                "requiredInformation",
                "risk",
            }
            if not isinstance(parsed, dict) or not required_fields.issubset(parsed):
                raise AnomalyAnalysisError("AI 返回结果缺少必需的结构化字段")
            result = _dangerous_risk(AnomalyResult.model_validate(parsed))
        except AnomalyAnalysisError:
            raise
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            raise AnomalyAnalysisError("AI 返回结果不是合法的结构化 JSON") from error
        record.result_json = json.dumps(result.model_dump(), ensure_ascii=False)
        record.model_name = settings["defaultModel"]
        record.token_usage = client.last_token_usage
        record.status = "COMPLETED"
        record.error_message = None
        session.commit()
        session.refresh(record)
        return _serialize(record)
    except HTTPException:
        session.rollback()
        # 配置缺失等可预期 HTTP 错误不写入无效的持久化记录。
        raise
    except (XMindSkillError, AnomalyAnalysisError) as error:
        _persist_failure(session, record, str(error))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    except Exception as error:
        _persist_failure(session, record, "AI分析服务暂时不可用")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=record.error_message) from error


def list_history(session: Session, *, user: User, page: int, page_size: int) -> dict[str, Any]:
    """分页返回当前用户的分析历史，避免不同用户互相看到异常内容。"""
    base = select(AnomalyAnalysisRecord).where(AnomalyAnalysisRecord.user_id == user.id)
    total = session.scalar(select(func.count()).select_from(base.subquery())) or 0
    records = session.scalars(
        base.order_by(AnomalyAnalysisRecord.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return AnomalyHistoryResponse(
        items=[AnomalyAnalysisResponse.model_validate(_serialize(record)) for record in records],
        total=total,
        page=page,
        pageSize=page_size,
    ).model_dump()


def update_feedback(session: Session, *, user: User, analysis_id: int, helpful: bool) -> dict[str, Any]:
    """更新分析反馈；仅允许记录所属用户修改。"""
    record = session.scalar(
        select(AnomalyAnalysisRecord).where(
            AnomalyAnalysisRecord.id == analysis_id,
            AnomalyAnalysisRecord.user_id == user.id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="异常分析记录不存在")
    record.helpful = helpful
    record.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(record)
    return _serialize(record)
