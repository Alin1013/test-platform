"""扩展 XMind 生成任务字段。"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "7a3c8e4f2d91"
down_revision: str | Sequence[str] | None = "2f7a1c9d4e8b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("xmind_records") as batch_op:
        batch_op.add_column(
            sa.Column("status", sa.String(length=32), server_default="PENDING", nullable=False)
        )
        batch_op.add_column(
            sa.Column("attempts", sa.Integer(), server_default="0", nullable=False)
        )
        batch_op.add_column(
            sa.Column(
                "available_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            )
        )
        batch_op.add_column(sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_error", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("tree_json", sa.JSON(), server_default="[]", nullable=False)
        )
        batch_op.add_column(sa.Column("preview_cases_json", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("module_mapping_json", sa.JSON(), nullable=True))
        batch_op.create_check_constraint(
            "ck_xmind_records_status",
            "status IN ('PENDING', 'RUNNING', 'WAITING_REVIEW', 'FAILED', 'COMPLETED')",
        )
    if op.get_bind().dialect.supports_comments:
        op.create_table_comment("xmind_records", "XMind 文件生成任务")


def downgrade() -> None:
    if op.get_bind().dialect.supports_comments:
        op.create_table_comment("xmind_records", "XMind 文件上传与解析记录")
    with op.batch_alter_table("xmind_records") as batch_op:
        batch_op.drop_constraint("ck_xmind_records_status", type_="check")
        batch_op.drop_column("module_mapping_json")
        batch_op.drop_column("preview_cases_json")
        batch_op.drop_column("tree_json")
        batch_op.drop_column("last_error")
        batch_op.drop_column("locked_at")
        batch_op.drop_column("available_at")
        batch_op.drop_column("attempts")
        batch_op.drop_column("status")
