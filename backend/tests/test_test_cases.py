from fastapi.testclient import TestClient


def test_modules_returns_project_tree(client: TestClient) -> None:
    response = client.get("/api/v1/modules", params={"project_id": 1})

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "auth",
            "name": "鉴权",
            "project_id": 1,
            "children": [
                {"id": "profile", "name": "用户资料", "project_id": 1, "children": []}
            ],
        },
        {"id": "payments", "name": "支付", "project_id": 1, "children": []},
    ]


def test_api_case_can_be_created_searched_updated_and_deleted(client: TestClient) -> None:
    created = client.post(
        "/api/v1/test-cases",
        json={
            "title": "刷新访问令牌",
            "type": "api",
            "module_id": "auth",
            "priority": "P1",
            "status": "维护中",
            "author_id": 1,
            "api_details": {
                "url": "/api/token/refresh",
                "method": "POST",
                "expected_code": 201,
                "headers": {"Content-Type": "application/json"},
                "request_body": {"refreshToken": "example"},
                "expected_response": {"ok": True},
            },
        },
    )

    assert created.status_code == 201
    case = created.json()
    assert case["code"].startswith("API-")
    assert case["api_details"]["url"] == "/api/token/refresh"

    listed = client.get(
        "/api/v1/test-cases",
        params={"type": "api", "keyword": "token/refresh", "priority": "P1"},
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["title"] == "刷新访问令牌"

    updated = client.put(
        f"/api/v1/test-cases/{case['id']}",
        json={"status": "已通过", "api_details": {"expected_code": 200}},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "已通过"
    assert updated.json()["api_details"]["expected_code"] == 200
    assert updated.json()["api_details"]["url"] == "/api/token/refresh"

    deleted = client.delete(f"/api/v1/test-cases/{case['id']}")
    assert deleted.status_code == 204
    assert client.get("/api/v1/test-cases", params={"keyword": case["code"]}).json()["total"] == 0
