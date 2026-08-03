import json
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.middleware.gzip import GZipMiddleware

from backend.app.database import Base
from backend.app.main import create_app


@contextmanager
def logging_client(
    tmp_path: Path, *, raise_server_exceptions: bool = False
) -> Iterator[tuple[TestClient, Path]]:
    log_path = tmp_path / "logs" / "requests.log"
    app = create_app(
        f"sqlite:///{tmp_path / 'test.db'}",
        upload_dir=tmp_path / "uploads",
        log_dir=log_path.parent,
    )

    @app.get("/__test/error")
    def error() -> None:
        raise RuntimeError("test error")

    engine = app.state.session_factory.kw["bind"]
    Base.metadata.create_all(engine)
    try:
        with TestClient(app, raise_server_exceptions=raise_server_exceptions) as test_client:
            yield test_client, log_path
    finally:
        Base.metadata.drop_all(engine)


def read_records(log_path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines()]


def test_each_http_request_writes_one_structured_record(tmp_path: Path) -> None:
    with logging_client(tmp_path) as (client, log_path):
        assert (
            client.get(
                "/health?probe=ready",
                headers={"content-type": "application/test"},
            ).status_code
            == 200
        )
        assert client.get("/missing").status_code == 404
        error_response = client.get("/__test/error")
        assert error_response.status_code == 500
        assert error_response.headers["content-type"] == "text/plain; charset=utf-8"

    records = read_records(log_path)

    assert [(record["method"], record["path"], record["status_code"]) for record in records] == [
        ("GET", "/health", 200),
        ("GET", "/missing", 404),
        ("GET", "/__test/error", 500),
    ]
    assert [record["request_content_type"] for record in records] == [
        "application/test",
        None,
        None,
    ]
    assert [record["response_content_type"] for record in records] == [
        "application/json",
        "application/json",
        "text/plain; charset=utf-8",
    ]
    for record in records:
        timestamp = datetime.fromisoformat(str(record["timestamp"]))
        assert timestamp.tzinfo is not None
        assert timestamp.utcoffset() == timedelta(0)
        assert record["client_ip"] == "testclient"
        assert float(record["duration_ms"]) >= 0
        assert record["request_body"] is None
    assert [record["response_body"] for record in records] == [
        {"status": "ok"},
        {"detail": "Not Found"},
        "Internal Server Error",
    ]


def test_unhandled_error_is_logged_then_reraised(tmp_path: Path) -> None:
    with logging_client(tmp_path, raise_server_exceptions=True) as (client, log_path):
        with pytest.raises(RuntimeError, match="test error"):
            client.get("/__test/error")

    records = read_records(log_path)

    assert [(record["path"], record["status_code"]) for record in records] == [
        ("/__test/error", 500)
    ]


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

    assert record["request_body"] == {"account": "jiangshan", "password": "***"}
    response_body = record["response_body"]
    assert isinstance(response_body, dict)
    assert response_body["access_token"] == "***"
    assert response_body["user"]["account"] == "jiangshan"
    assert "Test1234" not in raw_log
    assert access_token not in raw_log


def test_app_accepts_middleware_added_after_factory_creation(tmp_path: Path) -> None:
    log_path = tmp_path / "logs" / "requests.log"
    app = create_app(
        f"sqlite:///{tmp_path / 'test.db'}",
        upload_dir=tmp_path / "uploads",
        log_dir=log_path.parent,
    )
    app.add_middleware(GZipMiddleware, minimum_size=0)

    engine = app.state.session_factory.kw["bind"]
    Base.metadata.create_all(engine)
    try:
        with TestClient(app) as client:
            response = client.get("/health")
            assert response.status_code == 200
            assert response.headers["content-encoding"] == "gzip"
    finally:
        Base.metadata.drop_all(engine)

    records = read_records(log_path)
    assert [(record["path"], record["status_code"]) for record in records] == [
        ("/health", 200)
    ]
