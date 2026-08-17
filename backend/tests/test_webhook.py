"""Webhook 测试：连接验证与内网地址拦截（SSRF 防护）。"""

import socket

import httpx
from fastapi.testclient import TestClient


def test_webhook_connection_rejects_private_network_targets(client: TestClient) -> None:
    response = client.post(
        "/api/v1/settings/test-webhook",
        json={"channel": "feishu", "webhookUrl": "https://127.0.0.1/hook"},
    )

    assert response.status_code == 422


def test_webhook_connection_reports_success(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))
        ],
    )

    class WebhookResponse:
        status_code = 200

        def raise_for_status(self) -> None:
            return None

    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: WebhookResponse())

    response = client.post(
        "/api/v1/settings/test-webhook",
        json={"channel": "feishu", "webhookUrl": "https://open.feishu.cn/hook/example"},
    )

    assert response.status_code == 200
    assert response.json() == {"success": True, "message": "Webhook 连接成功"}
