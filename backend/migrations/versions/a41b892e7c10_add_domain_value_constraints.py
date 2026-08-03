"""增加领域字段取值约束。

修订版本：a41b892e7c10
前置版本：ec4691e0b496
创建时间：2026-08-03 10:08:00

"""
from collections.abc import Sequence

from alembic import op


revision: str = "a41b892e7c10"
down_revision: str | Sequence[str] | None = "ec4691e0b496"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """限制用户状态、用例枚举和接口详情字段的合法取值。"""
    with op.batch_alter_table("users") as batch_op:
        batch_op.create_check_constraint(
            "ck_users_status", "status IN ('enabled', 'disabled')"
        )

    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.create_check_constraint(
            "ck_test_cases_type", "type IN ('functional', 'api', 'ui')"
        )
        batch_op.create_check_constraint(
            "ck_test_cases_priority", "priority IN ('P0', 'P1', 'P2', 'P3')"
        )
        batch_op.create_check_constraint(
            "ck_test_cases_status",
            "status IN ('维护中', '已通过', '草稿', '已失败', '已停用')",
        )

    with op.batch_alter_table("api_case_details") as batch_op:
        batch_op.create_check_constraint(
            "ck_api_case_details_method",
            "method IN ('GET', 'POST', 'PUT', 'DELETE')",
        )
        batch_op.create_check_constraint(
            "ck_api_case_details_expected_code",
            "expected_code BETWEEN 100 AND 599",
        )


def downgrade() -> None:
    """移除本次增加的领域字段取值约束。"""
    with op.batch_alter_table("api_case_details") as batch_op:
        batch_op.drop_constraint(
            "ck_api_case_details_expected_code", type_="check"
        )
        batch_op.drop_constraint("ck_api_case_details_method", type_="check")

    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.drop_constraint("ck_test_cases_status", type_="check")
        batch_op.drop_constraint("ck_test_cases_priority", type_="check")
        batch_op.drop_constraint("ck_test_cases_type", type_="check")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("ck_users_status", type_="check")
