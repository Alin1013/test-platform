from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import SystemConfig
from ..schemas import SystemSettings


SETTINGS_KEY = "platform_settings"


def get_settings(session: Session) -> dict:
    config = session.scalar(select(SystemConfig).where(SystemConfig.key == SETTINGS_KEY))
    if config is None:
        raise HTTPException(status_code=404, detail="System settings not found")
    return config.value


def replace_settings(session: Session, payload: SystemSettings) -> dict:
    config = session.scalar(select(SystemConfig).where(SystemConfig.key == SETTINGS_KEY))
    if config is None:
        config = SystemConfig(
            key=SETTINGS_KEY,
            value={},
            description="平台全局配置",
        )
        session.add(config)
    config.value = payload.model_dump()
    session.commit()
    return config.value
