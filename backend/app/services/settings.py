from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import SystemConfig
from ..schemas import CaseManagementSettings, SystemSettings


SETTINGS_KEY = "platform_settings"


def get_settings(session: Session) -> dict:
    config = session.scalar(select(SystemConfig).where(SystemConfig.key == SETTINGS_KEY))
    if config is None:
        raise HTTPException(status_code=404, detail="System settings not found")
    value = dict(config.value)
    case_management = dict(value.get("caseManagement", {}))
    case_management.pop("defaultProjectName", None)
    value["caseManagement"] = case_management
    return value


def get_case_project_names(session: Session) -> list[str]:
    case_management = get_settings(session).get("caseManagement", {})
    return CaseManagementSettings.model_validate(case_management).projectNames


def get_environment(session: Session, environment_id: str) -> dict:
    environment = next(
        (
            item
            for item in get_settings(session)["execution"]["environments"]
            if item["id"] == environment_id
        ),
        None,
    )
    if environment is None:
        raise HTTPException(status_code=422, detail="Execution environment is not configured")
    return environment


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
