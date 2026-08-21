"""人员管理路由：用户增删改查、启停与角色权限维护。"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..schemas import (
    RoleCreate,
    RolePermissionsUpdate,
    RoleUpdate,
    UserCreate,
    UserRoleUpdate,
    UserStatusUpdate,
)
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
    """GET /users：按关键字/角色/状态分页查询用户。"""
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
    """POST /users：新建用户。"""
    return personnel.create_user(session, payload)


@router.patch("/users/{user_id}/status")
def set_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """PATCH /users/{id}/status：启用或停用用户。"""
    return personnel.set_user_status(session, user_id, payload.status)


@router.patch("/users/{user_id}/role")
def set_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """PATCH /users/{id}/role：调整既有用户的角色归属。"""
    return personnel.set_user_role(session, user_id, payload.role)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int, session: Annotated[Session, Depends(get_session)]
) -> Response:
    """DELETE /users/{id}：删除用户；已启用用户由服务层拒绝删除。"""
    personnel.delete_user(session, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/roles")
def list_roles(session: Annotated[Session, Depends(get_session)]) -> list[dict]:
    """GET /roles：返回全部角色及其权限。"""
    return personnel.list_roles(session)


@router.post("/roles", status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate, session: Annotated[Session, Depends(get_session)]
) -> dict:
    """POST /roles：新增角色配置，权限默认关闭。"""
    return personnel.create_role(session, payload)


@router.patch("/roles/{role_id}")
def update_role(
    role_id: int,
    payload: RoleUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """PATCH /roles/{id}：修改角色名称并保留原权限。"""
    return personnel.update_role(session, role_id, payload)


@router.put("/roles/{role_id}/permissions")
def update_role_permissions(
    role_id: int,
    payload: RolePermissionsUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """PUT /roles/{id}/permissions：整体替换角色权限表。"""
    return personnel.update_role_permissions(session, role_id, payload)
