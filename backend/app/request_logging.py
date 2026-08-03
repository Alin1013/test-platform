import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from time import perf_counter
from typing import Any
from urllib.parse import parse_qsl

from starlette.types import ASGIApp, Message, Receive, Scope, Send


LOG_FILE_NAME = "requests.log"
LOG_MAX_BYTES = 10 * 1024 * 1024
LOG_BACKUP_COUNT = 5
MAX_CAPTURE_BYTES = 16 * 1024
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


def _header_value(headers: list[tuple[bytes, bytes]], name: bytes) -> str | None:
    for header_name, value in headers:
        if header_name.lower() == name:
            return value.decode("latin-1")
    return None


def _media_type(content_type: str | None) -> str:
    return content_type.partition(";")[0].strip().lower() if content_type else ""


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
    if isinstance(value, str):
        fields = parse_qsl(value, keep_blank_values=True)
        if any(_normalized_key(key) in SENSITIVE_KEYS for key, _ in fields):
            return "***"
    return value


def _form_payload(raw: bytes) -> dict[str, str | list[str]]:
    result: dict[str, str | list[str]] = {}
    for key, value in parse_qsl(raw.decode("utf-8"), keep_blank_values=True):
        existing = result.get(key)
        if existing is None:
            result[key] = value
        elif isinstance(existing, list):
            existing.append(value)
        else:
            result[key] = [existing, value]
    return result


def _is_binary_media_type(media_type: str) -> bool:
    return not (
        media_type == "application/json"
        or media_type.endswith("+json")
        or media_type == "application/x-www-form-urlencoded"
        or media_type.startswith("text/")
    )


@dataclass
class _BodyCapture:
    content_type: str | None
    content: bytearray = field(default_factory=bytearray)
    size_bytes: int = 0

    def add(self, chunk: bytes) -> None:
        self.size_bytes += len(chunk)
        remaining = MAX_CAPTURE_BYTES - len(self.content)
        if remaining > 0:
            self.content.extend(chunk[:remaining])

    def render(self) -> Any:
        if self.size_bytes == 0:
            return None

        media_type = _media_type(self.content_type)
        if self.size_bytes > MAX_CAPTURE_BYTES:
            metadata: dict[str, object] = {
                "content_type": self.content_type,
                "size_bytes": self.size_bytes,
                "truncated": True,
            }
            if _is_binary_media_type(media_type):
                metadata["binary"] = True
            return metadata

        raw = bytes(self.content)
        if _is_binary_media_type(media_type):
            return {
                "content_type": self.content_type,
                "size_bytes": self.size_bytes,
                "binary": True,
            }

        if media_type == "application/json" or media_type.endswith("+json"):
            try:
                return _redact(json.loads(raw.decode("utf-8")))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return {
                    "content_type": self.content_type,
                    "size_bytes": self.size_bytes,
                    "unparseable": True,
                }

        if media_type == "application/x-www-form-urlencoded":
            try:
                return _redact(_form_payload(raw))
            except UnicodeDecodeError:
                return {
                    "content_type": self.content_type,
                    "size_bytes": self.size_bytes,
                    "unparseable": True,
                }

        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return {
                "content_type": self.content_type,
                "size_bytes": self.size_bytes,
                "unparseable": True,
            }


class RequestLogWriter:
    def __init__(self, log_path: Path) -> None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        self._handler = RotatingFileHandler(
            log_path,
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
            encoding="utf-8",
        )
        self._handler.setFormatter(logging.Formatter("%(message)s"))
        self._logger = logging.Logger(
            f"backend.requests.{log_path}", level=logging.INFO
        )
        self._logger.addHandler(self._handler)
        self._logger.propagate = False

    def write(self, record: dict) -> None:
        self._logger.info(
            json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        )

    def close(self) -> None:
        self._logger.removeHandler(self._handler)
        self._handler.close()


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
        request_content_type = _header_value(scope.get("headers", []), b"content-type")
        request_body = _BodyCapture(request_content_type)
        response_body = _BodyCapture(None)

        async def logged_receive() -> Message:
            message = await receive()
            if message["type"] == "http.request":
                request_body.add(message.get("body", b""))
            return message

        async def logged_send(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                response_body.content_type = _header_value(
                    message.get("headers", []), b"content-type"
                )
            elif message["type"] == "http.response.body":
                response_body.add(message.get("body", b""))
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
                    "response_content_type": response_body.content_type,
                    "request_body": request_body.render(),
                    "response_body": response_body.render(),
                }
            )
