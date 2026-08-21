"""为 XMind 生成任务增加可持久化的分阶段日志。"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c4e7a1b2d9f0"
down_revision: str | Sequence[str] | None = "b2d4e6f8a0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """添加可为空的日志列，兼容已存在的历史任务。"""
    with op.batch_alter_table("xmind_records") as batch_op:
        batch_op.add_column(sa.Column("generation_log", sa.Text(), nullable=True))


def downgrade() -> None:
    """移除日志列；历史日志会随字段回滚而删除。"""
    with op.batch_alter_table("xmind_records") as batch_op:
        batch_op.drop_column("generation_log")
