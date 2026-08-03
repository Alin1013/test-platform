from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import Role, User


class AccountConflictError(Exception):
    pass


class AccountRoleNotFoundError(Exception):
    pass


@dataclass(frozen=True)
class AccountCreateInput:
    account: str
    name: str
    email: str
    department: str
    role_name: str
    password_hash: str


def create_account(session: Session, payload: AccountCreateInput) -> User:
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
