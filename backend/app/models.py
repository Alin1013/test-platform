from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.ext.mutable import MutableDict, MutableList
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    permissions: Mapped[dict[str, bool]] = mapped_column(
        MutableDict.as_mutable(JSON), default=dict
    )

    users: Mapped[list[User]] = relationship(back_populates="role")


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("status IN ('enabled', 'disabled')", name="ck_users_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    department: Mapped[str] = mapped_column(String(128))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="enabled", index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    role: Mapped[Role] = relationship(back_populates="users")
    test_cases: Mapped[list[TestCase]] = relationship(back_populates="author")
    xmind_records: Mapped[list[XMindRecord]] = relationship(back_populates="uploader")
    auth_sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship(back_populates="auth_sessions")


class Module(Base, TimestampMixin):
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("modules.id", ondelete="CASCADE"), nullable=True
    )
    project_id: Mapped[int] = mapped_column(Integer, default=1, index=True)

    parent: Mapped[Module | None] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list[Module]] = relationship(back_populates="parent")
    test_cases: Mapped[list[TestCase]] = relationship(back_populates="module")


class TestCase(Base, TimestampMixin):
    __tablename__ = "test_cases"
    __table_args__ = (
        CheckConstraint(
            "type IN ('functional', 'api', 'ui')", name="ck_test_cases_type"
        ),
        CheckConstraint(
            "priority IN ('P0', 'P1', 'P2', 'P3')", name="ck_test_cases_priority"
        ),
        CheckConstraint(
            "status IN ('维护中', '已通过', '草稿', '已失败', '已停用')",
            name="ck_test_cases_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    type: Mapped[str] = mapped_column(String(16), index=True)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id"), index=True)
    priority: Mapped[str] = mapped_column(String(4), index=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    module: Mapped[Module] = relationship(back_populates="test_cases")
    author: Mapped[User] = relationship(back_populates="test_cases")
    api_details: Mapped[ApiCaseDetails | None] = relationship(
        back_populates="test_case", cascade="all, delete-orphan", uselist=False
    )
    ui_details: Mapped[UiCaseDetails | None] = relationship(
        back_populates="test_case", cascade="all, delete-orphan", uselist=False
    )


class ApiCaseDetails(Base):
    __tablename__ = "api_case_details"
    __table_args__ = (
        CheckConstraint(
            "method IN ('GET', 'POST', 'PUT', 'DELETE')", name="ck_api_case_details_method"
        ),
        CheckConstraint(
            "expected_code BETWEEN 100 AND 599",
            name="ck_api_case_details_expected_code",
        ),
    )

    case_id: Mapped[int] = mapped_column(
        ForeignKey("test_cases.id", ondelete="CASCADE"), primary_key=True
    )
    url: Mapped[str] = mapped_column(String(2048))
    method: Mapped[str] = mapped_column(String(8))
    expected_code: Mapped[int] = mapped_column(Integer)
    headers: Mapped[dict[str, Any]] = mapped_column(MutableDict.as_mutable(JSON), default=dict)
    request_body: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSON, nullable=True)
    expected_response: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(
        JSON, nullable=True
    )

    test_case: Mapped[TestCase] = relationship(back_populates="api_details")


class UiCaseDetails(Base):
    __tablename__ = "ui_case_details"

    case_id: Mapped[int] = mapped_column(
        ForeignKey("test_cases.id", ondelete="CASCADE"), primary_key=True
    )
    steps: Mapped[list[dict[str, Any]] | list[str]] = mapped_column(
        MutableList.as_mutable(JSON), default=list
    )

    test_case: Mapped[TestCase] = relationship(back_populates="ui_details")


class XMindRecord(Base):
    __tablename__ = "xmind_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    file_name: Mapped[str] = mapped_column(String(255))
    file_url: Mapped[str] = mapped_column(String(2048))
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    parsed_cases_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    uploader: Mapped[User] = relationship(back_populates="xmind_records")


class SystemConfig(Base):
    __tablename__ = "system_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    value: Mapped[Any] = mapped_column(JSON)
    description: Mapped[str] = mapped_column(Text, default="")
