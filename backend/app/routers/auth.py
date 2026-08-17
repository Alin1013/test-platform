"""认证路由：登录、注册、当前用户信息与登出。"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..auth_schemas import (
    AuthUserResponse,
    LoginRequest,
    LoginResponse,
    ProfileUpdate,
    ProfileUpdateResponse,
    RegisterRequest,
    RegisterResponse,
)
from ..dependencies import get_session
from ..services import auth


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


def _access_token(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ],
) -> str:
    """从 Authorization 头解析 Bearer 令牌，缺失或不合法返回 401。"""
    if credentials is None or credentials.scheme.casefold() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer access token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /login：校验账号密码并返回访问令牌。"""
    return auth.login(session, payload)


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=RegisterResponse)
def register(
    payload: RegisterRequest,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """POST /register：创建新账号。"""
    return auth.register(session, payload)


@router.get("/me", response_model=AuthUserResponse)
def current_user(
    token: Annotated[str, Depends(_access_token)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """GET /me：返回当前登录用户信息。"""
    return auth.serialize_user(auth.authenticated_user(session, token))


@router.patch("/me", response_model=ProfileUpdateResponse)
def update_current_user(
    payload: ProfileUpdate,
    token: Annotated[str, Depends(_access_token)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """PATCH /me：更新姓名/头像/密码。"""
    user = auth.authenticated_user(session, token)
    return auth.update_profile(session, user, payload)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    token: Annotated[str, Depends(_access_token)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """POST /logout：使当前访问令牌失效。"""
    auth.logout(session, token)
