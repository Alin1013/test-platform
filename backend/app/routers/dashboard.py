from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..services.dashboard import get_case_counts, get_recent_cases

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/stats")
def dashboard_stats(session: Annotated[Session, Depends(get_session)]) -> dict[str, int]:
    return get_case_counts(session)


@router.get("/recent-cases")
def recent_cases(
    session: Annotated[Session, Depends(get_session)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=6, ge=1, le=100),
) -> dict:
    return get_recent_cases(session, page, page_size)
