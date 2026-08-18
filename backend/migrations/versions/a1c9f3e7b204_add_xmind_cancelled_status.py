"""XMind 生成任务新增 CANCELLED 状态。"""
from collections.abc import Sequence

from alembic import op

revision: str = "a1c9f3e7b204"
down_revision: str | Sequence[str] | None = "3b8f2d6a1c04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # SQLite 不支持直接 ALTER CHECK 约束，需重建表以替换约束（数据随表复制保留）。
    with op.batch_alter_table("xmind_records") as batch_op:
        batch_op.drop_constraint("ck_xmind_records_status", type_="check")
        batch_op.create_check_constraint(
            "ck_xmind_records_status",
            "status IN ('PENDING', 'RUNNING', 'WAITING_REVIEW', 'FAILED', 'COMPLETED', 'CANCELLED')",
        )


def downgrade() -> None:
    with op.batch_alter_table("xmind_records") as batch_op:
        batch_op.drop_constraint("ck_xmind_records_status", type_="check")
        batch_op.create_check_constraint(
            "ck_xmind_records_status",
            "status IN ('PENDING', 'RUNNING', 'WAITING_REVIEW', 'FAILED', 'COMPLETED')",
        )
