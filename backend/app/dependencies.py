"""FastAPI 依赖：从应用状态中取出会话工厂并提供请求级数据库会话。"""

from collections.abc import Generator

from fastapi import Request
from sqlalchemy.orm import Session


def get_session(request: Request) -> Generator[Session, None, None]:
    """请求级 Session 依赖：使用完自动归还连接。"""
    with request.app.state.session_factory() as session:
        yield session
