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


def test_api_automation_case_persists_runner_configuration(client: TestClient) -> None:
    created = client.post(
        "/api/v1/api-cases",
        json={
            "title": "登录接口自动化",
            "type": "api",
            "module_id": "auth",
            "priority": "P0",
            "status": "维护中",
            "author_id": 1,
            "api_details": {
                "url": "/api/auth/login",
                "method": "POST",
                "expected_code": 200,
                "headers": {"Content-Type": "application/json"},
                "query_params": [
                    {"enabled": True, "key": "source", "value": "automation"}
                ],
                "body_type": "json",
                "body_content": '{"account":"jiangshan"}',
                "body_fields": [],
                "assertions": [
                    {
                        "type": "statusCode",
                        "target": "",
                        "comparison": "equals",
                        "expected": "200",
                    },
                    {
                        "type": "jsonPath",
                        "target": "$.code",
                        "comparison": "equals",
                        "expected": "0",
                    },
                ],
                "extracts": [{"name": "accessToken", "jsonPath": "$.data.token"}],
            },
        },
    )

    assert created.status_code == 201
    details = created.json()["api_details"]
    assert details["query_params"] == [
        {"enabled": True, "key": "source", "value": "automation"}
    ]
    assert details["body_type"] == "json"
    assert details["body_content"] == '{"account":"jiangshan"}'
    assert details["assertions"][1]["target"] == "$.code"
    assert details["extracts"] == [
        {"name": "accessToken", "jsonPath": "$.data.token"}
    ]


def test_api_case_normalizes_legacy_frontend_automation_config(client: TestClient) -> None:
    created = client.post(
        "/api/v1/test-cases",
        json={
            "title": "兼容旧版配置",
            "type": "api",
            "module_id": "auth",
            "priority": "P1",
            "api_details": {
                "url": "/api/legacy",
                "method": "POST",
                "expected_code": 201,
                "request_body": {"name": "example"},
                "expected_response": {
                    "automation_config": {
                        "version": 1,
                        "query_params": [
                            {"enabled": True, "key": "page", "value": "1"}
                        ],
                        "body_type": "json",
                        "body_fields": [],
                        "assertions": [
                            {
                                "type": "statusCode",
                                "target": "",
                                "comparison": "equals",
                                "expected": "201",
                            }
                        ],
                        "extracts": [],
                    }
                },
            },
        },
    )

    assert created.status_code == 201
    details = created.json()["api_details"]
    assert details["query_params"][0]["key"] == "page"
    assert details["body_type"] == "json"
    assert details["body_content"] == '{"name": "example"}'
    assert details["assertions"][0]["expected"] == "201"


def test_dedicated_ui_case_endpoint_rejects_other_case_types(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ui-cases",
        json={
            "title": "错误类型",
            "type": "api",
            "module_id": "auth",
            "priority": "P1",
            "api_details": {
                "url": "/api/example",
                "method": "GET",
                "expected_code": 200,
            },
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Only UI automation cases are accepted"


def test_ui_case_creation_persists_execution_config_and_steps(client: TestClient) -> None:
    created = client.post(
        "/api/v1/test-cases",
        json={
            "title": "用户登录 - 密码错误提示校验",
            "type": "ui",
            "module_id": "auth",
            "priority": "P0",
            "status": "维护中",
            "author_id": 1,
            "ui_details": {
                "description": "验证错误密码提示与登录按钮状态",
                "dependency_case_id": 2,
                "browser": "chrome",
                "environment": "test",
                "timeout_seconds": 45,
                "retry_count": 1,
                "steps": [
                    {
                        "action": "input",
                        "locatorType": "id",
                        "target": "password",
                        "value": "wrong-password",
                        "assertion": "none",
                        "expected": "",
                    }
                ],
            },
        },
    )

    assert created.status_code == 201
    details = created.json()["ui_details"]
    assert details == {
        "description": "验证错误密码提示与登录按钮状态",
        "dependency_case_id": 2,
        "browser": "chrome",
        "environment": "test",
        "timeout_seconds": 45,
        "retry_count": 1,
        "steps": [
            {
                "action": "input",
                "locatorType": "id",
                "target": "password",
                "value": "wrong-password",
                "assertion": "none",
                "expected": "",
            }
        ],
    }

    listed = client.get("/api/v1/test-cases", params={"type": "ui"})
    persisted = next(item for item in listed.json()["items"] if item["id"] == created.json()["id"])
    assert persisted["ui_details"] == details


def test_ui_assert_step_requires_a_meaningful_assertion(client: TestClient) -> None:
    response = client.post(
        "/api/v1/test-cases",
        json={
            "title": "校验登录提示",
            "type": "ui",
            "module_id": "auth",
            "priority": "P1",
            "author_id": 1,
            "ui_details": {
                "steps": [
                    {
                        "action": "assert",
                        "locatorType": "css",
                        "target": "#login-message",
                        "value": "",
                        "assertion": "none",
                        "expected": "",
                    }
                ]
            },
        },
    )

    assert response.status_code == 422
