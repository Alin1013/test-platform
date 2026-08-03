import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from time import perf_counter
from typing import Any
from urllib.parse import parse_qsl, urlencode

from fastapi import FastAPI
from starlette.types import ASGIApp, Message, Receive, Scope, Send


LOG_FILE_NAME = "requests.log"
LOG_MAX_BYTES = 10 * 1024 * 1024
LOG_BACKUP_COUNT = 5
SENSITIVE_KEYS = {
    "password",
    "passwd",
    "passwordhash",
    "token",
    "accesstoken",
    "refreshtoken",
    "authorization",
    "cookie",
    "setcookie",
    "clientsecret",
    "apikey",
}


def _header_value(headers: list[tuple[bytes, bytes]], name: str) -> str | None:
    encoded_name = name.encode("latin-1")
    for header_name, value in headers:
        if header_name.lower() == encoded_name:
            return value.decode("latin-1")
    return None


def _media_type(content_type: str | None) -> str | None:
    if content_type is None:
        return None
    return content_type.partition(";")[0].strip().casefold()


def _normalized_key(key: object) -> str:
    return "".join(character for character in str(key).casefold() if character.isalnum())


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "***" if _normalized_key(key) in SENSITIVE_KEYS else _redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _parse_form_fields(text: str) -> dict[str, str | list[str]]:
    fields: dict[str, str | list[str]] = {}
    for key, value in parse_qsl(text, keep_blank_values=True):
        existing = fields.get(key)
        if existing is None:
            fields[key] = value
        elif isinstance(existing, list):
            existing.append(value)
        else:
            fields[key] = [existing, value]
    return fields


def _redact_form_strings(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _redact_form_strings(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact_form_strings(item) for item in value]
    if isinstance(value, str):
        fields = _parse_form_fields(value)
        if any(_normalized_key(key) in SENSITIVE_KEYS for key in fields):
            return urlencode(_redact(fields), doseq=True)
    return value


@dataclass
class _BodyCapture:
    content_type: str | None
    redact_form_strings: bool = False
    content: bytearray = field(default_factory=bytearray)

    def add(self, chunk: bytes) -> None:
        self.content.extend(chunk)

    def render(self) -> Any | None:
        if not self.content:
            return None

        size_bytes = len(self.content)
        try:
            text = bytes(self.content).decode("utf-8")
            media_type = _media_type(self.content_type)
            if media_type == "application/json" or (
                media_type is not None
                and media_type.startswith("application/")
                and media_type.endswith("+json")
            ):
                body = _redact(json.loads(text))
                return _redact_form_strings(body) if self.redact_form_strings else body
            if media_type == "application/x-www-form-urlencoded":
                return _redact(_parse_form_fields(text))
            return text
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {
                "content_type": self.content_type,
                "size_bytes": size_bytes,
                "unparseable": True,
            }


class RequestLogWriter:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.handler = RotatingFileHandler(
            path,
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
            encoding="utf-8",
        )
        self.handler.setFormatter(logging.Formatter("%(message)s"))
        self.logger = logging.Logger(f"request-logging-{id(self)}", level=logging.INFO)
        self.logger.addHandler(self.handler)
        self.logger.propagate = False

    def write(self, entry: dict[str, object]) -> None:
        self.logger.info(json.dumps(entry, ensure_ascii=False, separators=(",", ":")))

    def close(self) -> None:
        self.logger.removeHandler(self.handler)
        self.handler.close()


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp, writer: RequestLogWriter) -> None:
        self.app = app
        self.writer = writer

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started_at = perf_counter()
        status_code = 500
        response_content_type: str | None = None
        request_content_type = _header_value(scope.get("headers", []), "content-type")
        request_capture = _BodyCapture(request_content_type)
        response_capture: _BodyCapture | None = None

        async def logged_receive() -> Message:
            message = await receive()
            if message["type"] == "http.request":
                request_capture.add(message.get("body", b""))
            return message

        async def logged_send(message: Message) -> None:
            nonlocal response_capture, response_content_type, status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                response_content_type = _header_value(message.get("headers", []), "content-type")
                response_capture = _BodyCapture(
                    response_content_type,
                    redact_form_strings=(
                        _media_type(request_content_type)
                        == "application/x-www-form-urlencoded"
                    ),
                )
            elif message["type"] == "http.response.body" and response_capture is not None:
                response_capture.add(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, logged_receive, logged_send)
        finally:
            client = scope.get("client")
            self.writer.write(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "client_ip": client[0] if client else None,
                    "method": scope["method"],
                    "path": scope["path"],
                    "status_code": status_code,
                    "duration_ms": round((perf_counter() - started_at) * 1000, 3),
                    "request_content_type": request_content_type,
                    "response_content_type": response_content_type,
                    "request_body": request_capture.render(),
                    "response_body": response_capture.render()
                    if response_capture is not None
                    else None,
                }
            )


class RequestLoggingFastAPI(FastAPI):
    def __init__(self, *, request_log_writer: RequestLogWriter, **kwargs: Any) -> None:
        self._request_log_writer = request_log_writer
        super().__init__(**kwargs)

    def build_middleware_stack(self) -> ASGIApp:
        return RequestLoggingMiddleware(
            super().build_middleware_stack(), self._request_log_writer
        )
