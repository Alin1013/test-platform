from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.database import Base
from backend.app.main import create_app


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


def test_can_create_module_and_reuse_same_name_in_parent(client: TestClient) -> None:
    created = client.post(
        "/api/v1/modules",
        json={"name": "登录", "project_id": 1, "parent_id": "auth"},
    )

    assert created.status_code == 201
    module = created.json()
    assert module["name"] == "登录"
    assert module["project_id"] == 1
    assert module["parent_id"] == "auth"
    assert module["children"] == []

    repeated = client.post(
        "/api/v1/modules",
        json={"name": "登录", "project_id": 1, "parent_id": "auth"},
    )

    assert repeated.status_code == 200
    assert repeated.json()["id"] == module["id"]

    tree = client.get("/api/v1/modules", params={"project_id": 1}).json()
    auth = next(item for item in tree if item["id"] == "auth")
    assert {(item["id"], item["name"]) for item in auth["children"]} == {
        ("profile", "用户资料"),
        (module["id"], "登录"),
    }


def test_can_update_and_delete_empty_module(client: TestClient) -> None:
    created = client.post(
        "/api/v1/modules",
        json={"name": "临时模块", "project_id": 1},
    ).json()

    updated = client.patch(
        f"/api/v1/modules/{created['id']}",
        json={"name": "结算模块"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "结算模块"

    deleted = client.delete(f"/api/v1/modules/{created['id']}")
    assert deleted.status_code == 204
    tree = client.get("/api/v1/modules", params={"project_id": 1}).json()
    assert all(item["id"] != created["id"] for item in tree)


def test_cannot_delete_module_that_contains_test_cases(client: TestClient) -> None:
    response = client.delete("/api/v1/modules/auth")

    assert response.status_code == 409
    assert response.json()["detail"] == "包含测试用例的模块不能删除"
    assert client.get(
        "/api/v1/test-cases", params={"module_id": "auth"}
    ).json()["total"] > 0


def test_modules_and_test_cases_survive_application_restart(tmp_path: Path) -> None:
    database_url = f"sqlite:///{tmp_path / 'persistent.db'}"
    first_app = create_app(
        database_url,
        upload_dir=tmp_path / "first-uploads",
        log_dir=tmp_path / "first-logs",
    )
    Base.metadata.create_all(first_app.state.session_factory.kw["bind"])
    with TestClient(first_app) as first_client:
        module = first_client.post(
            "/api/v1/modules",
            json={"name": "持久化模块", "project_id": 1},
        ).json()
        created_case = first_client.post(
            "/api/v1/test-cases",
            json={
                "title": "重启后仍存在的用例",
                "type": "functional",
                "module_id": module["id"],
                "priority": "P1",
                "status": "草稿",
                "author_id": 1,
            },
        )
        assert created_case.status_code == 201

    second_app = create_app(
        database_url,
        upload_dir=tmp_path / "second-uploads",
        log_dir=tmp_path / "second-logs",
    )
    with TestClient(second_app) as second_client:
        modules = second_client.get(
            "/api/v1/modules", params={"project_id": 1}
        ).json()
        cases = second_client.get(
            "/api/v1/test-cases", params={"module_id": module["id"]}
        ).json()

    assert any(item["id"] == module["id"] for item in modules)
    assert cases["total"] == 1
    assert cases["items"][0]["title"] == "重启后仍存在的用例"


def test_functional_case_can_be_assigned_to_new_module(client: TestClient) -> None:
    module = client.post(
        "/api/v1/modules",
        json={"name": "结算", "project_id": 1},
    ).json()

    created = client.post(
        "/api/v1/test-cases",
        json={
            "title": "结算成功",
            "type": "functional",
            "module_id": module["id"],
            "priority": "P1",
            "status": "草稿",
            "author_id": 1,
            "project_name": "结算",
            "test_steps": "提交结算申请",
            "expected_result": "结算完成",
        },
    )

    assert created.status_code == 201
    assert created.json()["module_id"] == module["id"]
    assert client.get(
        "/api/v1/test-cases", params={"type": "functional", "module_id": module["id"]}
    ).json()["items"][0]["title"] == "结算成功"


def test_functional_cases_can_be_filtered_by_project_iteration_and_smoke(
    client: TestClient,
) -> None:
    cases = [
        ("目标非冒烟用例", "移动端", "V2.1.0", False),
        ("其他项目用例", "测试平台", "V2.1.0", False),
        ("其他迭代用例", "移动端", "V2.0.0", False),
        ("冒烟标记不同用例", "移动端", "V2.1.0", True),
    ]
    for title, project_name, iteration, is_smoke in cases:
        response = client.post(
            "/api/v1/test-cases",
            json={
                "title": title,
                "type": "functional",
                "module_id": "auth",
                "priority": "P1",
                "status": "维护中",
                "author_id": 1,
                "project_name": project_name,
                "iteration": iteration,
                "is_smoke": is_smoke,
                "test_steps": "执行测试步骤",
                "expected_result": "得到预期结果",
            },
        )
        assert response.status_code == 201

    listed = client.get(
        "/api/v1/test-cases",
        params={
            "type": "functional",
            "project_name": "移动端",
            "iteration": "V2.1.0",
            "is_smoke": "false",
        },
    )

    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["title"] == "目标非冒烟用例"


def test_functional_filter_options_are_distinct_and_not_page_limited(
    client: TestClient,
) -> None:
    for index in range(101):
        response = client.post(
            "/api/v1/test-cases",
            json={
                "title": f"筛选选项用例 {index}",
                "type": "functional",
                "module_id": "auth",
                "priority": "P1",
                "status": "维护中",
                "author_id": 1,
                "project_name": "移动端" if index == 100 else "测试平台",
                "iteration": "V2.1.0" if index == 100 else "V2.0.0",
                "test_steps": "执行测试步骤",
                "expected_result": "得到预期结果",
            },
        )
        assert response.status_code == 201

    options = client.get(
        "/api/v1/test-cases/filter-options",
        params={"type": "functional"},
    )

    assert options.status_code == 200
    assert options.json() == {
        "project_names": ["测试平台", "移动端"],
        "iterations": ["V2.0.0", "V2.1.0"],
    }


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


def test_dedicated_case_endpoints_update_matching_automation_types(
    client: TestClient,
) -> None:
    api_case = client.get(
        "/api/v1/test-cases", params={"type": "api", "page_size": 1}
    ).json()["items"][0]
    updated = client.put(
        f"/api/v1/api-cases/{api_case['id']}",
        json={"title": "接口专用路径更新"},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "接口专用路径更新"

    rejected = client.put(
        f"/api/v1/ui-cases/{api_case['id']}",
        json={"title": "错误类型更新"},
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "Only UI automation cases are accepted"


def test_ui_case_accepts_step_shape_from_backend_design(client: TestClient) -> None:
    created = client.post(
        "/api/v1/ui-cases",
        json={
            "title": "设计稿步骤兼容",
            "type": "ui",
            "module_id": "auth",
            "priority": "P1",
            "ui_details": {
                "steps": [
                    {
                        "stepIndex": 1,
                        "action": "OpenUrl",
                        "locatorType": "",
                        "selector": "",
                        "value": "https://test.example.com/login",
                    },
                    {
                        "stepIndex": 2,
                        "action": "Input",
                        "locatorType": "XPath",
                        "selector": "//input[@id='username']",
                        "value": "tester",
                    },
                ]
            },
        },
    )

    assert created.status_code == 201
    steps = created.json()["ui_details"]["steps"]
    assert steps[0]["stepIndex"] == 1
    assert steps[0]["action"] == "navigate"
    assert steps[1]["locatorType"] == "xpath"
    assert steps[1]["target"] == "//input[@id='username']"


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


def test_ui_case_creation_accepts_configured_environment_id(client: TestClient) -> None:
    created = client.post(
        "/api/v1/test-cases",
        json={
            "title": "开发环境登录冒烟",
            "type": "ui",
            "module_id": "auth",
            "priority": "P1",
            "status": "维护中",
            "author_id": 1,
            "ui_details": {
                "browser": "chrome",
                "environment": "dev",
                "steps": [
                    {
                        "action": "navigate",
                        "locatorType": "css",
                        "target": "{{baseUrl}}/login",
                        "value": "",
                        "assertion": "none",
                        "expected": "",
                    }
                ],
            },
        },
    )

    assert created.status_code == 201
    assert created.json()["ui_details"]["environment"] == "dev"


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
