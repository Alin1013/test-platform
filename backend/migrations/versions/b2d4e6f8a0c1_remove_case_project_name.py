"""移除功能用例的项目归属字段与对应系统配置。

修订版本：b2d4e6f8a0c1
前置版本：a0b1c2d3e4f5
创建时间：2026-08-19 02:10:00
"""

import json
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b2d4e6f8a0c1"
down_revision: str | Sequence[str] | None = "a0b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _remove_case_management_settings() -> None:
    """清理旧设置 JSON，避免已下线配置继续随数据库保留。"""
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, value FROM system_configs")).mappings()
    for row in rows:
        value = json.loads(row["value"]) if isinstance(row["value"], str) else row["value"]
        if not isinstance(value, dict) or "caseManagement" not in value:
            continue
        value.pop("caseManagement", None)
        connection.execute(
            sa.text("UPDATE system_configs SET value = :value WHERE id = :id"),
            {"id": row["id"], "value": json.dumps(value, ensure_ascii=False)},
        )


def upgrade() -> None:
    """删除项目归属列，并清理系统设置中的旧项目列表。"""
    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.drop_column("project_name")
    _remove_case_management_settings()


def downgrade() -> None:
    """回滚时恢复字段与默认项目配置；历史项目归属值无法还原。"""
    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.add_column(
            sa.Column(
                "project_name",
                sa.String(length=128),
                nullable=False,
                server_default="官网环境",
            )
        )

    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, value FROM system_configs")).mappings()
    for row in rows:
        value = json.loads(row["value"]) if isinstance(row["value"], str) else row["value"]
        if not isinstance(value, dict):
            continue
        value["caseManagement"] = {"projectNames": ["官网环境"]}
        connection.execute(
            sa.text("UPDATE system_configs SET value = :value WHERE id = :id"),
            {"id": row["id"], "value": json.dumps(value, ensure_ascii=False)},
        )
