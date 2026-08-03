from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..schemas import RolePermissionsUpdate, UserCreate, UserStatusUpdate
from ..services import personnel

router = APIRouter(prefix="/api/v1", tags=["personnel"])


@router.get("/users")
def list_users(
    session: Annotated[Session, Depends(get_session)],
    keyword: str | None = None,
    role: str | None = None,
    status: Literal["enabled", "disabled"] | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    return personnel.list_users(
        session,
        keyword=keyword,
        role_name=role,
        status=status,
        page=page,
        page_size=page_size,
    )


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate, session: Annotated[Session, Depends(get_session)]
) -> dict:
    return personnel.create_user(session, payload)


@router.patch("/users/{user_id}/status")
def set_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    return personnel.set_user_status(session, user_id, payload.status)


@router.get("/roles")
def list_roles(session: Annotated[Session, Depends(get_session)]) -> list[dict]:
    return personnel.list_roles(session)


@router.put("/roles/{role_id}/permissions")
def update_role_permissions(
    role_id: int,
    payload: RolePermissionsUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    return personnel.update_role_permissions(session, role_id, payload)
