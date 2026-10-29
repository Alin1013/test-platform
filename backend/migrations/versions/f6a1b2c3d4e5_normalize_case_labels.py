"""统一测试用例等级与状态枚举。

历史数据中的 P0/P1/P2/P3 映射为高/中/低，所有测试用例状态统一为正常。
"""

from collections.abc import Sequence

from alembic import op


revision: str = "f6a1b2c3d4e5"
down_revision: str | Sequence[str] | None = "d5f1a2b3c4e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """先移除旧约束，再转换数据，最后建立新的中文枚举约束。"""
    # SQLite 不能直接删除 CHECK 约束，批量重建一次无约束表作为数据迁移中间态。
    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.drop_constraint("ck_test_cases_status", type_="check")
        batch_op.drop_constraint("ck_test_cases_priority", type_="check")

    op.execute(
        """
        UPDATE test_cases
        SET priority = CASE priority
            WHEN 'P0' THEN '高'
            WHEN 'P1' THEN '中'
            WHEN 'P2' THEN '低'
            WHEN 'P3' THEN '低'
            WHEN '高' THEN '高'
            WHEN '中' THEN '中'
            WHEN '低' THEN '低'
            ELSE '中'
        END,
        status = '正常'
        """
    )

    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.create_check_constraint(
            "ck_test_cases_priority", "priority IN ('高', '中', '低')"
        )
        batch_op.create_check_constraint("ck_test_cases_status", "status = '正常'")


def downgrade() -> None:
    """回退约束定义；历史中文数据无法安全还原原始 P 等级，保留为兼容映射。"""
    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.drop_constraint("ck_test_cases_status", type_="check")
        batch_op.drop_constraint("ck_test_cases_priority", type_="check")

    op.execute(
        """
        UPDATE test_cases
        SET priority = CASE priority
            WHEN '高' THEN 'P0'
            WHEN '中' THEN 'P1'
            WHEN '低' THEN 'P2'
            ELSE 'P1'
        END,
        status = '维护中'
        """
    )

    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.create_check_constraint(
            "ck_test_cases_priority", "priority IN ('P0', 'P1', 'P2', 'P3')"
        )
        batch_op.create_check_constraint(
            "ck_test_cases_status",
            "status IN ('维护中', '已通过', '草稿', '已失败', '已停用')",
        )
