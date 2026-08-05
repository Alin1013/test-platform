"""增加功能用例目录所需的业务字段。"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "2f7a1c9d4e8b"
down_revision: str | Sequence[str] | None = "9f3c1d7a5b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.add_column(sa.Column("requirement_id", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("precondition", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("test_steps", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("expected_result", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("iteration", sa.String(length=128), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("is_smoke", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("project_name", sa.String(length=128), nullable=False, server_default="测试平台"))
        batch_op.create_index("ix_test_cases_requirement_id", ["requirement_id"])


def downgrade() -> None:
    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.drop_index("ix_test_cases_requirement_id")
        for column in ("project_name", "is_smoke", "iteration", "expected_result", "test_steps", "precondition", "requirement_id"):
            batch_op.drop_column(column)
