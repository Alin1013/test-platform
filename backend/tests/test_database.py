from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
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


def test_database_rejects_invalid_case_domain_values(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        session.add(
            CaseRecordModel(
                code="FUN-INVALID-PRIORITY",
                title="非法优先级",
                type="functional",
                module_id="auth",
                priority="urgent",
                status="草稿",
                author_id=1,
            )
        )

        with pytest.raises(IntegrityError):
            session.commit()


def test_auth_migration_resolves_all_account_name_collisions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database_url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    config = Config("alembic.ini")
    command.upgrade(config, "a41b892e7c10")

    engine = create_engine(database_url)
    now = "2026-08-03 10:45:00"
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO roles (id, name, permissions, created_at, updated_at) "
                "VALUES (1, '测试工程师', '{}', :now, :now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO users "
                "(id, name, email, department, role_id, status, password_hash, created_at, updated_at) "
                "VALUES "
                "(1, '甲', 'foo@example.com', '质量部', 1, 'enabled', NULL, :now, :now), "
                "(2, '乙', 'foo-3@example.com', '质量部', 1, 'enabled', NULL, :now, :now), "
                "(3, '丙', 'foo@other.example.com', '质量部', 1, 'enabled', NULL, :now, :now)"
            ),
            {"now": now},
        )

    command.upgrade(config, "head")

    with engine.connect() as connection:
        accounts = connection.execute(
            text("SELECT account FROM users ORDER BY id")
        ).scalars().all()
    assert accounts == ["foo", "foo-3", "foo-3-2"]
