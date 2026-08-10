"""将功能用例项目归属默认值调整为官网环境。"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "3b8f2d6a1c04"
down_revision: str | Sequence[str] | None = "7a3c8e4f2d91"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE test_cases SET project_name = '官网环境' "
            "WHERE project_name = '测试平台' OR TRIM(project_name) = ''"
        )
    )
    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.alter_column(
            "project_name",
            existing_type=sa.String(length=128),
            existing_nullable=False,
            server_default="官网环境",
        )


def downgrade() -> None:
    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.alter_column(
            "project_name",
            existing_type=sa.String(length=128),
            existing_nullable=False,
            server_default="测试平台",
        )
