"""增加自动化测试执行记录。

修订版本：f4c29d8a6b10
前置版本：e91f4c6a2d30
创建时间：2026-08-03 15:00:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "f4c29d8a6b10"
down_revision: str | Sequence[str] | None = "e91f4c6a2d30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "test_execution",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("execution_code", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=8), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("type IN ('UI', 'API')", name="ck_test_execution_type"),
        sa.CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED')",
            name="ck_test_execution_status",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        comment="自动化测试执行主记录",
    )
    op.create_index("ix_test_execution_created_by", "test_execution", ["created_by"])
    op.create_index(
        "ix_test_execution_execution_code", "test_execution", ["execution_code"], unique=True
    )
    op.create_index("ix_test_execution_project_id", "test_execution", ["project_id"])
    op.create_index("ix_test_execution_status", "test_execution", ["status"])
    op.create_index("ix_test_execution_type", "test_execution", ["type"])

    op.create_table(
        "test_execution_detail",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("execution_id", sa.Integer(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("target_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("request_payload", sa.JSON(), nullable=True),
        sa.Column("response_payload", sa.JSON(), nullable=True),
        sa.Column("assertion_results", sa.JSON(), nullable=False),
        sa.CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED')",
            name="ck_test_execution_detail_status",
        ),
        sa.ForeignKeyConstraint(
            ["execution_id"], ["test_execution.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        comment="自动化测试执行明细",
    )
    op.create_index(
        "ix_test_execution_detail_execution_id",
        "test_execution_detail",
        ["execution_id"],
    )
    op.create_index("ix_test_execution_detail_status", "test_execution_detail", ["status"])
    op.create_index(
        "ix_test_execution_detail_target_id", "test_execution_detail", ["target_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_test_execution_detail_target_id", table_name="test_execution_detail")
    op.drop_index("ix_test_execution_detail_status", table_name="test_execution_detail")
    op.drop_index("ix_test_execution_detail_execution_id", table_name="test_execution_detail")
    op.drop_table("test_execution_detail")
    op.drop_index("ix_test_execution_type", table_name="test_execution")
    op.drop_index("ix_test_execution_status", table_name="test_execution")
    op.drop_index("ix_test_execution_project_id", table_name="test_execution")
    op.drop_index("ix_test_execution_execution_code", table_name="test_execution")
    op.drop_index("ix_test_execution_created_by", table_name="test_execution")
    op.drop_table("test_execution")
