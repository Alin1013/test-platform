from logging.config import fileConfig
import os

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context
from backend.app import models  # noqa: F401
from backend.app.database import Base, DEFAULT_DATABASE_URL

# 读取 alembic.ini，并复用其中的日志配置。
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 自动生成迁移时，以 ORM 元数据作为数据库结构的唯一来源。
target_metadata = Base.metadata
config.set_main_option("sqlalchemy.url", os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))


def run_migrations_offline() -> None:
    """离线模式只根据数据库 URL 生成 SQL，不建立真实连接。"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在线模式建立数据库连接并直接执行迁移。"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
