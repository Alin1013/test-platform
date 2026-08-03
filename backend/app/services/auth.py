"""处理密码凭据和可撤销的登录会话。"""

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth_schemas import LoginRequest
from ..models import AuthSession, User


PASSWORD_ITERATIONS = 600_000
SESSION_TTL = timedelta(hours=8)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt, PASSWORD_ITERATIONS
    )
    return "pbkdf2_sha256${}${}${}".format(
        PASSWORD_ITERATIONS,
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    )


def verify_password(password: str, encoded_password: str | None) -> bool:
    if not encoded_password:
        return False
    try:
        algorithm, iterations, encoded_salt, encoded_digest = encoded_password.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(encoded_salt, validate=True)
        expected_digest = base64.b64decode(encoded_digest, validate=True)
        actual_digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt, int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual_digest, expected_digest)


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "account": user.account,
        "name": user.name,
        "email": user.email,
        "department": user.department,
        "role": user.role.name,
        "permissions": user.role.permissions,
        "status": user.status,
    }


def _unauthorized(detail: str = "Invalid account or password") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def login(session: Session, payload: LoginRequest) -> dict:
    account = payload.account.strip().casefold()
    user = session.scalar(
        select(User)
        .options(selectinload(User.role))
        .where(User.account == account)
    )
    if (
        user is None
        or user.status != "enabled"
        or not verify_password(payload.password, user.password_hash)
    ):
        raise _unauthorized()

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + SESSION_TTL
    session.add(
        AuthSession(
            user_id=user.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=expires_at,
        )
    )
    session.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "user": serialize_user(user),
    }


def _authenticated_session(session: Session, token: str) -> AuthSession:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    auth_session = session.scalar(
        select(AuthSession)
        .options(selectinload(AuthSession.user).selectinload(User.role))
        .where(AuthSession.token_hash == token_hash)
    )
    if auth_session is None:
        raise _unauthorized("Invalid or expired access token")

    expires_at = auth_session.expires_at
    if expires_at.tzinfo is None:
        # SQLite 读取时间时不会保留时区信息，按写入约定恢复为 UTC。
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc) or auth_session.user.status != "enabled":
        session.delete(auth_session)
        session.commit()
        raise _unauthorized("Invalid or expired access token")
    return auth_session


def authenticated_user(session: Session, token: str) -> User:
    return _authenticated_session(session, token).user


def logout(session: Session, token: str) -> None:
    auth_session = _authenticated_session(session, token)
    session.delete(auth_session)
    session.commit()
