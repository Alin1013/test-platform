"""允许 UI 用例使用系统配置的环境。

修订版本：9f3c1d7a5b20
前置版本：6e4b9c2a7d15
创建时间：2026-08-04 17:45:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "9f3c1d7a5b20"
down_revision: str | Sequence[str] | None = "6e4b9c2a7d15"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("ui_case_details") as batch_op:
        batch_op.drop_constraint("ck_ui_case_details_environment", type_="check")
        batch_op.alter_column(
            "environment",
            existing_type=sa.String(length=16),
            type_=sa.String(length=64),
            existing_nullable=False,
        )


def downgrade() -> None:
    op.execute(
        "UPDATE ui_case_details SET environment = 'test' "
        "WHERE environment NOT IN ('staging', 'test')"
    )
    with op.batch_alter_table("ui_case_details") as batch_op:
        batch_op.alter_column(
            "environment",
            existing_type=sa.String(length=64),
            type_=sa.String(length=16),
            existing_nullable=False,
        )
        batch_op.create_check_constraint(
            "ck_ui_case_details_environment", "environment IN ('staging', 'test')"
        )
