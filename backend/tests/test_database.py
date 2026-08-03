import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from backend.app.models import TestCase as CaseRecordModel


def test_sqlite_rejects_records_with_missing_foreign_keys(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        session.add(
            CaseRecordModel(
                code="FUN-INVALID",
                title="孤立用例",
                type="functional",
                module_id="missing-module",
                priority="P1",
                status="草稿",
                author_id=9999,
            )
        )

        with pytest.raises(IntegrityError):
            session.commit()
