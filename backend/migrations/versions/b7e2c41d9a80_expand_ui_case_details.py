"""扩展 UI 自动化用例执行配置。

修订版本：b7e2c41d9a80
前置版本：f4c29d8a6b10
创建时间：2026-08-03 17:45:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b7e2c41d9a80"
down_revision: str | Sequence[str] | None = "f4c29d8a6b10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("ui_case_details") as batch_op:
        batch_op.add_column(
            sa.Column("description", sa.Text(), server_default="", nullable=False)
        )
        batch_op.add_column(sa.Column("dependency_case_id", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("browser", sa.String(length=16), server_default="chrome", nullable=False)
        )
        batch_op.add_column(
            sa.Column("environment", sa.String(length=16), server_default="test", nullable=False)
        )
        batch_op.add_column(
            sa.Column("timeout_seconds", sa.Integer(), server_default="30", nullable=False)
        )
        batch_op.add_column(
            sa.Column("retry_count", sa.Integer(), server_default="1", nullable=False)
        )
        batch_op.create_foreign_key(
            "fk_ui_case_details_dependency_case_id_test_cases",
            "test_cases",
            ["dependency_case_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_check_constraint(
            "ck_ui_case_details_browser", "browser IN ('chrome', 'firefox')"
        )
        batch_op.create_check_constraint(
            "ck_ui_case_details_environment", "environment IN ('staging', 'test')"
        )
        batch_op.create_check_constraint(
            "ck_ui_case_details_timeout_seconds", "timeout_seconds BETWEEN 1 AND 3600"
        )
        batch_op.create_check_constraint(
            "ck_ui_case_details_retry_count", "retry_count BETWEEN 0 AND 3"
        )


def downgrade() -> None:
    with op.batch_alter_table("ui_case_details") as batch_op:
        batch_op.drop_constraint("ck_ui_case_details_retry_count", type_="check")
        batch_op.drop_constraint("ck_ui_case_details_timeout_seconds", type_="check")
        batch_op.drop_constraint("ck_ui_case_details_environment", type_="check")
        batch_op.drop_constraint("ck_ui_case_details_browser", type_="check")
        batch_op.drop_constraint(
            "fk_ui_case_details_dependency_case_id_test_cases", type_="foreignkey"
        )
        batch_op.drop_column("retry_count")
        batch_op.drop_column("timeout_seconds")
        batch_op.drop_column("environment")
        batch_op.drop_column("browser")
        batch_op.drop_column("dependency_case_id")
        batch_op.drop_column("description")
