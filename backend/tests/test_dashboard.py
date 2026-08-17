"""仪表盘接口测试：用例统计与最近用例列表。"""

from fastapi.testclient import TestClient


def test_dashboard_stats_returns_seeded_case_counts(client: TestClient) -> None:
    response = client.get("/api/v1/dashboard/stats")

    assert response.status_code == 200
    assert response.json() == {
        "functional": 2,
        "api": 3,
        "ui": 2,
        "total": 7,
    }


def test_recent_cases_is_paginated_and_contains_display_fields(client: TestClient) -> None:
    response = client.get(
        "/api/v1/dashboard/recent-cases", params={"page": 2, "page_size": 3}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 2
    assert body["page_size"] == 3
    assert body["total"] == 7
    assert len(body["items"]) == 3
    assert {
        "id",
        "code",
        "title",
        "type",
        "priority",
        "status",
        "author_name",
        "updated_at",
    } <= body["items"][0].keys()
