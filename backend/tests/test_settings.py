from fastapi.testclient import TestClient


def test_system_settings_can_be_read_and_replaced(client: TestClient) -> None:
    current = client.get("/api/v1/settings")

    assert current.status_code == 200
    settings = current.json()
    assert settings["general"]["platformName"] == "测试平台"
    assert settings["execution"]["apiTimeoutMs"] == 30000

    settings["general"]["platformName"] = "质量中心"
    settings["execution"]["retryCount"] = 2
    settings["ai"]["apiKey"] = "secret-key"
    updated = client.post("/api/v1/settings", json=settings)

    assert updated.status_code == 200
    assert updated.json() == settings
    assert client.get("/api/v1/settings").json() == settings


def test_system_settings_reject_invalid_execution_limits(client: TestClient) -> None:
    settings = client.get("/api/v1/settings").json()
    settings["execution"]["retryCount"] = 10

    response = client.post("/api/v1/settings", json=settings)

    assert response.status_code == 422


def test_system_settings_persist_named_environments(client: TestClient) -> None:
    settings = client.get("/api/v1/settings").json()
    settings["execution"]["environments"].append(
        {"id": "staging", "name": "STAG", "baseUrl": "https://staging.example.com"}
    )
    settings["execution"]["defaultEnvironmentId"] = "staging"

    updated = client.post("/api/v1/settings", json=settings)

    assert updated.status_code == 200
    assert updated.json()["execution"]["defaultEnvironmentId"] == "staging"
    assert updated.json()["execution"]["environments"][-1]["name"] == "STAG"


def test_webhook_connection_endpoint_returns_connection_result(client: TestClient) -> None:
    response = client.post(
        "/api/v1/settings/test-webhook",
        json={
            "channel": "wechatWork",
            "webhookUrl": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "message": "Webhook 连接成功",
    }
