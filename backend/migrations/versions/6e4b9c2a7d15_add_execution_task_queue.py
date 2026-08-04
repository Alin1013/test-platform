"""增加自动化执行任务队列。

修订版本：6e4b9c2a7d15
前置版本：1c5e8a7d3b42
创建时间：2026-08-04 17:10:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "6e4b9c2a7d15"
down_revision: str | Sequence[str] | None = "1c5e8a7d3b42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("test_execution") as batch_op:
        batch_op.drop_constraint("ck_test_execution_status", type_="check")
    op.execute(
        "UPDATE test_execution SET status = 'CANCELLED' WHERE status = 'CANCELED'"
    )
    with op.batch_alter_table("test_execution") as batch_op:
        batch_op.create_check_constraint(
            "ck_test_execution_status",
            "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')",
        )

    op.create_table(
        "execution_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("execution_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')",
            name="ck_execution_tasks_status",
        ),
        sa.ForeignKeyConstraint(
            ["execution_id"], ["test_execution.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("execution_id"),
        comment="自动化执行异步任务队列",
    )
    op.create_index(
        "ix_execution_tasks_execution_id", "execution_tasks", ["execution_id"], unique=True
    )
    op.create_index("ix_execution_tasks_status", "execution_tasks", ["status"])


def downgrade() -> None:
    op.drop_index("ix_execution_tasks_status", table_name="execution_tasks")
    op.drop_index("ix_execution_tasks_execution_id", table_name="execution_tasks")
    op.drop_table("execution_tasks")

    with op.batch_alter_table("test_execution") as batch_op:
        batch_op.drop_constraint("ck_test_execution_status", type_="check")
    op.execute(
        "UPDATE test_execution SET status = 'CANCELED' WHERE status = 'CANCELLED'"
    )
    with op.batch_alter_table("test_execution") as batch_op:
        batch_op.create_check_constraint(
            "ck_test_execution_status",
            "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED')",
        )
