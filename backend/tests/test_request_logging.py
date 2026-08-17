"""请求日志测试：结构记录、脱敏与二进制摘要。"""

import json
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from fastapi import Response
from fastapi.testclient import TestClient
from starlette.responses import StreamingResponse

from backend.app.database import Base
from backend.app.main import create_app


@contextmanager
def logging_client(tmp_path: Path) -> Iterator[tuple[TestClient, Path]]:
    log_path = tmp_path / "logs" / "requests.log"
    app = create_app(
        f"sqlite:///{tmp_path / 'request-logging.db'}",
        upload_dir=tmp_path / "uploads",
        log_dir=log_path.parent,
    )

    @app.get("/__test/error")
    def raise_unhandled_error() -> None:
        raise RuntimeError("test error")

    @app.get("/__test/binary")
    def binary_response() -> Response:
        return Response(content=b"\x00\xff", media_type="application/octet-stream")

    @app.get("/__test/large")
    def large_response() -> dict[str, str]:
        return {"payload": "x" * 20_000}

    @app.get("/__test/text-download")
    def text_download() -> Response:
        return Response(
            content="download-body",
            media_type="text/plain",
            headers={"Content-Disposition": 'attachment; filename="report.txt"'},
        )

    @app.get("/__test/invalid-text")
    def invalid_text() -> Response:
        return Response(content=b"\xff", media_type="text/plain")

    @app.get("/__test/stream-error")
    def stream_error() -> StreamingResponse:
        def body() -> Iterator[bytes]:
            yield b"partial"
            raise RuntimeError("stream error")

        return StreamingResponse(body(), media_type="text/plain")

    engine = app.state.session_factory.kw["bind"]
    Base.metadata.create_all(engine)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client, log_path
    Base.metadata.drop_all(engine)


def read_records(log_path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in log_path.read_text(encoding="utf-8").splitlines()
    ]


def test_each_http_request_writes_one_structured_record(tmp_path: Path) -> None:
    with logging_client(tmp_path) as (client, log_path):
        assert client.get("/health").status_code == 200
        assert client.get("/missing").status_code == 404
        assert client.get("/__test/error").status_code == 500

        records = read_records(log_path)

    assert [
        (item["method"], item["path"], item["status_code"]) for item in records
    ] == [
        ("GET", "/health", 200),
        ("GET", "/missing", 404),
        ("GET", "/__test/error", 500),
    ]
    for record in records:
        datetime.fromisoformat(record["timestamp"])
        assert record["client_ip"] == "testclient"
        assert record["duration_ms"] >= 0
        assert "request_body" in record
        assert "response_body" in record


def test_json_bodies_are_logged_with_sensitive_fields_redacted(tmp_path: Path) -> None:
    with logging_client(tmp_path) as (client, log_path):
        response = client.post(
            "/api/v1/auth/login",
            json={"account": "jiangshan", "password": "Test1234"},
        )
        assert response.status_code == 200
        access_token = response.json()["access_token"]
        record = read_records(log_path)[-1]
        raw_log = log_path.read_text(encoding="utf-8")

    assert record["request_body"] == {
        "account": "jiangshan",
        "password": "***",
    }
    assert record["response_body"]["access_token"] == "***"
    assert record["response_body"]["user"]["account"] == "jiangshan"
    assert "Test1234" not in raw_log
    assert access_token not in raw_log


def test_form_bodies_are_logged_with_sensitive_fields_redacted(tmp_path: Path) -> None:
    with logging_client(tmp_path) as (client, log_path):
        response = client.post(
            "/api/v1/auth/login",
            data={"account": "jiangshan", "password": "Test1234"},
        )
        assert response.status_code == 422
        record = read_records(log_path)[-1]
        raw_log = log_path.read_text(encoding="utf-8")

    assert record["request_body"] == {
        "account": "jiangshan",
        "password": "***",
    }
    assert "Test1234" not in raw_log


def test_multipart_and_binary_bodies_only_log_metadata(tmp_path: Path) -> None:
    with logging_client(tmp_path) as (client, log_path):
        upload = client.post(
            "/api/v1/xmind/upload-parse",
            files={"file": ("cases.xmind", b"not-a-zip", "application/octet-stream")},
        )
        assert upload.status_code == 422
        binary = client.get("/__test/binary")
        assert binary.status_code == 200
        upload_record, binary_record = read_records(log_path)[-2:]

    assert upload_record["request_body"]["binary"] is True
    assert upload_record["request_body"]["size_bytes"] > len(b"not-a-zip")
    assert upload_record["request_body"]["content_type"].startswith(
        "multipart/form-data"
    )
    assert binary_record["response_body"] == {
        "content_type": "application/octet-stream",
        "size_bytes": 2,
        "binary": True,
    }


def test_large_request_and_response_bodies_are_truncated_safely(
    tmp_path: Path,
) -> None:
    with logging_client(tmp_path) as (client, log_path):
        oversized_request = client.post(
            "/api/v1/auth/login",
            json={
                "account": "jiangshan",
                "password": "Test1234",
                "padding": "x" * 20_000,
            },
        )
        assert oversized_request.status_code == 422
        large_response = client.get("/__test/large")
        assert large_response.status_code == 200
        request_record, response_record = read_records(log_path)[-2:]
        raw_log = log_path.read_text(encoding="utf-8")

    assert request_record["request_body"]["truncated"] is True
    assert request_record["request_body"]["size_bytes"] > 16 * 1024
    assert response_record["response_body"]["truncated"] is True
    assert response_record["response_body"]["size_bytes"] > 16 * 1024
    assert "Test1234" not in raw_log
    assert "x" * 16 * 1024 not in raw_log


def test_downloads_and_undecodable_text_only_log_metadata(tmp_path: Path) -> None:
    with logging_client(tmp_path) as (client, log_path):
        assert client.get("/__test/text-download").status_code == 200
        assert client.get("/__test/invalid-text").status_code == 200
        download_record, invalid_text_record = read_records(log_path)[-2:]

    assert download_record["response_body"] == {
        "content_type": "text/plain; charset=utf-8",
        "size_bytes": len(b"download-body"),
        "binary": True,
    }
    assert invalid_text_record["response_body"] == {
        "content_type": "text/plain; charset=utf-8",
        "size_bytes": 1,
        "binary": True,
    }


def test_application_error_after_response_start_is_logged_as_500(
    tmp_path: Path,
) -> None:
    with logging_client(tmp_path) as (client, log_path):
        client.get("/__test/stream-error")
        record = read_records(log_path)[-1]

    assert record["status_code"] == 500
