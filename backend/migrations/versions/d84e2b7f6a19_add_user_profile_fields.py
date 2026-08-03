"""增加用户资料字段。

修订版本：d84e2b7f6a19
前置版本：c72f1a9d4e8b
创建时间：2026-08-03 11:10:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d84e2b7f6a19"
down_revision: str | Sequence[str] | None = "c72f1a9d4e8b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """为用户增加可选头像数据。"""
    op.add_column("users", sa.Column("avatar", sa.Text(), nullable=True))


def downgrade() -> None:
    """删除用户头像字段。"""
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("avatar")
