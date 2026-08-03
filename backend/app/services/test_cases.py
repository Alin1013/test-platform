from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..models import ApiCaseDetails, Module, TestCase, UiCaseDetails, User
from ..schemas import TestCaseCreate, TestCaseUpdate


def module_tree(session: Session, project_id: int) -> list[dict]:
    modules = session.scalars(
        select(Module).where(Module.project_id == project_id).order_by(Module.id)
    ).all()
    nodes = {
        module.id: {
            "id": module.id,
            "name": module.name,
            "project_id": module.project_id,
            "children": [],
        }
        for module in modules
    }
    roots = []
    for module in modules:
        node = nodes[module.id]
        if module.parent_id and module.parent_id in nodes:
            nodes[module.parent_id]["children"].append(node)
        else:
            roots.append(node)
    return roots


def serialize_case(test_case: TestCase) -> dict:
    result = {
        "id": test_case.id,
        "code": test_case.code,
        "title": test_case.title,
        "type": test_case.type,
        "module_id": test_case.module_id,
        "priority": test_case.priority,
        "status": test_case.status,
        "author_id": test_case.author_id,
        "author_name": test_case.author.name,
        "created_at": test_case.created_at,
        "updated_at": test_case.updated_at,
        "api_details": None,
        "ui_details": None,
    }
    if test_case.api_details:
        result["api_details"] = {
            "url": test_case.api_details.url,
            "method": test_case.api_details.method,
            "expected_code": test_case.api_details.expected_code,
            "headers": test_case.api_details.headers,
            "request_body": test_case.api_details.request_body,
            "expected_response": test_case.api_details.expected_response,
        }
    if test_case.ui_details:
        result["ui_details"] = {"steps": test_case.ui_details.steps}
    return result


def _case_query():
    return select(TestCase).options(
        selectinload(TestCase.author),
        selectinload(TestCase.api_details),
        selectinload(TestCase.ui_details),
    )


def list_cases(
    session: Session,
    *,
    case_type: str | None,
    module_id: str | None,
    priority: str | None,
    status: str | None,
    keyword: str | None,
    page: int,
    page_size: int,
) -> dict:
    query = _case_query().outerjoin(ApiCaseDetails)
    if case_type:
        query = query.where(TestCase.type == case_type)
    if module_id:
        query = query.where(TestCase.module_id == module_id)
    if priority:
        query = query.where(TestCase.priority == priority)
    if status:
        query = query.where(TestCase.status == status)
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        query = query.where(
            or_(
                TestCase.code.ilike(pattern),
                TestCase.title.ilike(pattern),
                ApiCaseDetails.url.ilike(pattern),
            )
        )

    count_query = select(func.count()).select_from(query.order_by(None).subquery())
    total = session.scalar(count_query) or 0
    rows = session.scalars(
        query.order_by(TestCase.updated_at.desc(), TestCase.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [serialize_case(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


def create_case(session: Session, payload: TestCaseCreate) -> dict:
    if session.get(Module, payload.module_id) is None:
        raise HTTPException(status_code=404, detail="Module not found")
    if session.get(User, payload.author_id) is None:
        raise HTTPException(status_code=404, detail="Author not found")

    prefix = {"functional": "FUN", "api": "API", "ui": "UI"}[payload.type]
    test_case = TestCase(
        code=payload.code or f"{prefix}-{uuid4().hex[:8].upper()}",
        title=payload.title,
        type=payload.type,
        module_id=payload.module_id,
        priority=payload.priority,
        status=payload.status,
        author_id=payload.author_id,
    )
    session.add(test_case)
    session.flush()
    if payload.api_details:
        test_case.api_details = ApiCaseDetails(**payload.api_details.model_dump())
    if payload.type == "ui":
        details = payload.ui_details or UiCaseDetails(steps=[])
        test_case.ui_details = (
            details if isinstance(details, UiCaseDetails) else UiCaseDetails(**details.model_dump())
        )
    session.commit()
    return serialize_case(test_case)


def update_case(session: Session, case_id: int, payload: TestCaseUpdate) -> dict:
    test_case = session.scalar(_case_query().where(TestCase.id == case_id))
    if test_case is None:
        raise HTTPException(status_code=404, detail="Test case not found")

    changes = payload.model_dump(exclude_unset=True, exclude={"api_details", "ui_details"})
    if "module_id" in changes and session.get(Module, changes["module_id"]) is None:
        raise HTTPException(status_code=404, detail="Module not found")
    if "author_id" in changes and session.get(User, changes["author_id"]) is None:
        raise HTTPException(status_code=404, detail="Author not found")
    for field, value in changes.items():
        setattr(test_case, field, value)

    if payload.api_details is not None:
        if test_case.type != "api" or test_case.api_details is None:
            raise HTTPException(status_code=422, detail="API details are only valid for API cases")
        for field, value in payload.api_details.model_dump(exclude_unset=True).items():
            setattr(test_case.api_details, field, value)
    if payload.ui_details is not None:
        if test_case.type != "ui":
            raise HTTPException(status_code=422, detail="UI details are only valid for UI cases")
        if test_case.ui_details is None:
            test_case.ui_details = UiCaseDetails(steps=payload.ui_details.steps)
        else:
            test_case.ui_details.steps = payload.ui_details.steps

    session.commit()
    return serialize_case(test_case)


def delete_case(session: Session, case_id: int) -> None:
    test_case = session.get(TestCase, case_id)
    if test_case is None:
        raise HTTPException(status_code=404, detail="Test case not found")
    session.delete(test_case)
    session.commit()
