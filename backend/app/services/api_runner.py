from __future__ import annotations

import json
import re
from time import perf_counter
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..schemas import ApiCaseDebugRequest, ApiResponseAssertion
from .settings import get_settings


VARIABLE_PATTERN = re.compile(r"{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}")
JSON_PATH_TOKEN = re.compile(r"\.([A-Za-z_][A-Za-z0-9_-]*)|\[(\d+)\]")


def _render(value: str, variables: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in variables:
            raise HTTPException(status_code=422, detail=f"Undefined variable: {name}")
        return variables[name]

    return VARIABLE_PATTERN.sub(replace, value)


def _environment(session: Session, environment_id: str | None) -> tuple[str, int]:
    execution_settings = get_settings(session)["execution"]
    selected_id = environment_id or execution_settings["defaultEnvironmentId"]
    environment = next(
        (
            item
            for item in execution_settings["environments"]
            if item["id"] == selected_id
        ),
        None,
    )
    if environment is None:
        raise HTTPException(status_code=422, detail="Execution environment is not configured")
    return environment["baseUrl"], execution_settings["apiTimeoutMs"]


def _request_url(base_url: str, configured_url: str, variables: dict[str, str]) -> str:
    rendered_url = _render(configured_url, variables)
    if rendered_url.startswith(("http://", "https://")):
        return rendered_url
    if not rendered_url.startswith("/"):
        rendered_url = f"/{rendered_url}"
    return f"{base_url.rstrip('/')}{rendered_url}"


def _json_path(document: Any, expression: str) -> Any:
    if expression == "$":
        return document
    if not expression.startswith("$"):
        raise HTTPException(status_code=422, detail=f"Invalid JSONPath: {expression}")

    current = document
    position = 1
    for match in JSON_PATH_TOKEN.finditer(expression, position):
        if match.start() != position:
            raise HTTPException(status_code=422, detail=f"Invalid JSONPath: {expression}")
        key, index = match.groups()
        try:
            current = current[key] if key is not None else current[int(index)]
        except (KeyError, IndexError, TypeError):
            return None
        position = match.end()
    if position != len(expression):
        raise HTTPException(status_code=422, detail=f"Invalid JSONPath: {expression}")
    return current


def _display(value: Any) -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return "null"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _assertion_result(
    assertion: ApiResponseAssertion,
    *,
    response_status: int,
    response_time_ms: int,
    response_body: Any,
) -> dict[str, Any]:
    if assertion.type == "statusCode":
        expression = "response.status"
        actual = response_status
    elif assertion.type == "responseTime":
        expression = "response.time_ms"
        actual = response_time_ms
    else:
        expression = assertion.target
        actual = _json_path(response_body, assertion.target)

    actual_text = _display(actual)
    if assertion.comparison == "notNull":
        passed = actual is not None
    elif assertion.comparison == "contains":
        passed = assertion.expected in actual_text
    else:
        passed = actual_text == assertion.expected
    return {
        "type": assertion.type,
        "expression": expression,
        "passed": passed,
        "expected": assertion.expected,
        "actual": actual_text,
    }


def debug_api_case(
    session: Session,
    payload: ApiCaseDebugRequest,
    *,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    base_url, timeout_ms = _environment(session, payload.environment)
    request_url = _request_url(base_url, payload.url, payload.variables)
    headers = {
        key: _render(str(value), payload.variables)
        for key, value in payload.headers.items()
    }
    params = [
        (_render(item.key, payload.variables), _render(item.value, payload.variables))
        for item in payload.query_params
        if item.enabled and item.key.strip()
    ]
    request_kwargs: dict[str, Any] = {"headers": headers, "params": params}
    if payload.body_type == "json":
        if payload.body_content:
            try:
                request_kwargs["json"] = json.loads(
                    _render(payload.body_content, payload.variables)
                )
            except json.JSONDecodeError as error:
                raise HTTPException(status_code=422, detail="Request body is not valid JSON") from error
        elif payload.request_body is not None:
            request_kwargs["json"] = payload.request_body
    elif payload.body_type in {"form-data", "x-www-form-urlencoded"}:
        form_fields = {
            _render(item.key, payload.variables): _render(item.value, payload.variables)
            for item in payload.body_fields
            if item.enabled and item.key.strip()
        }
        if payload.body_type == "form-data":
            request_kwargs["files"] = {
                key: (None, value) for key, value in form_fields.items()
            }
        else:
            request_kwargs["data"] = form_fields

    started_at = perf_counter()
    try:
        with httpx.Client(
            timeout=timeout_ms / 1000,
            follow_redirects=False,
            transport=transport,
        ) as client:
            response = client.request(payload.method, request_url, **request_kwargs)
    except httpx.RequestError as error:
        raise HTTPException(status_code=502, detail=f"Debug request failed: {error}") from error
    response_time_ms = round((perf_counter() - started_at) * 1000)
    try:
        response_body: Any = response.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        response_body = response.text

    assertion_results = [
        _assertion_result(
            assertion,
            response_status=response.status_code,
            response_time_ms=response_time_ms,
            response_body=response_body,
        )
        for assertion in payload.assertions
    ]
    extracts = {
        extract.name: _json_path(response_body, extract.jsonPath)
        for extract in payload.extracts
    }
    return {
        "requestUrl": str(response.request.url),
        "requestHeaders": dict(response.request.headers),
        "statusCode": response.status_code,
        "responseTimeMs": response_time_ms,
        "responseHeaders": dict(response.headers),
        "responseBody": response_body,
        "assertions": assertion_results,
        "extracts": extracts,
    }
