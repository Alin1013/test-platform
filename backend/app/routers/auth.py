from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..auth_schemas import AuthUserResponse, LoginRequest, LoginResponse
from ..dependencies import get_session
from ..services import auth


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


def _access_token(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ],
) -> str:
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
    return auth.login(session, payload)


@router.get("/me", response_model=AuthUserResponse)
def current_user(
    token: Annotated[str, Depends(_access_token)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    return auth.serialize_user(auth.authenticated_user(session, token))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    token: Annotated[str, Depends(_access_token)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    auth.logout(session, token)
