"""API 用例执行器：渲染变量、发送请求、执行断言与提取字段。"""

from __future__ import annotations

import json
from time import perf_counter
from typing import Any

import httpx
from fastapi import HTTPException
from jsonpath_ng.ext import parse as parse_jsonpath
from sqlalchemy.orm import Session

from ..schemas import ApiCaseDebugRequest, ApiResponseAssertion
from .settings import get_environment, get_settings
from .variables import render_text, render_value


def _environment(session: Session, environment_id: str | None) -> tuple[str, int]:
    """解析执行环境：未指定时使用默认环境，返回 baseUrl 与超时毫秒数。"""
    execution_settings = get_settings(session)["execution"]
    selected_id = environment_id or execution_settings["defaultEnvironmentId"]
    environment = get_environment(session, selected_id)
    return environment["baseUrl"], execution_settings["apiTimeoutMs"]


def _request_url(base_url: str, configured_url: str, variables: dict[str, str]) -> str:
    """拼接最终请求 URL：绝对地址直接用，相对地址挂到 baseUrl 下。"""
    rendered_url = render_text(configured_url, variables)
    if rendered_url.startswith(("http://", "https://")):
        return rendered_url
    if not rendered_url.startswith("/"):
        rendered_url = f"/{rendered_url}"
    return f"{base_url.rstrip('/')}{rendered_url}"


def _json_path(document: Any, expression: str) -> Any:
    """对响应体执行 JSONPath 提取；表达式非法时报 422。"""
    try:
        matches = parse_jsonpath(expression).find(document)
    except Exception as error:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid JSONPath: {expression}",
        ) from error
    return matches[0].value if matches else None


def _display(value: Any) -> str:
    """把断言实际值转成可比较/可展示的字符串。"""
    if isinstance(value, str):
        return value
    if value is None:
        return "null"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _request_body(request: httpx.Request) -> Any:
    """还原请求体：JSON 反序列化，其他类型按文本返回。"""
    if not request.content:
        return None
    text = request.content.decode(errors="replace")
    if "application/json" in request.headers.get("content-type", ""):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text
    return text


def _assertion_result(
    assertion: ApiResponseAssertion,
    *,
    response_status: int,
    response_time_ms: int,
    response_body: Any,
) -> dict[str, Any]:
    """执行单条断言：状态码/响应时间走专用字段，其余走 JSONPath 取值比较。"""
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
    if assertion.type == "responseTime":
        try:
            passed = response_time_ms <= int(assertion.expected)
        except ValueError:
            passed = False
    elif assertion.comparison == "notNull":
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
    """发送调试请求并返回完整请求/响应信息、断言结果与提取字段。"""
    base_url, timeout_ms = _environment(session, payload.environment)
    variables = {**payload.variables, "baseUrl": base_url}
    request_url = _request_url(base_url, payload.url, variables)
    headers = {
        key: render_text(str(value), variables)
        for key, value in payload.headers.items()
    }
    params = [
        (render_text(item.key, variables), render_text(item.value, variables))
        for item in payload.query_params
        if item.enabled and item.key.strip()
    ]
    request_kwargs: dict[str, Any] = {"headers": headers, "params": params}
    if payload.body_type == "json":
        if payload.body_content:
            try:
                request_kwargs["json"] = json.loads(
                    render_text(payload.body_content, variables)
                )
            except json.JSONDecodeError as error:
                raise HTTPException(status_code=422, detail="Request body is not valid JSON") from error
        elif payload.request_body is not None:
            request_kwargs["json"] = render_value(
                payload.request_body,
                variables,
            )
    elif payload.body_type in {"form-data", "x-www-form-urlencoded"}:
        form_fields = {
            render_text(item.key, variables): render_text(
                item.value, variables
            )
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
        "success": all(result["passed"] for result in assertion_results),
        "requestUrl": str(response.request.url),
        "requestHeaders": dict(response.request.headers),
        "requestData": {
            "method": response.request.method,
            "url": str(response.request.url),
            "headers": dict(response.request.headers),
            "body": _request_body(response.request),
        },
        "statusCode": response.status_code,
        "responseTimeMs": response_time_ms,
        "responseHeaders": dict(response.headers),
        "responseBody": response_body,
        "assertions": assertion_results,
        "extracts": extracts,
    }
