"""为模块增加用例类型维度，使各类型目录独立。

修订版本：a0b1c2d3e4f5
前置版本：f4c29d8a6b10
创建时间：2026-08-18 11:30:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a0b1c2d3e4f5"
down_revision: str | Sequence[str] | None = "a1c9f3e7b204"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 新增 module_type 列；存量模块回填为功能用例，接口/UI 目录从空开始。
    with op.batch_alter_table("modules") as batch_op:
        batch_op.add_column(
            sa.Column(
                "module_type",
                sa.String(length=16),
                server_default="functional",
                nullable=False,
            )
        )
        batch_op.create_check_constraint(
            "ck_modules_module_type",
            "module_type IN ('functional', 'api', 'ui')",
        )
    op.execute("UPDATE modules SET module_type = 'functional' WHERE module_type IS NULL")


def downgrade() -> None:
    with op.batch_alter_table("modules") as batch_op:
        batch_op.drop_constraint("ck_modules_module_type", type_="check")
        batch_op.drop_column("module_type")
