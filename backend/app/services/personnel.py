"""人员管理服务：用户查询/创建/启停/删除与角色权限维护。"""

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..models import Role, User
from ..schemas import RoleCreate, RolePermissionsUpdate, RoleUpdate, UserCreate
from .accounts import (
    AccountConflictError,
    AccountCreateInput,
    AccountRoleNotFoundError,
    create_account,
)
from .auth import hash_password

DEFAULT_ROLE_PERMISSIONS = {
    # 新角色必须显式授权，避免创建配置时意外开放系统能力。
    "caseView": False,
    "caseEdit": False,
    "xmindConvert": False,
    "personnelManage": False,
    "systemSettings": False,
}


def _serialize_user(user: User) -> dict:
    """把 User ORM 对象转换为前端可用的字典（含角色名与 enabled 标志）。"""
    return {
        "id": user.id,
        "account": user.account,
        "name": user.name,
        "email": user.email,
        "department": user.department,
        "role_id": user.role_id,
        "role": user.role.name,
        "status": user.status,
        "enabled": user.status == "enabled",
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def list_users(
    session: Session,
    *,
    keyword: str | None,
    role_name: str | None,
    status: str | None,
    page: int,
    page_size: int,
) -> dict:
    """按关键字/角色/状态组合筛选用户，并分页返回。"""
    query = select(User).join(User.role).options(selectinload(User.role))
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        query = query.where(or_(User.name.ilike(pattern), User.email.ilike(pattern)))
    if role_name:
        query = query.where(Role.name == role_name)
    if status:
        query = query.where(User.status == status)

    total = session.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    users = session.scalars(
        query.order_by(User.created_at.desc(), User.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [_serialize_user(user) for user in users],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


def create_user(session: Session, payload: UserCreate) -> dict:
    """创建用户；账号由邮箱前缀派生，冲突时返回 409。"""
    try:
        user = create_account(
            session,
            AccountCreateInput(
                account=str(payload.email).partition("@")[0].casefold(),
                name=payload.name,
                email=str(payload.email).lower(),
                department=payload.department,
                role_name=payload.role,
                password_hash=hash_password(payload.password),
            ),
        )
    except AccountRoleNotFoundError as error:
        raise HTTPException(status_code=404, detail="Role not found")
    except AccountConflictError as error:
        raise HTTPException(status_code=409, detail="Account or email already exists") from error
    return _serialize_user(user)


def set_user_status(session: Session, user_id: int, status: str) -> dict:
    """启用或停用用户并返回最新状态。"""
    user = session.scalar(
        select(User).options(selectinload(User.role)).where(User.id == user_id)
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = status
    session.commit()
    return _serialize_user(user)


def set_user_role(session: Session, user_id: int, role_name: str) -> dict:
    """修改既有用户的角色归属，并返回带最新角色名的用户记录。"""
    user = session.scalar(
        select(User).options(selectinload(User.role)).where(User.id == user_id)
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    normalized_name = role_name.strip()
    role = session.scalar(select(Role).where(Role.name == normalized_name))
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    user.role = role
    session.commit()
    session.refresh(user)
    return _serialize_user(user)


def delete_user(session: Session, user_id: int) -> None:
    """删除用户；启用中的用户必须先停用，有关联数据时拒绝删除。"""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.status == "enabled":
        raise HTTPException(status_code=409, detail="请先停用账号")
    try:
        session.delete(user)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="该用户存在关联数据（用例、执行记录或 XMind 记录），无法删除"
        )


def list_roles(session: Session) -> list[dict]:
    """返回全部角色及其权限表。"""
    roles = session.scalars(select(Role).order_by(Role.id)).all()
    return [
        {"id": role.id, "name": role.name, "permissions": role.permissions}
        for role in roles
    ]


def _serialize_role(role: Role) -> dict:
    """把角色 ORM 对象转换成角色配置接口的稳定响应结构。"""
    return {"id": role.id, "name": role.name, "permissions": role.permissions}


def create_role(session: Session, payload: RoleCreate) -> dict:
    """新增角色并关闭全部权限，要求名称在角色表中唯一。"""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="角色名称不能为空")
    if session.scalar(select(Role.id).where(func.lower(Role.name) == name.casefold())) is not None:
        raise HTTPException(status_code=409, detail="角色名称已存在")

    role = Role(name=name, permissions=DEFAULT_ROLE_PERMISSIONS.copy())
    session.add(role)
    session.commit()
    session.refresh(role)
    return _serialize_role(role)


def update_role(session: Session, role_id: int, payload: RoleUpdate) -> dict:
    """修改角色名称；用户通过外键关联角色，因此重命名不会丢失用户归属。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="角色名称不能为空")
    duplicate = session.scalar(
        select(Role.id).where(
            func.lower(Role.name) == name.casefold(),
            Role.id != role_id,
        )
    )
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="角色名称已存在")

    role.name = name
    session.commit()
    session.refresh(role)
    return _serialize_role(role)


def update_role_permissions(
    session: Session, role_id: int, payload: RolePermissionsUpdate
) -> dict:
    """整体替换指定角色的权限表并返回最新结果。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    role.permissions = payload.permissions
    session.commit()
    return _serialize_role(role)
