import io
import json
import zipfile
from pathlib import Path
from time import monotonic, sleep

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.database import Base
from backend.app.main import create_app
from backend.app.services.xmind_worker import run_next_xmind_task


def make_xmind_file() -> bytes:
    content = [
        {
            "title": "登录测试",
            "rootTopic": {
                "title": "登录测试",
                "children": {
                    "attached": [
                        {
                            "title": "鉴权",
                            "children": {
                                "attached": [
                                    {"title": "账号密码登录成功"},
                                    {"title": "密码错误时提示"},
                                ]
                            },
                        }
                    ]
                },
            },
        }
    ]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("content.json", json.dumps(content, ensure_ascii=False))
    return buffer.getvalue()


def configure_llm(client: TestClient, transport: httpx.BaseTransport) -> None:
    settings = client.get("/api/v1/settings").json()
    settings["ai"]["apiKey"] = "test-key"
    client.post("/api/v1/settings", json=settings)
    client.app.state.xmind_llm_transport = transport


def wait_for_task_status(
    client: TestClient,
    task_id: int,
    expected_status: str,
    *,
    timeout_seconds: float = 6.0,
) -> dict:
    deadline = monotonic() + timeout_seconds
    last_body: dict | None = None
    while monotonic() < deadline:
        response = client.get(f"/api/v1/xmind/tasks/{task_id}")
        assert response.status_code == 200
        last_body = response.json()
        if last_body["status"] == expected_status:
            return last_body
        sleep(0.1)
    raise AssertionError(
        f"XMind task {task_id} did not reach {expected_status}; last body: {last_body}"
    )


def test_xmind_generation_task_is_processed_in_background(client: TestClient) -> None:
    response = client.post(
        "/api/v1/xmind/generate",
        files={"file": ("登录用例.xmind", make_xmind_file(), "application/octet-stream")},
        data={"uploader_id": "1"},
    )

    assert response.status_code == 201
    created = response.json()
    assert created["status"] == "PENDING"
    assert created["tree"][0]["title"] == "登录测试"
    assert created["cases"] == []

    listed = client.get("/api/v1/xmind/tasks")
    assert listed.status_code == 200
    assert listed.json()["items"][0]["status"] == "PENDING"

    configure_llm(
        client,
        httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {
                                        "cases": [
                                            {
                                                "用例名称": "账号密码登录成功",
                                                "用例步骤": "1. 提交正确账号密码",
                                                "预期结果": "1. 登录成功",
                                            }
                                        ]
                                    },
                                    ensure_ascii=False,
                                )
                            }
                        }
                    ]
                },
            )
        ),
    )

    run_next_xmind_task(
        client.app.state.session_factory,
        upload_dir=client.app.state.upload_dir,
        llm_transport=client.app.state.xmind_llm_transport,
    )

    detail = client.get(f"/api/v1/xmind/tasks/{created['id']}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["status"] == "WAITING_REVIEW"
    assert body["cases"][0]["用例名称"] == "账号密码登录成功"

    confirmed = client.post(
        f"/api/v1/xmind/tasks/{created['id']}/confirm",
        json={"module_mapping": {"登录测试/鉴权": "auth"}},
    )
    assert confirmed.status_code == 201
    assert confirmed.json()["saved_cases"][0]["title"] == "账号密码登录成功"

    functional_cases = client.get("/api/v1/test-cases", params={"keyword": "账号密码登录成功"})
    assert functional_cases.json()["total"] == 1


def test_xmind_generation_task_is_processed_by_app_background_worker(
    tmp_path: Path,
) -> None:
    app = create_app(
        f"sqlite:///{tmp_path / 'background-worker.db'}",
        upload_dir=tmp_path / "uploads",
        log_dir=tmp_path / "logs",
        start_background_workers=True,
    )
    app.state.xmind_llm_transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "cases": [
                                        {
                                            "用例名称": "账号密码登录成功",
                                            "用例步骤": "1. 提交正确账号密码",
                                            "预期结果": "1. 登录成功",
                                        }
                                    ]
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            },
        )
    )
    Base.metadata.create_all(app.state.session_factory.kw["bind"])

    with TestClient(app) as client:
        configure_llm(client, app.state.xmind_llm_transport)
        response = client.post(
            "/api/v1/xmind/generate",
            files={"file": ("自动推进.xmind", make_xmind_file(), "application/octet-stream")},
            data={"uploader_id": "1"},
        )
        assert response.status_code == 201
        created = response.json()

        detail = wait_for_task_status(client, created["id"], "WAITING_REVIEW")

    assert detail["parsed_cases_count"] == 1
    assert detail["cases"][0]["用例名称"] == "账号密码登录成功"


def test_failed_xmind_task_can_be_retried(client: TestClient) -> None:
    response = client.post(
        "/api/v1/xmind/generate",
        files={"file": ("失败用例.xmind", make_xmind_file(), "application/octet-stream")},
        data={"uploader_id": "1"},
    )
    assert response.status_code == 201
    task_id = response.json()["id"]

    configure_llm(
        client,
        httpx.MockTransport(lambda _: httpx.Response(500, json={"error": {"message": "temporary"}})),
    )

    with pytest.raises(Exception):
        run_next_xmind_task(
            client.app.state.session_factory,
            upload_dir=client.app.state.upload_dir,
            llm_transport=client.app.state.xmind_llm_transport,
        )

    failed = client.get(f"/api/v1/xmind/tasks/{task_id}")
    assert failed.json()["status"] == "FAILED"
    assert failed.json()["last_error"] == "XMind 用例生成失败，请稍后重试"

    retried = client.post(f"/api/v1/xmind/tasks/{task_id}/retry")
    assert retried.status_code == 200
    assert retried.json()["status"] == "PENDING"
