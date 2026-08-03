import json
import logging
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from time import perf_counter
from starlette.types import ASGIApp, Message, Receive, Scope, Send


LOG_FILE_NAME = "requests.log"
LOG_MAX_BYTES = 10 * 1024 * 1024
LOG_BACKUP_COUNT = 5


def _header_value(headers: list[tuple[bytes, bytes]], name: str) -> str | None:
    encoded_name = name.encode("latin-1")
    for header_name, value in headers:
        if header_name.lower() == encoded_name:
            return value.decode("latin-1")
    return None


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

        async def send_with_response_details(message: Message) -> None:
            nonlocal response_content_type, status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                response_content_type = _header_value(message.get("headers", []), "content-type")
            await send(message)

        try:
            await self.app(scope, receive, send_with_response_details)
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
                    "request_content_type": _header_value(scope.get("headers", []), "content-type"),
                    "response_content_type": response_content_type,
                    "request_body": None,
                    "response_body": None,
                }
            )
