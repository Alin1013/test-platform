from fastapi.testclient import TestClient


def test_ui_execution_can_be_started_and_queried(client: TestClient) -> None:
    started = client.post(
        "/api/v1/ui-test/executions",
        json={
            "projectId": 1,
            "suiteIds": [2, 7],
            "environment": "test",
            "browser": "chrome",
            "headless": True,
            "concurrency": 2,
        },
    )

    assert started.status_code == 200
    body = started.json()
    assert body["code"] == 200
    assert body["message"] == "success"
    assert body["data"]["executionId"].startswith("ui_exec_")
    assert body["data"]["status"] == "RUNNING"

    queried = client.get(
        f"/api/v1/ui-test/executions/{body['data']['executionId']}"
    )

    assert queried.status_code == 200
    data = queried.json()["data"]
    assert data["status"] == "RUNNING"
    assert data["summary"] == {
        "total": 2,
        "passed": 0,
        "failed": 0,
        "running": 0,
        "pending": 2,
        "durationMs": 0,
    }
    assert [item["caseName"] for item in data["cases"]] == [
        "登录表单校验",
        "支付结果页展示",
    ]
    assert all(item["browser"] == "chrome" for item in data["cases"])


def test_ui_execution_rejects_unconfigured_environment(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ui-test/executions",
        json={
            "projectId": 1,
            "suiteIds": [2],
            "environment": "unknown",
            "browser": "chrome",
            "headless": True,
            "concurrency": 1,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Execution environment is not configured"


def test_ui_execution_websocket_pushes_current_case_state(client: TestClient) -> None:
    execution_id = client.post(
        "/api/v1/ui-test/executions",
        json={
            "projectId": 1,
            "suiteIds": [2],
            "environment": "dev",
            "browser": "firefox",
            "headless": False,
            "concurrency": 1,
        },
    ).json()["data"]["executionId"]

    with client.websocket_connect(
        f"/ws/ui-test/execution/{execution_id}"
    ) as websocket:
        event = websocket.receive_json()

    assert event == {
        "event": "STEP_START",
        "caseId": 2,
        "stepIndex": 0,
        "action": "等待执行",
        "status": "PENDING",
        "log": "测试用例已加入执行队列",
    }


def test_ui_execution_can_be_interrupted(client: TestClient) -> None:
    execution_id = client.post(
        "/api/v1/ui-test/executions",
        json={
            "projectId": 1,
            "suiteIds": [2],
            "environment": "test",
            "browser": "edge",
            "headless": True,
            "concurrency": 1,
        },
    ).json()["data"]["executionId"]

    stopped = client.post(f"/api/v1/ui-test/executions/{execution_id}/stop")

    assert stopped.status_code == 200
    assert stopped.json() == {
        "code": 200,
        "message": "Execution stopped successfully",
    }
    report = client.get(f"/api/v1/ui-test/executions/{execution_id}").json()
    assert report["data"]["status"] == "CANCELED"
    assert report["data"]["cases"][0]["status"] == "SKIPPED"


def test_api_execution_can_be_started_and_reported(client: TestClient) -> None:
    started = client.post(
        "/api/v1/api-test/executions",
        json={
            "projectId": 1,
            "suiteIds": [3, 4],
            "envId": 3,
            "globalHeaders": {"Authorization": "Bearer token_xxx"},
            "iterations": 2,
            "rampUpTime": 200,
        },
    )

    assert started.status_code == 200
    body = started.json()
    assert body["code"] == 200
    assert body["message"] == "Execution started"
    assert body["data"]["executionId"].startswith("api_exec_")
    assert body["data"]["status"] == "RUNNING"

    report = client.get(
        f"/api/v1/api-test/executions/{body['data']['executionId']}/report"
    )

    assert report.status_code == 200
    data = report.json()["data"]
    assert data["summary"] == {
        "totalApi": 2,
        "passedApi": 0,
        "failedApi": 0,
        "pendingApi": 2,
        "avgResponseTimeMs": 0,
    }
    assert data["results"][0] == {
        "apiId": 3,
        "name": "用户资料查询",
        "method": "GET",
        "url": "/api/users/profile",
        "responseCode": None,
        "responseTimeMs": 0,
        "status": "PENDING",
        "requestData": {
            "headers": {"Authorization": "Bearer token_xxx"},
            "body": None,
        },
        "responseData": None,
        "assertions": [],
    }


def test_api_execution_can_be_stopped(client: TestClient) -> None:
    execution_id = client.post(
        "/api/v1/api-test/executions",
        json={
            "projectId": 1,
            "suiteIds": [3],
            "envId": 2,
            "globalHeaders": {},
            "iterations": 1,
        },
    ).json()["data"]["executionId"]

    stopped = client.post(f"/api/v1/api-test/executions/{execution_id}/stop")

    assert stopped.status_code == 200
    assert stopped.json() == {
        "code": 200,
        "message": "Execution stopped successfully",
    }


def test_execution_rejects_cases_from_another_type(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ui-test/executions",
        json={
            "projectId": 1,
            "suiteIds": [3],
            "environment": "dev",
            "browser": "chrome",
            "headless": True,
            "concurrency": 1,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Selected cases must all be UI automation cases"


def test_unified_ui_execution_exposes_summary_details_stop_and_events(
    client: TestClient,
) -> None:
    started = client.post(
        "/api/v1/executions/start",
        json={
            "type": "UI",
            "projectId": 1,
            "caseIds": [2, 7],
            "envName": "test",
            "config": {
                "browser": "chrome",
                "headless": True,
                "concurrency": 2,
            },
        },
    )

    assert started.status_code == 202
    execution_id = started.json()["data"]["executionId"]

    summary = client.get(
        f"/api/v1/executions/{execution_id}/summary"
    ).json()["data"]
    assert summary == {
        "executionId": execution_id,
        "type": "UI",
        "envName": "test",
        "status": "RUNNING",
        "totalCount": 2,
        "passedCount": 0,
        "failedCount": 0,
        "runningCount": 0,
        "pendingCount": 2,
        "passRate": 0.0,
        "avgLatencyMs": 0,
        "durationMs": 0,
        "startTime": summary["startTime"],
        "endTime": None,
    }

    details = client.get(
        f"/api/v1/executions/{execution_id}/details"
    ).json()["data"]
    assert details["type"] == "UI"
    assert [item["caseName"] for item in details["items"]] == [
        "登录表单校验",
        "支付结果页展示",
    ]

    with client.websocket_connect(f"/ws/execution/{execution_id}") as websocket:
        progress = websocket.receive_json()
        case_event = websocket.receive_json()
        log_event = websocket.receive_json()

    assert progress["type"] == "PROGRESS_UPDATE"
    assert progress["progress"] == 0
    assert case_event == {
        "type": "CASE_STATUS_CHANGE",
        "executionId": execution_id,
        "caseId": 2,
        "caseName": "登录表单校验",
        "status": "PENDING",
    }
    assert log_event == {
        "type": "STEP_LOG",
        "executionId": execution_id,
        "caseId": 2,
        "stepIndex": 0,
        "status": "PENDING",
        "log": "测试用例已加入执行队列",
    }

    stopped = client.post(f"/api/v1/executions/{execution_id}/stop")
    assert stopped.status_code == 200
    stopped_summary = client.get(
        f"/api/v1/executions/{execution_id}/summary"
    ).json()["data"]
    assert stopped_summary["status"] == "CANCELED"
    assert stopped_summary["endTime"] is not None


def test_unified_api_execution_snapshots_complete_runner_request(
    client: TestClient,
) -> None:
    created = client.post(
        "/api/v1/api-cases",
        json={
            "title": "订单查询执行快照",
            "type": "api",
            "module_id": "payments",
            "priority": "P1",
            "api_details": {
                "url": "/api/orders",
                "method": "POST",
                "expected_code": 200,
                "headers": {"X-Case": "saved"},
                "query_params": [
                    {"enabled": True, "key": "page", "value": "1"}
                ],
                "body_type": "json",
                "body_content": '{"state":"paid"}',
                "assertions": [
                    {
                        "type": "jsonPath",
                        "target": "$.code",
                        "comparison": "equals",
                        "expected": "0",
                    }
                ],
                "extracts": [{"name": "orderId", "jsonPath": "$.data.id"}],
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
                "globalHeaders": {"Authorization": "Bearer batch"},
                "iterations": 1,
                "rampUpTime": 0,
            },
        },
    )

    assert started.status_code == 202
    execution_id = started.json()["data"]["executionId"]
    item = client.get(
        f"/api/v1/executions/{execution_id}/details"
    ).json()["data"]["items"][0]
    assert item["requestData"] == {
        "method": "POST",
        "url": "/api/orders",
        "headers": {"X-Case": "saved", "Authorization": "Bearer batch"},
        "queryParams": [{"enabled": True, "key": "page", "value": "1"}],
        "bodyType": "json",
        "bodyContent": '{"state":"paid"}',
        "bodyFields": [],
    }
    assert item["assertionRules"][0]["target"] == "$.code"
    assert item["extractRules"] == [{"name": "orderId", "jsonPath": "$.data.id"}]
