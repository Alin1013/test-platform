import io
import json
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import User, XMindRecord

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
            if sum(member.file_size for member in archive.infolist()) > MAX_UNCOMPRESSED_BYTES:
                raise XMindParseError("XMind archive expands beyond the 25 MB limit")
            names = set(archive.namelist())
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
) -> dict:
    if session.get(User, uploader_id) is None:
        raise HTTPException(status_code=404, detail="Uploader not found")
    tree = parse_xmind(content)
    cases = case_preview(tree)
    stored_name = f"{uuid4().hex}.xmind"
    destination = upload_dir / stored_name
    destination.write_bytes(content)
    record = XMindRecord(
        file_name=original_name,
        file_url=f"/uploads/{stored_name}",
        uploader_id=uploader_id,
        parsed_cases_count=len(cases),
    )
    session.add(record)
    try:
        session.commit()
    except Exception:
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
