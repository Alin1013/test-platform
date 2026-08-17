"""账号服务：创建用户并绑定角色，处理重复账号等冲突。"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import Role, User


class AccountConflictError(Exception):
    """账号/邮箱等唯一字段冲突时抛出。"""

    pass


class AccountRoleNotFoundError(Exception):
    """指定的角色名称不存在时抛出。"""

    pass


@dataclass(frozen=True)
class AccountCreateInput:
    """创建账号所需的不可变输入数据。"""

    account: str
    name: str
    email: str
    department: str
    role_name: str
    password_hash: str


def create_account(session: Session, payload: AccountCreateInput) -> User:
    """创建用户并提交；唯一约束冲突时回滚并抛 AccountConflictError。"""
    role = session.scalar(select(Role).where(Role.name == payload.role_name))
    if role is None:
        raise AccountRoleNotFoundError(payload.role_name)

    user = User(
        account=payload.account,
        name=payload.name,
        email=payload.email,
        department=payload.department,
        role=role,
        status="enabled",
        password_hash=payload.password_hash,
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise AccountConflictError from error
    return user
