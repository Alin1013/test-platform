"""扩展接口自动化用例执行配置。

修订版本：8d2a6f4c1e90
前置版本：b7e2c41d9a80
创建时间：2026-08-04 15:20:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "8d2a6f4c1e90"
down_revision: str | Sequence[str] | None = "b7e2c41d9a80"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("api_case_details") as batch_op:
        batch_op.add_column(
            sa.Column("query_params", sa.JSON(), server_default="[]", nullable=False)
        )
        batch_op.add_column(
            sa.Column("body_type", sa.String(length=32), server_default="none", nullable=False)
        )
        batch_op.add_column(sa.Column("body_content", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("body_fields", sa.JSON(), server_default="[]", nullable=False)
        )
        batch_op.add_column(
            sa.Column("assertions", sa.JSON(), server_default="[]", nullable=False)
        )
        batch_op.add_column(
            sa.Column("extracts", sa.JSON(), server_default="[]", nullable=False)
        )
        batch_op.create_check_constraint(
            "ck_api_case_details_body_type",
            "body_type IN ('none', 'json', 'form-data', 'x-www-form-urlencoded')",
        )


def downgrade() -> None:
    with op.batch_alter_table("api_case_details") as batch_op:
        batch_op.drop_constraint("ck_api_case_details_body_type", type_="check")
        batch_op.drop_column("extracts")
        batch_op.drop_column("assertions")
        batch_op.drop_column("body_fields")
        batch_op.drop_column("body_content")
        batch_op.drop_column("body_type")
        batch_op.drop_column("query_params")
