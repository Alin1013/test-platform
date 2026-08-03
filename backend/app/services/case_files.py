"""处理用例文件导入导出，并保证批量导入的事务一致性。"""

import csv
import io
import json
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from openpyxl import Workbook, load_workbook
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..case_file_schemas import TestCaseExportRequest
from ..models import TestCase
from ..schemas import ApiDetailsCreate, TestCaseCreate, UiDetailsCreate
from . import test_cases

MAX_IMPORT_BYTES = 10 * 1024 * 1024
EXPORT_HEADERS = (
    "code",
    "title",
    "type",
    "module_id",
    "priority",
    "status",
    "author_id",
    "url",
    "method",
    "expected_code",
    "headers",
    "request_body",
    "expected_response",
    "steps",
)
HEADER_ALIASES = {
    "编号": "code",
    "用例名称": "title",
    "类型": "type",
    "模块ID": "module_id",
    "优先级": "priority",
    "状态": "status",
    "创建人ID": "author_id",
    "接口地址": "url",
    "HTTP方法": "method",
    "预期状态码": "expected_code",
    "请求头": "headers",
    "请求体": "request_body",
    "预期响应": "expected_response",
    "测试步骤": "steps",
}
TYPE_ALIASES = {"功能用例": "functional", "接口用例": "api", "UI自动化": "ui"}


@dataclass
class ExportedFile:
    content: bytes
    media_type: str
    filename: str


def _json_cell(value: Any) -> str:
    return "" if value is None else json.dumps(value, ensure_ascii=False)


def _export_row(test_case: dict) -> list[Any]:
    api = test_case["api_details"] or {}
    ui = test_case["ui_details"] or {}
    return [
        test_case["code"],
        test_case["title"],
        test_case["type"],
        test_case["module_id"],
        test_case["priority"],
        test_case["status"],
        test_case["author_id"],
        api.get("url", ""),
        api.get("method", ""),
        api.get("expected_code", ""),
        _json_cell(api.get("headers")),
        _json_cell(api.get("request_body")),
        _json_cell(api.get("expected_response")),
        _json_cell(ui.get("steps")),
    ]


def export_cases(
    session: Session, payload: TestCaseExportRequest
) -> ExportedFile:
    query = test_cases.filtered_case_query(
        case_type=payload.type,
        module_id=payload.module_id,
        priority=payload.priority,
        status=payload.status,
        keyword=payload.keyword,
    )
    rows = session.scalars(query.order_by(TestCase.id)).all()
    exported_rows = [_export_row(test_cases.serialize_case(row)) for row in rows]

    if payload.format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(EXPORT_HEADERS)
        writer.writerows(exported_rows)
        return ExportedFile(
            # 添加 UTF-8 BOM，避免常见桌面版 Excel 将中文按本地编码解析。
            content=("\ufeff" + output.getvalue()).encode("utf-8"),
            media_type="text/csv; charset=utf-8",
            filename="test-cases.csv",
        )

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Test Cases"
    sheet.append(EXPORT_HEADERS)
    for row in exported_rows:
        sheet.append(row)
    output_bytes = io.BytesIO()
    workbook.save(output_bytes)
    return ExportedFile(
        content=output_bytes.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="test-cases.xlsx",
    )


def _csv_rows(content: bytes) -> list[dict[str, Any]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=422, detail="CSV must be UTF-8 encoded") from error
    return list(csv.DictReader(io.StringIO(text)))


def _xlsx_rows(content: bytes) -> list[dict[str, Any]]:
    try:
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as error:
        raise HTTPException(status_code=422, detail="Invalid XLSX workbook") from error
    values = workbook.active.iter_rows(values_only=True)
    try:
        headers = [str(value or "").strip() for value in next(values)]
    except StopIteration:
        return []
    return [dict(zip(headers, row, strict=False)) for row in values]


def _parse_json(value: Any, field: str) -> Any:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError(f"{field} must contain valid JSON") from error


def _case_payload(raw_row: dict[str, Any]) -> TestCaseCreate:
    row = {HEADER_ALIASES.get(str(key).strip(), str(key).strip()): value for key, value in raw_row.items()}
    case_type = TYPE_ALIASES.get(str(row.get("type", "")).strip(), str(row.get("type", "")).strip())
    common = {
        "code": row.get("code") or None,
        "title": str(row.get("title") or "").strip(),
        "type": case_type,
        "module_id": str(row.get("module_id") or "").strip(),
        "priority": str(row.get("priority") or "P1").strip(),
        "status": str(row.get("status") or "草稿").strip(),
        "author_id": int(row.get("author_id") or 1),
    }
    if case_type == "api":
        common["api_details"] = ApiDetailsCreate(
            url=str(row.get("url") or "").strip(),
            method=str(row.get("method") or "GET").strip().upper(),
            expected_code=int(row.get("expected_code") or 200),
            headers=_parse_json(row.get("headers"), "headers") or {},
            request_body=_parse_json(row.get("request_body"), "request_body"),
            expected_response=_parse_json(row.get("expected_response"), "expected_response"),
        )
    elif case_type == "ui":
        common["ui_details"] = UiDetailsCreate(
            steps=_parse_json(row.get("steps"), "steps") or []
        )
    return TestCaseCreate.model_validate(common)


def import_cases(session: Session, filename: str, content: bytes) -> dict:
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="Import file exceeds the 10 MB limit")
    lower_name = filename.lower()
    if lower_name.endswith(".csv"):
        rows = _csv_rows(content)
    elif lower_name.endswith(".xlsx"):
        rows = _xlsx_rows(content)
    else:
        raise HTTPException(status_code=415, detail="Only .csv and .xlsx files are supported")
    if not rows:
        raise HTTPException(status_code=422, detail="Import file has no data rows")

    # 所有行共用一个事务；任意一行失败时，前面已 flush 的记录也会回滚。
    created = []
    for index, row in enumerate(rows, start=2):
        try:
            payload = _case_payload(row)
            created.append(test_cases.add_case(session, payload))
        except (ValueError, ValidationError, HTTPException, IntegrityError) as error:
            session.rollback()
            detail = error.detail if isinstance(error, HTTPException) else str(error)
            raise HTTPException(status_code=422, detail=f"Invalid row {index}: {detail}") from error
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="Imported case code already exists") from error
    return {
        "imported_count": len(created),
        "codes": [test_case.code for test_case in created],
    }
