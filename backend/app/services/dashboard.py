from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..models import TestCase
from .test_cases import serialize_case


def get_case_counts(session: Session) -> dict[str, int]:
    rows = session.execute(
        select(TestCase.type, func.count(TestCase.id)).group_by(TestCase.type)
    ).all()
    counts = {"functional": 0, "api": 0, "ui": 0}
    counts.update({case_type: count for case_type, count in rows})
    return {**counts, "total": sum(counts.values())}


def get_recent_cases(session: Session, page: int, page_size: int) -> dict:
    total = session.scalar(select(func.count(TestCase.id))) or 0
    rows = session.scalars(
        select(TestCase)
        .options(
            selectinload(TestCase.author),
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
