"""FastAPI 依赖：从应用状态中取出会话工厂并提供请求级数据库会话。"""

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .models import User
from .services import auth

bearer_scheme = HTTPBearer(auto_error=False)


def get_session(request: Request) -> Generator[Session, None, None]:
    """请求级 Session 依赖：使用完自动归还连接。"""
    with request.app.state.session_factory() as session:
        yield session


def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    """解析当前 Bearer 会话；写入用例的作者必须来自服务端认证身份。"""
    if credentials is None or credentials.scheme.casefold() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer access token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return auth.authenticated_user(session, credentials.credentials)
