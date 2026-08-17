"""仪表盘数据服务：统计用例数量并查询最近更新用例。"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..models import TestCase
from .test_cases import serialize_case


def get_case_counts(session: Session) -> dict[str, int]:
    """按用例类型统计数量；未出现的类型补 0，并汇总总数。"""
    rows = session.execute(
        select(TestCase.type, func.count(TestCase.id)).group_by(TestCase.type)
    ).all()
    counts = {"functional": 0, "api": 0, "ui": 0}
    counts.update({case_type: count for case_type, count in rows})
    return {**counts, "total": sum(counts.values())}


def get_recent_cases(session: Session, page: int, page_size: int) -> dict:
    """分页查询最近更新的用例，连带作者/模块/接口/UI 详情一起返回。"""
    total = session.scalar(select(func.count(TestCase.id))) or 0
    rows = session.scalars(
        select(TestCase)
        .options(
            selectinload(TestCase.author),
            selectinload(TestCase.module),
            selectinload(TestCase.api_details),
            selectinload(TestCase.ui_details),
        )
        .order_by(TestCase.updated_at.desc(), TestCase.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [serialize_case(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
    }
