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
        "avatar": None,
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


def test_user_can_update_profile_without_revoking_access_token(client: TestClient) -> None:
    login = client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "Test1234"},
    )
    authorization = {"Authorization": f"Bearer {login.json()['access_token']}"}

    updated = client.patch(
        "/api/v1/auth/me",
        headers=authorization,
        json={"name": "江珊（负责人）", "avatar": "data:image/png;base64,YXZhdGFy"},
    )

    assert updated.status_code == 200
    assert updated.json()["password_changed"] is False
    assert updated.json()["user"]["name"] == "江珊（负责人）"
    assert updated.json()["user"]["avatar"] == "data:image/png;base64,YXZhdGFy"
    current = client.get("/api/v1/auth/me", headers=authorization)
    assert current.status_code == 200
    assert current.json()["name"] == "江珊（负责人）"


def test_password_change_revokes_all_sessions_and_replaces_password(
    client: TestClient,
) -> None:
    first_login = client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "Test1234"},
    ).json()
    second_login = client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "Test1234"},
    ).json()
    first_authorization = {
        "Authorization": f"Bearer {first_login['access_token']}"
    }
    second_authorization = {
        "Authorization": f"Bearer {second_login['access_token']}"
    }

    updated = client.patch(
        "/api/v1/auth/me",
        headers=first_authorization,
        json={"password": "NewPass123"},
    )

    assert updated.status_code == 200
    assert updated.json()["password_changed"] is True
    assert client.get("/api/v1/auth/me", headers=first_authorization).status_code == 401
    assert client.get("/api/v1/auth/me", headers=second_authorization).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "Test1234"},
    ).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "NewPass123"},
    ).status_code == 200


def test_profile_update_rejects_null_name(client: TestClient) -> None:
    login = client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "Test1234"},
    ).json()
    authorization = {"Authorization": f"Bearer {login['access_token']}"}

    response = client.patch(
        "/api/v1/auth/me",
        headers=authorization,
        json={"name": None},
    )

    assert response.status_code == 422
    assert client.get("/api/v1/auth/me", headers=authorization).json()["name"] == "江珊"


def test_profile_update_rejects_unsupported_avatar_data(client: TestClient) -> None:
    login = client.post(
        "/api/v1/auth/login",
        json={"account": "jiangshan", "password": "Test1234"},
    ).json()
    authorization = {"Authorization": f"Bearer {login['access_token']}"}

    remote_image = client.patch(
        "/api/v1/auth/me",
        headers=authorization,
        json={"avatar": "https://example.com/avatar.png"},
    )
    svg_image = client.patch(
        "/api/v1/auth/me",
        headers=authorization,
        json={"avatar": "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="},
    )

    assert remote_image.status_code == 422
    assert svg_image.status_code == 422
