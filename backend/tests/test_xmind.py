"""XMind 解析测试：JSON/XML 格式解析、预览生成与上传保存。"""

import io
import json
import zipfile

from fastapi.testclient import TestClient


def make_xmind_file() -> bytes:
    content = [
        {
            "title": "登录测试",
            "rootTopic": {
                "title": "登录测试",
                "children": {
                    "attached": [
                        {
                            "title": "鉴权",
                            "children": {
                                "attached": [
                                    {"title": "账号密码登录成功"},
                                    {"title": "密码错误时提示"},
                                ]
                            },
                        }
                    ]
                },
            },
        }
    ]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("content.json", json.dumps(content, ensure_ascii=False))
    return buffer.getvalue()


def test_xmind_upload_returns_tree_case_preview_and_record(client: TestClient) -> None:
    response = client.post(
        "/api/v1/xmind/upload-parse",
        files={"file": ("登录用例.xmind", make_xmind_file(), "application/octet-stream")},
        data={"uploader_id": "1"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["record"]["file_name"] == "登录用例.xmind"
    assert body["record"]["parsed_cases_count"] == 2
    assert body["tree"][0]["title"] == "登录测试"
    assert [case["title"] for case in body["cases"]] == [
        "账号密码登录成功",
        "密码错误时提示",
    ]
    assert all(case["module"] == "鉴权" for case in body["cases"])
    assert body["saved_cases"] == []


def test_xmind_preview_can_be_saved_to_mapped_modules(client: TestClient) -> None:
    response = client.post(
        "/api/v1/xmind/upload-parse",
        files={"file": ("登录用例.xmind", make_xmind_file(), "application/octet-stream")},
        data={
            "uploader_id": "1",
            "save_cases": "true",
            "module_mapping": '{"鉴权":"auth"}',
        },
    )

    assert response.status_code == 201
    assert len(response.json()["saved_cases"]) == 2
    assert all(item["code"].startswith("FUN-") for item in response.json()["saved_cases"])
    listed = client.get("/api/v1/test-cases", params={"keyword": "登录成功"}).json()
    assert any(item["title"] == "账号密码登录成功" for item in listed["items"])


def test_xmind_upload_rejects_non_xmind_and_invalid_archives(client: TestClient) -> None:
    wrong_extension = client.post(
        "/api/v1/xmind/upload-parse",
        files={"file": ("cases.txt", b"text", "text/plain")},
        data={"uploader_id": "1"},
    )
    invalid_archive = client.post(
        "/api/v1/xmind/upload-parse",
        files={"file": ("cases.xmind", b"not-a-zip", "application/octet-stream")},
        data={"uploader_id": "1"},
    )

    assert wrong_extension.status_code == 415
    assert invalid_archive.status_code == 422
