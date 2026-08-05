import io

from fastapi.testclient import TestClient
from openpyxl import load_workbook


def test_cases_can_be_exported_as_filtered_csv_and_xlsx(client: TestClient) -> None:
    csv_response = client.post(
        "/api/v1/test-cases/export", json={"format": "csv", "type": "api"}
    )

    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")
    csv_text = csv_response.content.decode("utf-8-sig")
    assert "API-253301" in csv_text
    assert "FUN-12583" not in csv_text

    xlsx_response = client.post(
        "/api/v1/test-cases/export", json={"format": "xlsx", "module_id": "auth"}
    )
    assert xlsx_response.status_code == 200
    workbook = load_workbook(io.BytesIO(xlsx_response.content), read_only=True)
    rows = list(workbook.active.values)
    assert rows[0][:4] == ("code", "title", "type", "module_id")
    assert any(row[0] == "FUN-12583" for row in rows[1:])


def test_csv_cases_are_imported_in_one_transaction(client: TestClient) -> None:
    csv_content = (
        "code,title,type,module_id,priority,status,author_id,url,method,expected_code\n"
        "FUN-90001,导入功能用例,functional,auth,P1,草稿,1,,,\n"
        "API-90001,导入接口用例,api,payments,P0,维护中,1,/api/import,POST,201\n"
    ).encode()
    response = client.post(
        "/api/v1/test-cases/import",
        files={"file": ("cases.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 201
    assert response.json()["imported_count"] == 2
    assert client.get("/api/v1/test-cases", params={"keyword": "90001"}).json()["total"] == 2


def test_invalid_import_rolls_back_every_row(client: TestClient) -> None:
    csv_content = (
        "code,title,type,module_id,priority,status,author_id\n"
        "FUN-91001,本应回滚,functional,auth,P1,草稿,1\n"
        "FUN-91002,模块不存在,functional,missing,P1,草稿,1\n"
    ).encode()
    response = client.post(
        "/api/v1/test-cases/import",
        files={"file": ("cases.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 422
    assert "row 3" in response.json()["detail"]
    assert client.get("/api/v1/test-cases", params={"keyword": "91001"}).json()["total"] == 0


def test_functional_import_requires_standard_headers_and_persists_business_fields(
    client: TestClient,
) -> None:
    headers = "用例目录,用例名称,需求ID,前置条件,用例步骤,预期结果,用例类型,用例状态,用例等级,创建人,归属迭代,是否冒烟,项目归属"
    row = "鉴权,导入功能用例,REQ-IMPORT,账号已启用,\"打开登录页\n点击登录\",进入首页,功能用例,维护中,P1,江珊,Sprint 13,是,测试平台"
    response = client.post(
        "/api/v1/test-cases/import",
        files={"file": ("functional.csv", f"{headers}\n{row}".encode("utf-8"), "text/csv")},
    )

    assert response.status_code == 201
    imported = client.get("/api/v1/test-cases", params={"type": "functional"}).json()["items"][0]
    assert imported["module_id"] == "auth"
    assert imported["requirement_id"] == "REQ-IMPORT"
    assert imported["test_steps"] == "打开登录页\n点击登录"
    assert imported["is_smoke"] is True

    invalid_headers = headers.replace("项目归属", "项目")
    invalid = client.post(
        "/api/v1/test-cases/import",
        files={"file": ("invalid.csv", f"{invalid_headers}\n{row}".encode("utf-8"), "text/csv")},
    )
    assert invalid.status_code == 422
    assert "表头不一致" in invalid.json()["detail"]


def test_functional_import_uses_selected_module_and_apifox_enums(
    client: TestClient,
) -> None:
    headers = "用例目录,用例名称,需求ID,前置条件,用例步骤,预期结果,用例类型,用例状态,用例等级,创建人,归属迭代,是否冒烟,项目归属"
    row = ",导入 Apifox 功能用例,REQ-APIFOX,账号已启用,打开登录页,进入首页,功能测试,正常,中,江珊,Sprint 13,否,测试平台"
    response = client.post(
        "/api/v1/test-cases/import?module_id=auth",
        files={"file": ("apifox-functional.csv", f"{headers}\n{row}".encode("utf-8"), "text/csv")},
    )

    assert response.status_code == 201
    imported = client.get(
        "/api/v1/test-cases",
        params={"type": "functional", "keyword": "导入 Apifox 功能用例"},
    ).json()["items"][0]
    assert imported["module_id"] == "auth"
    assert imported["type"] == "functional"
    assert imported["priority"] == "P1"
    assert imported["status"] == "维护中"
    assert imported["is_smoke"] is False


def test_import_rejects_rows_without_a_module_with_actionable_error(
    client: TestClient,
) -> None:
    headers = "用例目录,用例名称,需求ID,前置条件,用例步骤,预期结果,用例类型,用例状态,用例等级,创建人,归属迭代,是否冒烟,项目归属"
    row = ",缺少模块的用例,REQ-MISSING-MODULE,,,,功能用例,草稿,P1,江珊,,,测试平台"

    response = client.post(
        "/api/v1/test-cases/import",
        files={"file": ("missing-module.csv", f"{headers}\n{row}".encode("utf-8"), "text/csv")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Invalid row 2: module_id is required; fill in the module column or select a module"
    )
