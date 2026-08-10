from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import BigInteger, Boolean, JSON, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
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
    __table_args__ = {"comment": "角色与权限配置"}

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
        {"comment": "用户账号、个人资料与启停状态"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64), index=True)
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    test_executions: Mapped[list[TestExecution]] = relationship(back_populates="creator")


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = {"comment": "用户登录会话与访问令牌摘要"}

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
    __table_args__ = {"comment": "项目测试模块及父子层级"}

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
        {"comment": "测试用例公共信息"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    type: Mapped[str] = mapped_column(String(16), index=True)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id"), index=True)
    priority: Mapped[str] = mapped_column(String(4), index=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    requirement_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    precondition: Mapped[str] = mapped_column(Text, default="")
    test_steps: Mapped[str] = mapped_column(Text, default="")
    expected_result: Mapped[str] = mapped_column(Text, default="")
    iteration: Mapped[str] = mapped_column(String(128), default="")
    is_smoke: Mapped[bool] = mapped_column(Boolean, default=False)
    project_name: Mapped[str] = mapped_column(String(128), default="测试平台")

    module: Mapped[Module] = relationship(back_populates="test_cases")
    author: Mapped[User] = relationship(back_populates="test_cases")
    api_details: Mapped[ApiCaseDetails | None] = relationship(
        back_populates="test_case", cascade="all, delete-orphan", uselist=False
    )
    ui_details: Mapped[UiCaseDetails | None] = relationship(
        back_populates="test_case",
        cascade="all, delete-orphan",
        foreign_keys="UiCaseDetails.case_id",
        uselist=False,
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
        CheckConstraint(
            "body_type IN ('none', 'json', 'form-data', 'x-www-form-urlencoded')",
            name="ck_api_case_details_body_type",
        ),
        {"comment": "接口测试用例扩展信息"},
    )

    case_id: Mapped[int] = mapped_column(
        ForeignKey("test_cases.id", ondelete="CASCADE"), primary_key=True
    )
    url: Mapped[str] = mapped_column(String(2048))
    method: Mapped[str] = mapped_column(String(8))
    expected_code: Mapped[int] = mapped_column(Integer)
    headers: Mapped[dict[str, Any]] = mapped_column(MutableDict.as_mutable(JSON), default=dict)
    query_params: Mapped[list[dict[str, Any]]] = mapped_column(
        MutableList.as_mutable(JSON), default=list
    )
    body_type: Mapped[str] = mapped_column(String(32), default="none")
    body_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_fields: Mapped[list[dict[str, Any]]] = mapped_column(
        MutableList.as_mutable(JSON), default=list
    )
    request_body: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSON, nullable=True)
    expected_response: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(
        JSON, nullable=True
    )
    assertions: Mapped[list[dict[str, Any]]] = mapped_column(
        MutableList.as_mutable(JSON), default=list
    )
    extracts: Mapped[list[dict[str, Any]]] = mapped_column(
        MutableList.as_mutable(JSON), default=list
    )

    test_case: Mapped[TestCase] = relationship(back_populates="api_details")


class UiCaseDetails(Base):
    __tablename__ = "ui_case_details"
    __table_args__ = (
        CheckConstraint(
            "browser IN ('chrome', 'firefox')", name="ck_ui_case_details_browser"
        ),
        CheckConstraint(
            "timeout_seconds BETWEEN 1 AND 3600",
            name="ck_ui_case_details_timeout_seconds",
        ),
        CheckConstraint(
            "retry_count BETWEEN 0 AND 3", name="ck_ui_case_details_retry_count"
        ),
        {"comment": "UI 自动化用例扩展信息"},
    )

    case_id: Mapped[int] = mapped_column(
        ForeignKey("test_cases.id", ondelete="CASCADE"), primary_key=True
    )
    description: Mapped[str] = mapped_column(Text, default="")
    dependency_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("test_cases.id", ondelete="SET NULL"), nullable=True
    )
    browser: Mapped[str] = mapped_column(String(16), default="chrome")
    environment: Mapped[str] = mapped_column(String(64), default="test")
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30)
    retry_count: Mapped[int] = mapped_column(Integer, default=1)
    steps: Mapped[list[dict[str, Any]] | list[str]] = mapped_column(
        MutableList.as_mutable(JSON), default=list
    )

    test_case: Mapped[TestCase] = relationship(
        back_populates="ui_details", foreign_keys=[case_id]
    )


class TestExecution(Base, TimestampMixin):
    __tablename__ = "test_execution"
    __table_args__ = (
        CheckConstraint("type IN ('UI', 'API')", name="ck_test_execution_type"),
        CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')",
            name="ck_test_execution_status",
        ),
        {"comment": "自动化测试执行主记录"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    execution_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(8), index=True)
    project_id: Mapped[int] = mapped_column(Integer, index=True)
    env_name: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    total_count: Mapped[int] = mapped_column(Integer, default=0)
    passed_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    creator: Mapped[User] = relationship(back_populates="test_executions")
    details: Mapped[list[TestExecutionDetail]] = relationship(
        back_populates="execution",
        cascade="all, delete-orphan",
        order_by="TestExecutionDetail.id",
    )
    task: Mapped[ExecutionTask | None] = relationship(
        back_populates="execution", cascade="all, delete-orphan", uselist=False
    )


class TestExecutionDetail(Base):
    __tablename__ = "test_execution_detail"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED')",
            name="ck_test_execution_detail_status",
        ),
        {"comment": "自动化测试执行明细"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    execution_id: Mapped[int] = mapped_column(
        ForeignKey("test_execution.id", ondelete="CASCADE"), index=True
    )
    target_id: Mapped[int] = mapped_column(Integer, index=True)
    target_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    request_payload: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(
        JSON, nullable=True
    )
    response_payload: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(
        JSON, nullable=True
    )
    assertion_results: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)

    execution: Mapped[TestExecution] = relationship(back_populates="details")


class ExecutionTask(Base, TimestampMixin):
    __tablename__ = "execution_tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')",
            name="ck_execution_tasks_status",
        ),
        {"comment": "自动化执行异步任务队列"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    execution_id: Mapped[int] = mapped_column(
        ForeignKey("test_execution.id", ondelete="CASCADE"), unique=True, index=True
    )
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    execution: Mapped[TestExecution] = relationship(back_populates="task")


class XMindRecord(Base):
    __tablename__ = "xmind_records"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'WAITING_REVIEW', 'FAILED', 'COMPLETED')",
            name="ck_xmind_records_status",
        ),
        {"comment": "XMind 文件生成任务"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    file_name: Mapped[str] = mapped_column(String(255))
    file_url: Mapped[str] = mapped_column(String(2048))
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True)
    parsed_cases_count: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    tree_json: Mapped[list[dict[str, Any]]] = mapped_column(MutableList.as_mutable(JSON), default=list)
    preview_cases_json: Mapped[list[dict[str, Any]] | None] = mapped_column(
        MutableList.as_mutable(JSON), nullable=True
    )
    module_mapping_json: Mapped[dict[str, str] | None] = mapped_column(
        MutableDict.as_mutable(JSON), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    uploader: Mapped[User] = relationship(back_populates="xmind_records")


class SystemConfig(Base):
    __tablename__ = "system_configs"
    __table_args__ = {"comment": "系统全局配置"}

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    value: Mapped[Any] = mapped_column(JSON)
    description: Mapped[str] = mapped_column(Text, default="")
