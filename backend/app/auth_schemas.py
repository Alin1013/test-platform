"""认证模块的请求/响应模型：登录、注册、个人资料更新。"""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator


AvatarDataUrl = Annotated[
    # 仅允许指定图片格式的 base64 Data URL，长度上限防止超大头像拖垮接口。
    str,
    StringConstraints(
        max_length=2_800_000,
        pattern=r"^data:image/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$",
    ),
]


class LoginRequest(BaseModel):
    """登录请求：账号 + 密码。"""

    model_config = ConfigDict(extra="forbid")

    account: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    """注册请求：账号需符合命名规则，密码至少 8 位。"""

    model_config = ConfigDict(extra="forbid")

    account: str = Field(
        min_length=3,
        max_length=64,
        pattern=r"^[A-Za-z0-9_.-]+$",
    )
    name: str = Field(min_length=1, max_length=64)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @model_validator(mode="before")
    @classmethod
    def trim_text_fields(cls, values: object) -> object:
        """注册前去除账号/姓名/邮箱首尾空白，避免误存多余空格。"""
        if not isinstance(values, dict):
            return values
        normalized = dict(values)
        for field in ("account", "name", "email"):
            value = normalized.get(field)
            if isinstance(value, str):
                normalized[field] = value.strip()
        return normalized


class AuthUserResponse(BaseModel):
    """返回给前端的当前用户信息（含角色名与权限位）。"""

    id: int
    account: str
    name: str
    avatar: str | None
    email: str
    department: str
    role: str
    permissions: dict[str, bool]
    status: str


class LoginResponse(BaseModel):
    """登录成功响应：访问令牌与用户信息。"""

    access_token: str
    token_type: str
    expires_at: datetime
    user: AuthUserResponse


class RegisterResponse(BaseModel):
    """注册成功响应：新用户信息。"""

    user: AuthUserResponse


class ProfileUpdate(BaseModel):
    """个人资料更新：至少提供一个待修改字段，头像限制为 base64 图片。"""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=64)
    avatar: AvatarDataUrl | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @model_validator(mode="after")
    def contains_changes(self) -> "ProfileUpdate":
        """校验请求确实包含可更新的字段，且姓名不允许被置空。"""
        if not self.model_fields_set:
            raise ValueError("at least one profile field is required")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self


class ProfileUpdateResponse(BaseModel):
    """资料更新响应：用户信息与密码是否变更的标记。"""

    user: AuthUserResponse
    password_changed: bool
