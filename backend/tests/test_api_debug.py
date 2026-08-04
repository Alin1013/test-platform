import httpx
from fastapi.testclient import TestClient


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
            "url": "/api/users",
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
