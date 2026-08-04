"""扩展自动化执行汇总字段。

修订版本：1c5e8a7d3b42
前置版本：8d2a6f4c1e90
创建时间：2026-08-04 16:10:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "1c5e8a7d3b42"
down_revision: str | Sequence[str] | None = "8d2a6f4c1e90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("test_execution") as batch_op:
        batch_op.add_column(
            sa.Column("env_name", sa.String(length=64), server_default="", nullable=False)
        )
        batch_op.add_column(
            sa.Column("total_count", sa.Integer(), server_default="0", nullable=False)
        )
        batch_op.add_column(
            sa.Column("passed_count", sa.Integer(), server_default="0", nullable=False)
        )
        batch_op.add_column(
            sa.Column("failed_count", sa.Integer(), server_default="0", nullable=False)
        )
        batch_op.add_column(
            sa.Column("duration_ms", sa.BigInteger(), server_default="0", nullable=False)
        )
        batch_op.add_column(sa.Column("start_time", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("end_time", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("test_execution") as batch_op:
        batch_op.drop_column("end_time")
        batch_op.drop_column("start_time")
        batch_op.drop_column("duration_ms")
        batch_op.drop_column("failed_count")
        batch_op.drop_column("passed_count")
        batch_op.drop_column("total_count")
        batch_op.drop_column("env_name")
