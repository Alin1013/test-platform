from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..models import Role, User
from ..schemas import RolePermissionsUpdate, UserCreate
from .auth import hash_password


def _serialize_user(user: User) -> dict:
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
    role = session.scalar(select(Role).where(Role.name == payload.role))
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    user = User(
        account=str(payload.email).partition("@")[0].casefold(),
        name=payload.name,
        email=str(payload.email).lower(),
        department=payload.department,
        role=role,
        status="enabled",
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="Account or email already exists") from error
    return _serialize_user(user)


def set_user_status(session: Session, user_id: int, status: str) -> dict:
    user = session.scalar(
        select(User).options(selectinload(User.role)).where(User.id == user_id)
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = status
    session.commit()
    return _serialize_user(user)


def list_roles(session: Session) -> list[dict]:
    roles = session.scalars(select(Role).order_by(Role.id)).all()
    return [
        {"id": role.id, "name": role.name, "permissions": role.permissions}
        for role in roles
    ]


def update_role_permissions(
    session: Session, role_id: int, payload: RolePermissionsUpdate
) -> dict:
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    role.permissions = payload.permissions
    session.commit()
    return {"id": role.id, "name": role.name, "permissions": role.permissions}
