"""解析 XMind 节点树，并按需将预览结果原子保存为正式用例。"""

import io
import json
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..models import Module, User, XMindRecord
from ..schemas import TestCaseCreate
from ..xmind_schemas import XMindConfirmRequest, XMindTaskConfirmRequest
from . import settings, test_cases
from .xmind_skill import (
    LLMConfig,
    OpenAICompatibleClient,
    XMindToTestCaseSkill,
    align_generated_cases,
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024


class XMindParseError(ValueError):
    pass


def _json_node(topic: dict[str, Any]) -> dict:
    children_value = topic.get("children", {})
    if isinstance(children_value, dict):
        children = children_value.get("attached", [])
    elif isinstance(children_value, list):
        children = children_value
    else:
        children = []
    return {
        "title": str(topic.get("title") or "未命名节点"),
        "children": [_json_node(child) for child in children if isinstance(child, dict)],
    }


def _xml_node(topic: ET.Element) -> dict:
    title_element = topic.find("{*}title")
    title = title_element.text if title_element is not None and title_element.text else "未命名节点"
    child_topics = topic.findall("{*}children/{*}topics/{*}topic")
    return {"title": title, "children": [_xml_node(child) for child in child_topics]}


def _parse_json(content: bytes) -> list[dict]:
    try:
        decoded = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise XMindParseError("Invalid content.json") from error
    sheets = decoded.get("sheets", []) if isinstance(decoded, dict) else decoded
    if not isinstance(sheets, list):
        raise XMindParseError("Invalid XMind sheet collection")
    roots = [
        _json_node(sheet["rootTopic"])
        for sheet in sheets
        if isinstance(sheet, dict) and isinstance(sheet.get("rootTopic"), dict)
    ]
    if not roots:
        raise XMindParseError("No root topics found")
    return roots


def _parse_xml(content: bytes) -> list[dict]:
    try:
        document = ET.fromstring(content)
    except ET.ParseError as error:
        raise XMindParseError("Invalid content.xml") from error
    roots = []
    for sheet in document.findall(".//{*}sheet"):
        topic = sheet.find("{*}topic")
        if topic is not None:
            roots.append(_xml_node(topic))
    if not roots:
        raise XMindParseError("No root topics found")
    return roots


def parse_xmind(content: bytes) -> list[dict]:
    if len(content) > MAX_UPLOAD_BYTES:
        raise XMindParseError("XMind file exceeds the 10 MB limit")
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            # 同时限制上传体积和声明的解压体积，降低压缩炸弹占满内存的风险。
            if sum(member.file_size for member in archive.infolist()) > MAX_UNCOMPRESSED_BYTES:
                raise XMindParseError("XMind archive expands beyond the 25 MB limit")
            names = set(archive.namelist())
            # 新版 XMind 使用 JSON，XMind 8 使用 XML，统一转换为同一种节点结构。
            if "content.json" in names:
                return _parse_json(archive.read("content.json"))
            if "content.xml" in names:
                return _parse_xml(archive.read("content.xml"))
    except (zipfile.BadZipFile, KeyError) as error:
        raise XMindParseError("Invalid XMind archive") from error
    raise XMindParseError("XMind archive has no supported content file")


def case_preview(tree: list[dict]) -> list[dict]:
    cases = []

    def add_leaves(node: dict, module_name: str, path: list[str]) -> None:
        children = node["children"]
        if not children:
            cases.append(
                {
                    "title": node["title"],
                    "type": "functional",
                    "module": module_name,
                    "steps": path,
                }
            )
            return
        for child in children:
            add_leaves(child, module_name, [*path, node["title"]])

    # 每个根节点的第一层作为模块，后续路径中的叶子节点转换为用例。
    for root in tree:
        modules = root["children"] or [root]
        for module in modules:
            if module["children"]:
                for child in module["children"]:
                    add_leaves(child, module["title"], [])
            else:
                add_leaves(module, root["title"], [])
    return cases


def save_upload(
    session: Session,
    *,
    original_name: str,
    content: bytes,
    uploader_id: int,
    upload_dir: Path,
    module_mapping: dict[str, str] | None = None,
) -> dict:
    if session.get(User, uploader_id) is None:
        raise HTTPException(status_code=404, detail="Uploader not found")
    tree = parse_xmind(content)
    cases = case_preview(tree)
    if module_mapping is not None:
        missing_names = sorted({case["module"] for case in cases} - module_mapping.keys())
        if missing_names:
            raise HTTPException(
                status_code=422,
                detail=f"Missing module mappings: {', '.join(missing_names)}",
            )
        missing_modules = sorted(
            {
                module_id
                for module_id in module_mapping.values()
                if session.get(Module, module_id) is None
            }
        )
        if missing_modules:
            raise HTTPException(
                status_code=422,
                detail=f"Mapped modules not found: {', '.join(missing_modules)}",
            )

    stored_name = f"{uuid4().hex}.xmind"
    destination = upload_dir / stored_name
    record = XMindRecord(
        file_name=original_name,
        file_url=f"/uploads/{stored_name}",
        uploader_id=uploader_id,
        parsed_cases_count=len(cases),
    )
    session.add(record)
    saved_cases = []
    # 文件、上传记录和可选的正式用例视为一个整体，任一步失败都清理现场。
    try:
        if module_mapping is not None:
            for preview in cases:
                created = test_cases.add_case(
                    session,
                    TestCaseCreate(
                        title=preview["title"],
                        type="functional",
                        module_id=module_mapping[preview["module"]],
                        priority="P1",
                        status="草稿",
                        author_id=uploader_id,
                    ),
                )
                saved_cases.append(created)
        destination.write_bytes(content)
        session.commit()
    except Exception:
        session.rollback()
        destination.unlink(missing_ok=True)
        raise
    return {
        "record": {
            "id": record.id,
            "file_name": record.file_name,
            "file_url": record.file_url,
            "uploader_id": record.uploader_id,
            "parsed_cases_count": record.parsed_cases_count,
            "created_at": record.created_at,
        },
        "tree": tree,
        "cases": cases,
        "saved_cases": [
            {
                "id": test_case.id,
                "code": test_case.code,
                "title": test_case.title,
                "module_id": test_case.module_id,
            }
            for test_case in saved_cases
        ],
    }


async def generate_upload(
    session: Session,
    *,
    original_name: str,
    content: bytes,
    uploader_id: int,
    upload_dir: Path,
    llm_transport: Any = None,
) -> dict:
    """解析并生成完整预览；模型失败时不保存文件或生成记录。"""

    uploader = session.get(User, uploader_id)
    if uploader is None:
        raise HTTPException(status_code=404, detail="Uploader not found")
    tree = parse_xmind(content)
    ai_settings = settings.get_settings(session)["ai"]
    skill = XMindToTestCaseSkill(
        OpenAICompatibleClient(transport=llm_transport),
    )
    cases = await skill.generate(
        tree,
        config=LLMConfig(
            api_key=ai_settings["apiKey"],
            base_url=ai_settings["baseUrl"],
            model=ai_settings["defaultModel"],
        ),
        creator=uploader.name,
    )

    stored_name = f"{uuid4().hex}.xmind"
    destination = upload_dir / stored_name
    record = XMindRecord(
        file_name=original_name,
        file_url=f"/uploads/{stored_name}",
        uploader_id=uploader_id,
        parsed_cases_count=len(cases),
    )
    try:
        destination.write_bytes(content)
        session.add(record)
        session.commit()
    except Exception:
        session.rollback()
        destination.unlink(missing_ok=True)
        raise
    return {
        "record": {
            "id": record.id,
            "file_name": record.file_name,
            "file_url": record.file_url,
            "uploader_id": record.uploader_id,
            "parsed_cases_count": record.parsed_cases_count,
            "created_at": record.created_at,
        },
        "tree": tree,
        "cases": cases,
    }


def confirm_generated_cases(session: Session, payload: XMindConfirmRequest) -> dict:
    """将用户确认的功能预览按目录映射一次性写入正式用例库。"""

    uploader = session.get(User, payload.uploader_id)
    if uploader is None:
        raise HTTPException(status_code=404, detail="Uploader not found")
    cases_with_directories = [
        case.model_dump(by_alias=True) for case in payload.cases
    ]
    directories = {case["用例目录"].strip() for case in cases_with_directories}
    if "" in directories:
        raise HTTPException(status_code=422, detail="每条用例都必须包含用例目录")
    missing_names = sorted(directories - payload.module_mapping.keys())
    if missing_names:
        raise HTTPException(
            status_code=422,
            detail=f"Missing module mappings: {', '.join(missing_names)}",
        )
    missing_modules = sorted(
        {
            module_id
            for module_id in payload.module_mapping.values()
            if session.get(Module, module_id) is None
        }
    )
    if missing_modules:
        raise HTTPException(
            status_code=422,
            detail=f"Mapped modules not found: {', '.join(missing_modules)}",
        )

    saved_cases = []
    try:
        for raw_case in cases_with_directories:
            normalized = align_generated_cases(
                [raw_case],
                directory=raw_case["用例目录"],
                creator=uploader.name,
            )[0]
            saved_cases.append(
                test_cases.add_case(
                    session,
                    TestCaseCreate(
                        title=normalized["用例名称"],
                        type="functional",
                        module_id=payload.module_mapping[normalized["用例目录"]],
                        priority=normalized["用例等级"],
                        status="草稿",
                        author_id=payload.uploader_id,
                        requirement_id=normalized["需求ID"] or None,
                        precondition=normalized["前置条件"],
                        test_steps=normalized["用例步骤"],
                        expected_result=normalized["预期结果"],
                        iteration=normalized["归属迭代"],
                    ),
                )
            )
        session.commit()
    except Exception:
        session.rollback()
        raise
    return {
        "saved_cases": [
            {
                "id": test_case.id,
                "code": test_case.code,
                "title": test_case.title,
                "module_id": test_case.module_id,
            }
            for test_case in saved_cases
        ]
    }


def _task_upload_path(upload_dir: Path, record: XMindRecord) -> Path:
    return upload_dir / Path(record.file_url).name


def _serialize_task_record(record: XMindRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "file_name": record.file_name,
        "file_url": record.file_url,
        "uploader_id": record.uploader_id,
        "uploader_name": record.uploader.name if record.uploader else "",
        "status": record.status,
        "parsed_cases_count": record.parsed_cases_count,
        "attempts": record.attempts,
        "available_at": record.available_at,
        "locked_at": record.locked_at,
        "last_error": record.last_error,
        "created_at": record.created_at,
    }


def _serialize_task_detail(record: XMindRecord) -> dict[str, Any]:
    return {
        **_serialize_task_record(record),
        "tree": record.tree_json or [],
        "cases": record.preview_cases_json or [],
        "module_mapping": record.module_mapping_json or {},
    }


def create_generation_task(
    session: Session,
    *,
    original_name: str,
    content: bytes,
    uploader_id: int,
    upload_dir: Path,
) -> dict:
    uploader = session.get(User, uploader_id)
    if uploader is None:
        raise HTTPException(status_code=404, detail="Uploader not found")
    tree = parse_xmind(content)
    stored_name = f"{uuid4().hex}.xmind"
    destination = upload_dir / stored_name
    record = XMindRecord(
        file_name=original_name,
        file_url=f"/uploads/{stored_name}",
        uploader_id=uploader_id,
        status="PENDING",
        parsed_cases_count=0,
        attempts=0,
        available_at=datetime.now(timezone.utc),
        locked_at=None,
        last_error=None,
        tree_json=tree,
        preview_cases_json=None,
        module_mapping_json=None,
    )
    session.add(record)
    try:
        destination.write_bytes(content)
        session.commit()
    except Exception:
        session.rollback()
        destination.unlink(missing_ok=True)
        raise
    return _serialize_task_detail(record)


def list_generation_tasks(
    session: Session,
    *,
    page: int,
    page_size: int,
    status: str | None = None,
) -> dict:
    query = select(XMindRecord).options(selectinload(XMindRecord.uploader))
    if status:
        query = query.where(XMindRecord.status == status)
    count_query = select(func.count()).select_from(query.order_by(None).subquery())
    total = session.scalar(count_query) or 0
    rows = session.scalars(
        query.order_by(XMindRecord.created_at.desc(), XMindRecord.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [_serialize_task_record(record) for record in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


def get_generation_task(session: Session, task_id: int) -> dict:
    record = session.scalar(
        select(XMindRecord)
        .options(selectinload(XMindRecord.uploader))
        .where(XMindRecord.id == task_id)
    )
    if record is None:
        raise HTTPException(status_code=404, detail="XMind task not found")
    return _serialize_task_detail(record)


def retry_generation_task(session: Session, task_id: int) -> dict:
    record = session.scalar(
        select(XMindRecord)
        .options(selectinload(XMindRecord.uploader))
        .where(XMindRecord.id == task_id)
    )
    if record is None:
        raise HTTPException(status_code=404, detail="XMind task not found")
    if record.status != "FAILED":
        raise HTTPException(status_code=409, detail="Only failed XMind tasks can be retried")

    record.status = "PENDING"
    record.available_at = datetime.now(timezone.utc)
    record.locked_at = None
    record.last_error = None
    record.preview_cases_json = None
    record.module_mapping_json = None
    record.parsed_cases_count = 0
    session.commit()
    return _serialize_task_detail(record)


def confirm_generated_task(
    session: Session,
    task_id: int,
    payload: XMindTaskConfirmRequest,
) -> dict:
    record = session.scalar(
        select(XMindRecord)
        .options(selectinload(XMindRecord.uploader))
        .where(XMindRecord.id == task_id)
    )
    if record is None:
        raise HTTPException(status_code=404, detail="XMind task not found")
    if record.status != "WAITING_REVIEW":
        raise HTTPException(status_code=409, detail="XMind task is not ready for confirmation")

    cases = record.preview_cases_json or []
    if not cases:
        raise HTTPException(status_code=422, detail="XMind task has no preview cases")

    directories = {str(case.get("用例目录") or "").strip() for case in cases}
    if "" in directories:
        raise HTTPException(status_code=422, detail="每条用例都必须包含用例目录")
    missing_names = sorted(directories - payload.module_mapping.keys())
    if missing_names:
        raise HTTPException(
            status_code=422,
            detail=f"Missing module mappings: {', '.join(missing_names)}",
        )
    missing_modules = sorted(
        {
            module_id
            for module_id in payload.module_mapping.values()
            if session.get(Module, module_id) is None
        }
    )
    if missing_modules:
        raise HTTPException(
            status_code=422,
            detail=f"Mapped modules not found: {', '.join(missing_modules)}",
        )

    uploader = record.uploader or session.get(User, record.uploader_id)
    if uploader is None:
        raise HTTPException(status_code=404, detail="Uploader not found")

    saved_cases = []
    try:
        for raw_case in cases:
            normalized = align_generated_cases(
                [raw_case],
                directory=str(raw_case["用例目录"]),
                creator=uploader.name,
            )[0]
            saved_cases.append(
                test_cases.add_case(
                    session,
                    TestCaseCreate(
                        title=normalized["用例名称"],
                        type="functional",
                        module_id=payload.module_mapping[normalized["用例目录"]],
                        priority=normalized["用例等级"],
                        status="草稿",
                        author_id=record.uploader_id,
                        requirement_id=normalized["需求ID"] or None,
                        precondition=normalized["前置条件"],
                        test_steps=normalized["用例步骤"],
                        expected_result=normalized["预期结果"],
                        iteration=normalized["归属迭代"],
                    ),
                )
            )
        record.module_mapping_json = dict(payload.module_mapping)
        record.status = "COMPLETED"
        record.locked_at = None
        record.last_error = None
        session.commit()
    except Exception:
        session.rollback()
        raise
    return {
        "saved_cases": [
            {
                "id": test_case.id,
                "code": test_case.code,
                "title": test_case.title,
                "module_id": test_case.module_id,
            }
            for test_case in saved_cases
        ]
    }


async def generate_task_preview(
    session_factory: Any,
    task_id: int,
    *,
    upload_dir: Path,
    llm_transport: Any = None,
) -> dict:
    try:
        with session_factory() as session:
            record = session.scalar(
                select(XMindRecord)
                .options(selectinload(XMindRecord.uploader))
                .where(XMindRecord.id == task_id)
            )
            if record is None:
                raise HTTPException(status_code=404, detail="XMind task not found")
            if record.status != "RUNNING":
                raise HTTPException(status_code=409, detail="XMind task is not running")

            tree = list(record.tree_json or [])
            if not tree:
                tree = parse_xmind(_task_upload_path(upload_dir, record).read_bytes())
                record.tree_json = tree

            uploader = record.uploader or session.get(User, record.uploader_id)
            if uploader is None:
                raise HTTPException(status_code=404, detail="Uploader not found")

            ai_settings = settings.get_settings(session)["ai"]
            skill = XMindToTestCaseSkill(
                OpenAICompatibleClient(transport=llm_transport),
            )
            cases = await skill.generate(
                tree,
                config=LLMConfig(
                    api_key=ai_settings["apiKey"],
                    base_url=ai_settings["baseUrl"],
                    model=ai_settings["defaultModel"],
                ),
                creator=uploader.name,
            )

            record.preview_cases_json = cases
            record.parsed_cases_count = len(cases)
            record.status = "WAITING_REVIEW"
            record.locked_at = None
            record.last_error = None
            session.commit()
            return _serialize_task_detail(record)
    except Exception as error:
        with session_factory() as session:
            record = session.get(XMindRecord, task_id)
            if record is not None and record.status == "RUNNING":
                record.status = "FAILED"
                record.locked_at = None
                record.last_error = str(error)
                session.commit()
        raise
