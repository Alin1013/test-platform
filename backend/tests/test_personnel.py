"""人员管理接口测试：用户筛选、创建、启停、删除与角色权限。"""

from fastapi.testclient import TestClient


def test_users_support_search_role_and_status_filters(client: TestClient) -> None:
    response = client.get(
        "/api/v1/users",
        params={"keyword": "jiangshan", "role": "测试负责人", "status": "enabled"},
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["email"] == "jiangshan@example.com"


def test_user_can_be_created_and_disabled(client: TestClient) -> None:
    created = client.post(
        "/api/v1/users",
        json={
            "name": "周宁",
            "email": "zhouning@example.com",
            "department": "质量保障部",
            "role": "测试工程师",
            "password": "correct-horse-battery-staple",
        },
    )

    assert created.status_code == 201
    assert created.json()["role"] == "测试工程师"
    assert "password" not in created.json()
    assert "password_hash" not in created.json()

    disabled = client.patch(
        f"/api/v1/users/{created.json()['id']}/status", json={"status": "disabled"}
    )
    assert disabled.status_code == 200
    assert disabled.json()["status"] == "disabled"
    assert disabled.json()["enabled"] is False

    duplicate = client.post(
        "/api/v1/users",
        json={
            "name": "重复用户",
            "email": "zhouning@example.com",
            "department": "研发部",
            "role": "开发人员",
            "password": "another-secure-password",
        },
    )
    assert duplicate.status_code == 409


def test_role_permissions_can_be_updated(client: TestClient) -> None:
    roles = client.get("/api/v1/roles").json()
    engineer = next(role for role in roles if role["name"] == "测试工程师")

    updated_permissions = {**engineer["permissions"], "personnelManage": True}
    updated = client.put(
        f"/api/v1/roles/{engineer['id']}/permissions",
        json={"permissions": updated_permissions},
    )

    assert updated.status_code == 200
    assert updated.json()["permissions"]["personnelManage"] is True
    refreshed = client.get("/api/v1/roles").json()
    assert next(role for role in refreshed if role["id"] == engineer["id"])["permissions"] == updated_permissions


def test_enabled_user_cannot_be_deleted(client: TestClient) -> None:
    created = client.post(
        "/api/v1/users",
        json={
            "name": "待删除用户",
            "email": "delete-me@example.com",
            "department": "质量保障部",
            "role": "测试工程师",
            "password": "correct-horse-battery-staple",
        },
    )
    assert created.status_code == 201
    user_id = created.json()["id"]

    deleted = client.delete(f"/api/v1/users/{user_id}")

    assert deleted.status_code == 409
    assert deleted.json()["detail"] == "请先停用账号"
    users = client.get("/api/v1/users", params={"page_size": 100}).json()["items"]
    assert any(user["id"] == user_id for user in users)


def test_disabled_user_can_be_deleted(client: TestClient) -> None:
    created = client.post(
        "/api/v1/users",
        json={
            "name": "待删除用户",
            "email": "delete-me@example.com",
            "department": "质量保障部",
            "role": "测试工程师",
            "password": "correct-horse-battery-staple",
        },
    ).json()
    user_id = created["id"]
    disabled = client.patch(
        f"/api/v1/users/{user_id}/status", json={"status": "disabled"}
    )
    assert disabled.status_code == 200

    deleted = client.delete(f"/api/v1/users/{user_id}")

    assert deleted.status_code == 204
    users = client.get("/api/v1/users", params={"page_size": 100}).json()["items"]
    assert all(user["id"] != user_id for user in users)
    assert client.delete(f"/api/v1/users/{user_id}").status_code == 404


def test_user_with_related_records_cannot_be_deleted(client: TestClient) -> None:
    user = client.post(
        "/api/v1/users",
        json={
            "name": "有关联记录的用户",
            "email": "linked-records@example.com",
            "department": "研发部",
            "role": "开发人员",
            "password": "correct-horse-battery-staple",
        },
    ).json()
    module = client.post("/api/v1/modules", json={"name": "临时模块", "project_id": 1}).json()
    case = client.post(
        "/api/v1/test-cases",
        json={
            "title": "关联用例",
            "type": "functional",
            "module_id": module["id"],
            "priority": "P1",
            "author_id": user["id"],
        },
    )
    assert case.status_code == 201
    disabled = client.patch(
        f"/api/v1/users/{user['id']}/status", json={"status": "disabled"}
    )
    assert disabled.status_code == 200

    deleted = client.delete(f"/api/v1/users/{user['id']}")

    assert deleted.status_code == 409
