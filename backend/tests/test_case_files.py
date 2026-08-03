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
