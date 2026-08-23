"""系统设置服务：读写平台全局配置并解析执行环境。"""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import SystemConfig
from ..schemas import SystemSettings


SETTINGS_KEY = "platform_settings"


def get_settings(session: Session) -> dict:
    """读取平台配置；丢弃旧版本已下线的用例管理配置。"""
    config = session.scalar(select(SystemConfig).where(SystemConfig.key == SETTINGS_KEY))
    if config is None:
        raise HTTPException(status_code=404, detail="System settings not found")
    value = dict(config.value)
    # 兼容升级前保存的 JSON，避免旧字段被响应模型的 extra=forbid 拒绝。
    value.pop("caseManagement", None)
    execution = dict(value.get("execution", {}))
    # 旧版本没有接口执行全局配置，读取时补默认值并避免要求用户先手动迁移数据库。
    execution.setdefault("globalHeaders", {})
    execution.setdefault("defaultIterations", 1)
    execution.setdefault("defaultRampUpTime", 0)
    value["execution"] = execution
    return value


def get_environment(session: Session, environment_id: str) -> dict:
    """按 id 查找执行环境；未配置时报 422。"""
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
    """整体替换平台配置；不存在时先创建再写入。"""
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
