"""增加账号认证会话。

修订版本：c72f1a9d4e8b
前置版本：a41b892e7c10
创建时间：2026-08-03 10:45:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c72f1a9d4e8b"
down_revision: str | Sequence[str] | None = "a41b892e7c10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _backfill_accounts() -> None:
    users = sa.table(
        "users",
        sa.column("id", sa.Integer()),
        sa.column("email", sa.String()),
        sa.column("account", sa.String()),
    )
    connection = op.get_bind()
    existing_users = connection.execute(
        sa.select(users.c.id, users.c.email).order_by(users.c.id)
    )
    used_accounts: set[str] = set()
    for user_id, email in existing_users:
        base = str(email).partition("@")[0].strip().casefold()[:64]
        if not base:
            base = f"user-{user_id}"
        account = base
        attempt = 0
        while account in used_accounts:
            attempt += 1
            suffix = f"-{user_id}" if attempt == 1 else f"-{user_id}-{attempt}"
            account = f"{base[: 64 - len(suffix)]}{suffix}"
        used_accounts.add(account)
        connection.execute(
            users.update().where(users.c.id == user_id).values(account=account)
        )


def upgrade() -> None:
    """回填唯一账号并创建可撤销的登录会话表。"""
    op.add_column("users", sa.Column("account", sa.String(length=64), nullable=True))
    _backfill_accounts()
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("account", existing_type=sa.String(length=64), nullable=False)
        batch_op.create_index("ix_users_account", ["account"], unique=True)

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=True)
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])


def downgrade() -> None:
    """删除登录会话和用户账号字段。"""
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_token_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_expires_at", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_account")
        batch_op.drop_column("account")
