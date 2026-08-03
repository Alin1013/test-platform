from fastapi.testclient import TestClient


def test_user_can_login_and_read_current_profile(client: TestClient) -> None:
    login = client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "Test1234"},
    )

    assert login.status_code == 200
    payload = login.json()
    assert payload["token_type"] == "bearer"
    assert payload["access_token"]
    assert payload["user"] == {
        "id": 1,
        "account": "jiangshan",
        "name": "江珊",
        "email": "jiangshan@example.com",
        "department": "质量保障部",
        "role": "测试负责人",
        "permissions": {
            "caseView": True,
            "caseEdit": True,
            "xmindConvert": True,
            "personnelManage": True,
            "systemSettings": True,
        },
        "status": "enabled",
    }
    assert "password" not in str(payload).lower()

    current_user = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {payload['access_token']}"},
    )

    assert current_user.status_code == 200
    assert current_user.json() == payload["user"]


def test_logout_revokes_the_current_access_token(client: TestClient) -> None:
    login = client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "Test1234"},
    )
    authorization = {"Authorization": f"Bearer {login.json()['access_token']}"}

    logout = client.post("/api/v1/auth/logout", headers=authorization)

    assert logout.status_code == 204
    assert client.get("/api/v1/auth/me", headers=authorization).status_code == 401


def test_disabled_user_cannot_login_or_reuse_an_access_token(client: TestClient) -> None:
    login = client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "Test1234"},
    )
    authorization = {"Authorization": f"Bearer {login.json()['access_token']}"}
    user_id = login.json()["user"]["id"]

    disabled = client.patch(
        f"/api/v1/users/{user_id}/status",
        json={"status": "disabled"},
    )

    assert disabled.status_code == 200
    assert client.get("/api/v1/auth/me", headers=authorization).status_code == 401
    rejected_login = client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "Test1234"},
    )
    assert rejected_login.status_code == 401
    assert rejected_login.json()["detail"] == "Invalid account or password"
