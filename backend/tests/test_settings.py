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
