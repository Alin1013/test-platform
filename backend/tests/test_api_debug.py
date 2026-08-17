"""API 调试用例测试：请求渲染、变量替换、断言与提取。"""

import httpx
from fastapi.testclient import TestClient

from backend.app.services import execution_worker


def test_api_case_debug_executes_request_and_evaluates_response(client: TestClient) -> None:
    def handle_request(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == (
            "https://test-api.example.com/api/users?page=1&source=automation"
        )
        assert request.headers["authorization"] == "Bearer rendered-token"
        assert request.headers["x-trace"] == "debug"
        assert request.content == b'{"name":"example"}'
        return httpx.Response(
            200,
            headers={"Content-Type": "application/json"},
            json={"code": 0, "data": {"token": "response-token"}},
        )

    client.app.state.api_debug_transport = httpx.MockTransport(handle_request)

    response = client.post(
        "/api/v1/api-cases/debug",
        json={
            "environment": "test",
            "variables": {"token": "rendered-token"},
            "url": "{{baseUrl}}/api/users",
            "method": "POST",
            "expected_code": 200,
            "headers": {
                "Authorization": "Bearer {{token}}",
                "X-Trace": "debug",
            },
            "query_params": [
                {"enabled": True, "key": "page", "value": "1"},
                {"enabled": False, "key": "ignored", "value": "yes"},
                {"enabled": True, "key": "source", "value": "automation"},
            ],
            "body_type": "json",
            "body_content": '{"name":"example"}',
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
            "extracts": [{"name": "token", "jsonPath": "$.data.token"}],
        },
    )

    assert response.status_code == 200
    result = response.json()["data"]
    assert result["requestUrl"] == (
        "https://test-api.example.com/api/users?page=1&source=automation"
    )
    assert result["statusCode"] == 200
    assert result["responseBody"] == {
        "code": 0,
        "data": {"token": "response-token"},
    }
    assert result["requestData"]["url"] == (
        "https://test-api.example.com/api/users?page=1&source=automation"
    )
    assert result["requestData"]["method"] == "POST"
    assert result["requestData"]["headers"]["authorization"] == (
        "Bearer rendered-token"
    )
    assert result["requestData"]["body"] == {"name": "example"}
    assert result["assertions"] == [
        {
            "type": "statusCode",
            "expression": "response.status",
            "passed": True,
            "expected": "200",
            "actual": "200",
        },
        {
            "type": "jsonPath",
            "expression": "$.code",
            "passed": True,
            "expected": "0",
            "actual": "0",
        },
    ]
    assert result["extracts"] == {"token": "response-token"}
    assert result["responseTimeMs"] >= 0


def test_api_case_debug_rejects_unknown_variables_before_sending(client: TestClient) -> None:
    client.app.state.api_debug_transport = httpx.MockTransport(
        lambda _: (_ for _ in ()).throw(AssertionError("request must not be sent"))
    )

    response = client.post(
        "/api/v1/api-cases/debug",
        json={
            "environment": "test",
            "url": "/api/users/{{missing}}",
            "method": "GET",
            "expected_code": 200,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Undefined variable: missing"


def test_api_case_debug_renders_variables_in_structured_json_body(
    client: TestClient,
) -> None:
    def handle_request(request: httpx.Request) -> httpx.Response:
        assert request.content == b'{"account":{"id":"user-42"},"roles":["admin","user-42"]}'
        return httpx.Response(200, request=request, json={"ok": True})

    client.app.state.api_debug_transport = httpx.MockTransport(handle_request)

    response = client.post(
        "/api/v1/api-cases/debug",
        json={
            "environment": "test",
            "variables": {"user_id": "user-42"},
            "url": "/api/users",
            "method": "POST",
            "expected_code": 200,
            "body_type": "json",
            "request_body": {
                "account": {"id": "{{ user_id }}"},
                "roles": ["admin", "{{user_id}}"],
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["requestData"]["body"] == {
        "account": {"id": "user-42"},
        "roles": ["admin", "user-42"],
    }


def test_api_debug_alias_uses_standard_jsonpath_and_response_time_threshold(
    client: TestClient,
) -> None:
    client.app.state.api_debug_transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            request=request,
            json={"data": {"session": {"token": "nested-token"}}},
        )
    )

    response = client.post(
        "/api/v1/debug/api-run",
        json={
            "environment": "test",
            "url": "/api/session",
            "method": "GET",
            "expected_code": 200,
            "assertions": [
                {
                    "type": "jsonPath",
                    "target": "$..token",
                    "comparison": "equals",
                    "expected": "nested-token",
                },
                {
                    "type": "responseTime",
                    "target": "",
                    "comparison": "equals",
                    "expected": "500",
                },
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["success"] is True
    assert data["assertions"][0]["actual"] == "nested-token"
    assert data["assertions"][1]["passed"] is True


def test_api_debug_returns_structured_network_failure(client: TestClient) -> None:
    def fail_request(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    client.app.state.api_debug_transport = httpx.MockTransport(fail_request)

    response = client.post(
        "/api/v1/debug/api-run",
        json={
            "environment": "test",
            "url": "/api/unavailable",
            "method": "GET",
            "expected_code": 200,
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["success"] is False
    assert data["statusCode"] is None
    assert data["responseBody"] is None
    assert data["assertions"] == []
    assert data["responseTimeMs"] >= 0
    assert "connection refused" in data["error"]


def test_ui_debug_renders_environment_and_variables_before_running(
    client: TestClient,
) -> None:
    class DebugUiRunner:
        def run(self, *, steps: list[dict], config: dict) -> dict:
            assert steps == [
                {
                    "stepIndex": 1,
                    "action": "navigate",
                    "locatorType": "",
                    "target": "",
                    "value": "https://test-api.example.com/users/demo-user",
                    "assertion": "none",
                    "expected": "",
                }
            ]
            assert config["browser"] == "chrome"
            assert config["headless"] is True
            assert config["timeoutSeconds"] == 15
            return {
                "status": "PASSED",
                "durationMs": 23,
                "stepResults": [
                    {
                        "stepIndex": 1,
                        "action": "navigate",
                        "status": "PASSED",
                        "durationMs": 23,
                    }
                ],
                "logs": ["步骤 1 执行成功"],
                "screenshotUrl": None,
                "videoUrl": "/uploads/executions/debug.webm",
                "traceUrl": "/uploads/executions/debug.trace.zip",
                "errorMessage": None,
            }

    client.app.state.ui_runner = DebugUiRunner()
    payload = {
        "environment": "test",
        "variables": {"user": "demo-user"},
        "browser": "chrome",
        "headless": True,
        "timeout_seconds": 15,
        "steps": [
            {
                "stepIndex": 1,
                "action": "OpenUrl",
                "locatorType": "",
                "selector": "",
                "value": "{{baseUrl}}/users/{{user}}",
            }
        ],
    }

    response = client.post("/api/v1/debug/ui-run", json=payload)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["success"] is True
    assert data["stepResults"][0]["status"] == "PASSED"
    assert data["videoUrl"] == "/uploads/executions/debug.webm"
    assert data["traceUrl"] == "/uploads/executions/debug.trace.zip"

    unified = client.post(
        "/api/v1/debug-run",
        json={"type": "UI", "config": payload},
    )
    assert unified.status_code == 200
    assert unified.json()["data"]["success"] is True


def test_queued_api_execution_is_completed_by_background_worker(
    client: TestClient,
) -> None:
    client.app.state.api_debug_transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            request=request,
            json={"code": 0, "data": {"token": "next-token"}},
        )
    )
    created = client.post(
        "/api/v1/api-cases",
        json={
            "title": "后台执行接口",
            "type": "api",
            "module_id": "auth",
            "priority": "P0",
            "api_details": {
                "url": "/api/worker",
                "method": "GET",
                "expected_code": 200,
                "assertions": [
                    {
                        "type": "jsonPath",
                        "target": "$.code",
                        "comparison": "equals",
                        "expected": "0",
                    }
                ],
                "extracts": [{"name": "token", "jsonPath": "$.data.token"}],
            },
        },
    ).json()

    started = client.post(
        "/api/v1/executions/start",
        json={
            "type": "API",
            "projectId": 1,
            "caseIds": [created["id"]],
            "envName": "test",
            "config": {
                "globalHeaders": {},
                "variables": {},
                "iterations": 1,
                "rampUpTime": 0,
            },
        },
    )

    assert started.status_code == 202
    assert started.json()["data"]["status"] == "PENDING"
    execution_id = started.json()["data"]["executionId"]
    execution_worker.run_next_execution(
        client.app.state.session_factory,
        api_transport=client.app.state.api_debug_transport,
    )
    summary = client.get(
        f"/api/v1/executions/{execution_id}/summary"
    ).json()["data"]
    assert summary["status"] == "COMPLETED"
    assert summary["passedCount"] == 1
    detail = client.get(
        f"/api/v1/executions/{execution_id}/details"
    ).json()["data"]["items"][0]
    assert detail["status"] == "PASSED"
    assert detail["requestData"]["url"] == "https://test-api.example.com/api/worker"
    assert detail["responseData"]["responseBody"]["data"]["token"] == "next-token"
    assert detail["assertionResults"][0]["passed"] is True
