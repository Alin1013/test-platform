"""执行模块测试：UI/API 执行启动、进度查询、取消与并发 worker。"""

from threading import Barrier, Event, Lock, Thread
from time import sleep

import httpx
from fastapi.testclient import TestClient

from backend.app.services import execution_worker


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
    assert report["data"]["status"] == "CANCELLED"
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
        "status": "PENDING",
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
    assert stopped_summary["status"] == "CANCELLED"
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


def test_queued_ui_execution_uses_configured_runner(client: TestClient) -> None:
    class SuccessfulUiRunner:
        def run(self, *, steps: list[dict], config: dict) -> dict:
            assert config["browser"] == "firefox"
            return {
                "status": "PASSED",
                "durationMs": 28,
                "stepResults": [
                    {"stepIndex": 1, "status": "PASSED", "durationMs": 28}
                ],
                "logs": [f"执行 {len(steps)} 个步骤"],
                "screenshotUrl": None,
                "videoUrl": "/uploads/executions/demo.webm",
                "traceUrl": "/uploads/executions/demo.trace.zip",
                "errorMessage": None,
            }

    client.app.state.ui_runner = SuccessfulUiRunner()
    started = client.post(
        "/api/v1/executions/start",
        json={
            "type": "UI",
            "projectId": 1,
            "caseIds": [2],
            "envName": "test",
            "config": {
                "browser": "firefox",
                "headless": True,
                "concurrency": 1,
            },
        },
    )

    assert started.status_code == 202
    execution_id = started.json()["data"]["executionId"]
    execution_worker.run_next_execution(
        client.app.state.session_factory,
        ui_runner=client.app.state.ui_runner,
    )
    summary = client.get(
        f"/api/v1/executions/{execution_id}/summary"
    ).json()["data"]
    assert summary["status"] == "COMPLETED"
    assert summary["passedCount"] == 1
    item = client.get(
        f"/api/v1/executions/{execution_id}/details"
    ).json()["data"]["items"][0]
    assert item["videoUrl"] == "/uploads/executions/demo.webm"
    assert item["logs"] == ["执行 0 个步骤"]


def test_execution_websocket_streams_worker_state_changes(client: TestClient) -> None:
    created = client.post(
        "/api/v1/api-cases",
        json={
            "title": "WebSocket 实时状态",
            "type": "api",
            "module_id": "auth",
            "priority": "P1",
            "api_details": {
                "url": "/api/realtime",
                "method": "GET",
                "expected_code": 200,
            },
        },
    ).json()
    execution_id = client.post(
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
    ).json()["data"]["executionId"]
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, request=request, json={"ok": True})
    )

    with client.websocket_connect(f"/ws/execution/{execution_id}") as websocket:
        worker = Thread(
            target=execution_worker.run_next_execution,
            args=(client.app.state.session_factory,),
            kwargs={"api_transport": transport},
        )
        worker.start()
        events = [websocket.receive_json() for _ in range(4)]
        worker.join(timeout=5)

    assert not worker.is_alive()
    assert [event["type"] for event in events] == [
        "PROGRESS_UPDATE",
        "CASE_STATUS_CHANGE",
        "PROGRESS_UPDATE",
        "CASE_STATUS_CHANGE",
    ]
    assert events[0]["status"] == "PENDING"
    assert events[2]["status"] == "COMPLETED"
    assert events[3]["status"] == "PASSED"


def test_concurrent_workers_execute_a_queued_case_only_once(client: TestClient) -> None:
    created = client.post(
        "/api/v1/api-cases",
        json={
            "title": "队列原子领取",
            "type": "api",
            "module_id": "auth",
            "priority": "P1",
            "api_details": {
                "url": "/api/queue-claim",
                "method": "GET",
                "expected_code": 200,
            },
        },
    ).json()
    client.post(
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
    request_count = 0
    count_lock = Lock()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        with count_lock:
            request_count += 1
        sleep(0.1)
        return httpx.Response(200, request=request, json={"ok": True})

    transport = httpx.MockTransport(handler)
    start_barrier = Barrier(3)

    def run_worker() -> None:
        start_barrier.wait()
        execution_worker.run_next_execution(
            client.app.state.session_factory,
            api_transport=transport,
        )

    workers = [Thread(target=run_worker) for _ in range(2)]
    for worker in workers:
        worker.start()
    start_barrier.wait()
    for worker in workers:
        worker.join(timeout=5)

    assert all(not worker.is_alive() for worker in workers)
    assert request_count == 1


def test_legacy_execution_is_not_consumed_by_queue_worker(client: TestClient) -> None:
    started = client.post(
        "/api/v1/ui-test/executions",
        json={
            "projectId": 1,
            "suiteIds": [2],
            "environment": "test",
            "browser": "chrome",
            "headless": True,
            "concurrency": 1,
        },
    )
    execution_id = started.json()["data"]["executionId"]

    assert execution_worker.run_next_execution(
        client.app.state.session_factory,
    ) is None
    report = client.get(f"/api/v1/ui-test/executions/{execution_id}").json()["data"]
    assert report["status"] == "RUNNING"
    assert report["cases"][0]["status"] == "PENDING"


def test_stopped_execution_is_not_overwritten_by_late_api_result(
    client: TestClient,
) -> None:
    created = client.post(
        "/api/v1/api-cases",
        json={
            "title": "中止运行中请求",
            "type": "api",
            "module_id": "auth",
            "priority": "P0",
            "api_details": {
                "url": "/api/slow",
                "method": "GET",
                "expected_code": 200,
            },
        },
    ).json()
    execution_id = client.post(
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
    ).json()["data"]["executionId"]
    request_started = Event()
    release_request = Event()

    def handler(request: httpx.Request) -> httpx.Response:
        request_started.set()
        release_request.wait(timeout=5)
        return httpx.Response(200, request=request, json={"ok": True})

    worker = Thread(
        target=execution_worker.run_next_execution,
        args=(client.app.state.session_factory,),
        kwargs={"api_transport": httpx.MockTransport(handler)},
    )
    worker.start()
    assert request_started.wait(timeout=5)

    stopped = client.post(f"/api/v1/executions/{execution_id}/stop")
    release_request.set()
    worker.join(timeout=5)

    assert stopped.status_code == 200
    assert not worker.is_alive()
    summary = client.get(
        f"/api/v1/executions/{execution_id}/summary"
    ).json()["data"]
    detail = client.get(
        f"/api/v1/executions/{execution_id}/details"
    ).json()["data"]["items"][0]
    assert summary["status"] == "CANCELLED"
    assert detail["status"] == "SKIPPED"


def test_ui_execution_honors_case_concurrency(client: TestClient) -> None:
    active_count = 0
    max_active_count = 0
    active_lock = Lock()

    class ConcurrentUiRunner:
        def run(self, *, steps: list[dict], config: dict) -> dict:
            nonlocal active_count, max_active_count
            with active_lock:
                active_count += 1
                max_active_count = max(max_active_count, active_count)
            sleep(0.1)
            with active_lock:
                active_count -= 1
            return {
                "status": "PASSED",
                "durationMs": 10_000,
                "stepResults": [],
                "logs": [],
                "screenshotUrl": None,
                "videoUrl": None,
                "traceUrl": None,
                "errorMessage": None,
            }

    execution_id = client.post(
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
    ).json()["data"]["executionId"]

    execution_worker.run_next_execution(
        client.app.state.session_factory,
        ui_runner=ConcurrentUiRunner(),
    )

    summary = client.get(
        f"/api/v1/executions/{execution_id}/summary"
    ).json()["data"]
    assert max_active_count == 2
    assert summary["passedCount"] == 2
    assert summary["durationMs"] < 5_000


def test_api_execution_honors_case_concurrency(client: TestClient) -> None:
    case_ids = []
    for suffix in ("a", "b"):
        created = client.post(
            "/api/v1/api-cases",
            json={
                "title": f"并发接口 {suffix}",
                "type": "api",
                "module_id": "auth",
                "priority": "P1",
                "api_details": {
                    "url": f"/api/concurrent/{suffix}",
                    "method": "GET",
                    "expected_code": 200,
                },
            },
        ).json()
        case_ids.append(created["id"])

    active_count = 0
    max_active_count = 0
    active_lock = Lock()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal active_count, max_active_count
        with active_lock:
            active_count += 1
            max_active_count = max(max_active_count, active_count)
        sleep(0.1)
        with active_lock:
            active_count -= 1
        return httpx.Response(200, request=request, json={"ok": True})

    started = client.post(
        "/api/v1/executions/start",
        json={
            "type": "API",
            "projectId": 1,
            "caseIds": case_ids,
            "envName": "test",
            "config": {
                "globalHeaders": {},
                "variables": {},
                "iterations": 1,
                "rampUpTime": 0,
                "concurrency": 2,
            },
        },
    )

    assert started.status_code == 202
    execution_worker.run_next_execution(
        client.app.state.session_factory,
        api_transport=httpx.MockTransport(handler),
    )
    assert max_active_count == 2


def test_api_execution_rejects_concurrency_with_extraction_chain(
    client: TestClient,
) -> None:
    created = client.post(
        "/api/v1/api-cases",
        json={
            "title": "变量提取链",
            "type": "api",
            "module_id": "auth",
            "priority": "P1",
            "api_details": {
                "url": "/api/token",
                "method": "GET",
                "expected_code": 200,
                "extracts": [{"name": "token", "jsonPath": "$.token"}],
            },
        },
    ).json()

    response = client.post(
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
                "concurrency": 2,
            },
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "API concurrency requires cases without extraction rules"
    )


def test_ui_step_log_is_persisted_before_case_finishes(client: TestClient) -> None:
    first_step_recorded = Event()
    release_runner = Event()

    class StreamingUiRunner:
        def run(self, *, steps: list[dict], config: dict) -> dict:
            on_step = config["onStep"]
            on_step(
                {
                    "stepIndex": 1,
                    "action": "navigate",
                    "status": "PASSED",
                    "durationMs": 12,
                },
                "步骤 1 执行成功",
            )
            first_step_recorded.set()
            release_runner.wait(timeout=5)
            return {
                "status": "PASSED",
                "durationMs": 12,
                "stepResults": [
                    {
                        "stepIndex": 1,
                        "action": "navigate",
                        "status": "PASSED",
                        "durationMs": 12,
                    }
                ],
                "logs": ["步骤 1 执行成功"],
                "screenshotUrl": None,
                "videoUrl": None,
                "traceUrl": None,
                "errorMessage": None,
            }

    execution_id = client.post(
        "/api/v1/executions/start",
        json={
            "type": "UI",
            "projectId": 1,
            "caseIds": [2],
            "envName": "test",
            "config": {
                "browser": "chrome",
                "headless": True,
                "concurrency": 1,
            },
        },
    ).json()["data"]["executionId"]
    worker = Thread(
        target=execution_worker.run_next_execution,
        args=(client.app.state.session_factory,),
        kwargs={"ui_runner": StreamingUiRunner()},
    )
    worker.start()

    assert first_step_recorded.wait(timeout=5)
    detail = client.get(
        f"/api/v1/executions/{execution_id}/details"
    ).json()["data"]["items"][0]
    release_runner.set()
    worker.join(timeout=5)

    assert detail["status"] == "RUNNING"
    assert detail["logs"] == ["步骤 1 执行成功"]
    assert detail["stepResults"] == [
        {
            "stepIndex": 1,
            "action": "navigate",
            "status": "PASSED",
            "durationMs": 12,
        }
    ]
