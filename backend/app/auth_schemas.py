from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    account: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class AuthUserResponse(BaseModel):
    id: int
    account: str
    name: str
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
