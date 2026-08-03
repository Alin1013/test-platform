from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator


AvatarDataUrl = Annotated[
    str,
    StringConstraints(
        max_length=2_800_000,
        pattern=r"^data:image/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$",
    ),
]


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    account: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class RegisterRequest(BaseModel):
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
        if not isinstance(values, dict):
            return values
        normalized = dict(values)
        for field in ("account", "name", "email"):
            value = normalized.get(field)
            if isinstance(value, str):
                normalized[field] = value.strip()
        return normalized


class AuthUserResponse(BaseModel):
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
    access_token: str
    token_type: str
    expires_at: datetime
    user: AuthUserResponse


class RegisterResponse(BaseModel):
    user: AuthUserResponse


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=64)
    avatar: AvatarDataUrl | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @model_validator(mode="after")
    def contains_changes(self) -> "ProfileUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one profile field is required")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self


class ProfileUpdateResponse(BaseModel):
    user: AuthUserResponse
    password_changed: bool
