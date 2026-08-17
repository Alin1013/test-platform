"""XMind 异步任务消费者：领取 PENDING 任务并驱动 AI 生成。"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from ..models import XMindRecord
from .xmind import generate_task_preview


def _claim_task(session_factory: sessionmaker[Session]) -> int | None:
    """原子领取下一个可执行任务，防止多个 worker 重复消费。"""
    claimed_at = datetime.now(timezone.utc)
    with session_factory() as session:
        task_id = session.scalar(
            select(XMindRecord.id)
            .where(
                XMindRecord.status == "PENDING",
                XMindRecord.available_at <= claimed_at,
            )
            .order_by(XMindRecord.id)
        )
        if task_id is None:
            return None
        result = session.execute(
            update(XMindRecord)
            .where(
                XMindRecord.id == task_id,
                XMindRecord.status == "PENDING",
                XMindRecord.available_at <= claimed_at,
            )
            .values(
                status="RUNNING",
                attempts=XMindRecord.attempts + 1,
                locked_at=claimed_at,
                last_error=None,
            )
        )
        if result.rowcount != 1:
            session.rollback()
            return None
        session.commit()
    return task_id


def run_xmind_task(
    session_factory: sessionmaker[Session],
    task_id: int,
    *,
    upload_dir: Path,
    llm_transport: Any = None,
) -> bool:
    """同步包装异步生成流程：创建事件循环并运行任务预览生成。"""
    asyncio.run(
        generate_task_preview(
            session_factory,
            task_id,
            upload_dir=upload_dir,
            llm_transport=llm_transport,
        )
    )
    return True


def run_next_xmind_task(
    session_factory: sessionmaker[Session],
    *,
    upload_dir: Path,
    llm_transport: Any = None,
) -> int | None:
    """领取并执行一个任务，无任务可领时返回 None。"""
    task_id = _claim_task(session_factory)
    if task_id is None:
        return None
    run_xmind_task(
        session_factory,
        task_id,
        upload_dir=upload_dir,
        llm_transport=llm_transport,
    )
    return task_id
