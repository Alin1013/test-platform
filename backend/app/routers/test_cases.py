from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..schemas import CaseStatus, CaseType, Priority, TestCaseCreate, TestCaseUpdate
from ..services import test_cases

router = APIRouter(prefix="/api/v1", tags=["test cases"])


@router.get("/modules")
def modules(
    session: Annotated[Session, Depends(get_session)], project_id: int = 1
) -> list[dict]:
    return test_cases.module_tree(session, project_id)


@router.get("/test-cases")
def list_test_cases(
    session: Annotated[Session, Depends(get_session)],
    type: CaseType | None = None,
    module_id: str | None = None,
    priority: Priority | None = None,
    status: CaseStatus | None = None,
    keyword: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    return test_cases.list_cases(
        session,
        case_type=type,
        module_id=module_id,
        priority=priority,
        status=status,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )


@router.post("/test-cases", status_code=status.HTTP_201_CREATED)
def create_test_case(
    payload: TestCaseCreate, session: Annotated[Session, Depends(get_session)]
) -> dict:
    return test_cases.create_case(session, payload)


@router.put("/test-cases/{case_id}")
def update_test_case(
    case_id: int,
    payload: TestCaseUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    return test_cases.update_case(session, case_id, payload)


@router.delete("/test-cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_case(
    case_id: int, session: Annotated[Session, Depends(get_session)]
) -> Response:
    test_cases.delete_case(session, case_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
