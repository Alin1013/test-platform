from io import StringIO
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from backend.app.models import Base, TestCase as CaseRecordModel


EXPECTED_TABLE_COMMENTS = {
    "roles": "角色与权限配置",
    "users": "用户账号、个人资料与启停状态",
    "auth_sessions": "用户登录会话与访问令牌摘要",
    "modules": "项目测试模块及父子层级",
    "test_cases": "测试用例公共信息",
    "api_case_details": "接口测试用例扩展信息",
    "ui_case_details": "UI 自动化用例扩展信息",
    "xmind_records": "XMind 文件上传与解析记录",
    "system_configs": "系统全局配置",
    "test_execution": "自动化测试执行主记录",
    "test_execution_detail": "自动化测试执行明细",
}


def test_all_application_tables_have_chinese_comments() -> None:
    assert set(Base.metadata.tables) == set(EXPECTED_TABLE_COMMENTS)

    comments = {
        table_name: Base.metadata.tables[table_name].comment
        for table_name in EXPECTED_TABLE_COMMENTS
    }

    assert comments == EXPECTED_TABLE_COMMENTS


def test_comment_migration_emits_native_table_comment_sql(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    output = StringIO()
    monkeypatch.setenv("DATABASE_URL", "postgresql://example.invalid/test_platform")
    config = Config("alembic.ini", output_buffer=output)

    command.upgrade(config, "d84e2b7f6a19:head", sql=True)

    generated_sql = output.getvalue()
    for table_name, comment in EXPECTED_TABLE_COMMENTS.items():
        assert f"COMMENT ON TABLE {table_name} IS '{comment}';" in generated_sql


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
