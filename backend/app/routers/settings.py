from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..schemas import SystemSettings
from ..services import settings

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("", response_model=SystemSettings)
def get_system_settings(
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    return settings.get_settings(session)


@router.post("", response_model=SystemSettings)
def replace_system_settings(
    payload: SystemSettings, session: Annotated[Session, Depends(get_session)]
) -> dict:
    return settings.replace_settings(session, payload)
