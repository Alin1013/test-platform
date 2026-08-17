"""数据库引擎与会话工厂：负责 SQLite/其他数据库连接的创建和依赖注入。"""

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """所有 ORM 模型共享的声明式基类。"""

    pass


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "test_platform.db"
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_DATABASE_PATH}"


def create_session_factory(database_url: str = DEFAULT_DATABASE_URL) -> sessionmaker[Session]:
    """按连接串创建会话工厂；SQLite 场景额外开启外键约束。"""
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine = create_engine(database_url, connect_args=connect_args)
    if database_url.startswith("sqlite"):
        # SQLite 默认不执行外键约束，每条新连接都必须显式开启。
        @event.listens_for(engine, "connect")
        def enable_sqlite_foreign_keys(dbapi_connection, _) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def session_dependency(factory: sessionmaker[Session]):
    """将 sessionmaker 包装成 FastAPI 依赖，随请求自动关闭会话。"""
    def get_session() -> Generator[Session, None, None]:
        with factory() as session:
            yield session

    return get_session
