from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import InstrumentedAttribute, Session, selectinload

from ..models import ApiCaseDetails, Module, TestCase, UiCaseDetails, User
from ..schemas import TestCaseCreate, TestCaseUpdate, TestModuleCreate, TestModuleUpdate
from .settings import get_settings


def module_tree(session: Session, project_id: int) -> list[dict]:
    modules = session.scalars(
        select(Module).where(Module.project_id == project_id).order_by(Module.id)
    ).all()
    # 先建立索引再挂载父子关系，避免递归查询数据库。
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


def create_module(session: Session, payload: TestModuleCreate) -> tuple[dict, bool]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Module name is required")

    if payload.parent_id:
        parent = session.get(Module, payload.parent_id)
        if parent is None or parent.project_id != payload.project_id:
            raise HTTPException(status_code=404, detail="Parent module not found")

    existing = session.scalar(
        select(Module).where(
            Module.project_id == payload.project_id,
            Module.parent_id == payload.parent_id,
            func.lower(Module.name) == name.lower(),
        )
    )
    if existing is not None:
        return _serialize_module(existing), False

    module = Module(
        id=f"module-{uuid4().hex[:12]}",
        name=name,
        parent_id=payload.parent_id,
        project_id=payload.project_id,
    )
    session.add(module)
    session.commit()
    return _serialize_module(module), True


def update_module(session: Session, module_id: str, payload: TestModuleUpdate) -> dict:
    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Module name is required")
    duplicate = session.scalar(
        select(Module).where(
            Module.id != module_id,
            Module.project_id == module.project_id,
            Module.parent_id == module.parent_id,
            func.lower(Module.name) == name.lower(),
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409,
            detail="同级模块名称已存在",
        )

    module.name = name
    session.commit()
    return _serialize_module(module)


def delete_module(session: Session, module_id: str) -> None:
    module = session.get(Module, module_id)
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")

    module_ids = [module_id]
    index = 0
    while index < len(module_ids):
        children = session.scalars(
            select(Module.id).where(Module.parent_id == module_ids[index])
        ).all()
        module_ids.extend(children)
        index += 1

    existing_case = session.scalar(
        select(TestCase.id)
        .where(TestCase.module_id.in_(module_ids))
        .limit(1)
    )
    if existing_case is not None:
        raise HTTPException(
            status_code=409,
            detail="包含测试用例的模块不能删除",
        )

    for descendant_id in reversed(module_ids):
        session.delete(session.get(Module, descendant_id))
    session.commit()


def _serialize_module(module: Module) -> dict:
    return {
        "id": module.id,
        "name": module.name,
        "parent_id": module.parent_id,
        "project_id": module.project_id,
        "children": [],
    }


def serialize_case(test_case: TestCase) -> dict:
    result = {
        "id": test_case.id,
        "code": test_case.code,
        "title": test_case.title,
        "type": test_case.type,
        "module_id": test_case.module_id,
        "module_name": test_case.module.name,
        "priority": test_case.priority,
        "status": test_case.status,
        "author_id": test_case.author_id,
        "author_name": test_case.author.name,
        "requirement_id": test_case.requirement_id,
        "precondition": test_case.precondition,
        "test_steps": test_case.test_steps,
        "expected_result": test_case.expected_result,
        "iteration": test_case.iteration,
        "is_smoke": test_case.is_smoke,
        "project_name": test_case.project_name,
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
            "query_params": test_case.api_details.query_params,
            "body_type": test_case.api_details.body_type,
            "body_content": test_case.api_details.body_content,
            "body_fields": test_case.api_details.body_fields,
            "request_body": test_case.api_details.request_body,
            "expected_response": test_case.api_details.expected_response,
            "assertions": test_case.api_details.assertions,
            "extracts": test_case.api_details.extracts,
        }
    if test_case.ui_details:
        result["ui_details"] = {
            "description": test_case.ui_details.description,
            "dependency_case_id": test_case.ui_details.dependency_case_id,
            "browser": test_case.ui_details.browser,
            "environment": test_case.ui_details.environment,
            "timeout_seconds": test_case.ui_details.timeout_seconds,
            "retry_count": test_case.ui_details.retry_count,
            "steps": test_case.ui_details.steps,
        }
    return result


def _case_query():
    # 列表序列化会访问作者和两类扩展详情，预加载可避免逐行查询。
    return select(TestCase).options(
        selectinload(TestCase.author),
        selectinload(TestCase.module),
        selectinload(TestCase.api_details),
        selectinload(TestCase.ui_details),
    )


def _distinct_case_values(
    session: Session,
    column: InstrumentedAttribute[str],
    case_type: str | None,
) -> list[str]:
    query = select(column).where(column != "")
    if case_type:
        query = query.where(TestCase.type == case_type)
    return list(session.scalars(query.distinct().order_by(column)))


def get_filter_options(session: Session, *, case_type: str | None) -> dict:
    configured_names = (
        get_settings(session)
        .get("caseManagement", {})
        .get("projectNames", ["官网环境"])
    )
    stored_names = _distinct_case_values(session, TestCase.project_name, case_type)
    return {
        "project_names": list(dict.fromkeys([*configured_names, *stored_names])),
        "iterations": _distinct_case_values(session, TestCase.iteration, case_type),
    }


def filtered_case_query(
    *,
    case_type: str | None,
    module_id: str | None,
    priority: str | None,
    status: str | None,
    keyword: str | None,
    project_name: str | None = None,
    iteration: str | None = None,
    is_smoke: bool | None = None,
):
    query = _case_query().outerjoin(ApiCaseDetails)
    if case_type:
        query = query.where(TestCase.type == case_type)
    if module_id:
        query = query.where(TestCase.module_id == module_id)
    if priority:
        query = query.where(TestCase.priority == priority)
    if status:
        query = query.where(TestCase.status == status)
    if project_name:
        query = query.where(TestCase.project_name == project_name)
    if iteration:
        query = query.where(TestCase.iteration == iteration)
    if is_smoke is not None:
        query = query.where(TestCase.is_smoke == is_smoke)
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        query = query.where(
            or_(
                TestCase.code.ilike(pattern),
                TestCase.title.ilike(pattern),
                ApiCaseDetails.url.ilike(pattern),
            )
        )

    return query


def list_cases(
    session: Session,
    *,
    case_type: str | None,
    module_id: str | None,
    priority: str | None,
    status: str | None,
    project_name: str | None,
    iteration: str | None,
    is_smoke: bool | None,
    keyword: str | None,
    page: int,
    page_size: int,
) -> dict:
    query = filtered_case_query(
        case_type=case_type,
        module_id=module_id,
        priority=priority,
        status=status,
        project_name=project_name,
        iteration=iteration,
        is_smoke=is_smoke,
        keyword=keyword,
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


def add_case(session: Session, payload: TestCaseCreate) -> TestCase:
    # 此函数只 flush、不 commit，调用方可将单条创建组合进导入或 XMind 批量事务。
    if session.get(Module, payload.module_id) is None:
        raise HTTPException(status_code=404, detail="Module not found")
    if session.get(User, payload.author_id) is None:
        raise HTTPException(status_code=404, detail="Author not found")
    if payload.type == "ui" and payload.ui_details and payload.ui_details.dependency_case_id:
        dependency = session.get(TestCase, payload.ui_details.dependency_case_id)
        if dependency is None or dependency.type != "ui":
            raise HTTPException(status_code=422, detail="UI dependency case not found")

    prefix = {"functional": "FUN", "api": "API", "ui": "UI"}[payload.type]
    test_case = TestCase(
        code=payload.code or f"{prefix}-{uuid4().hex[:8].upper()}",
        title=payload.title,
        type=payload.type,
        module_id=payload.module_id,
        priority=payload.priority,
        status=payload.status,
        author_id=payload.author_id,
        requirement_id=payload.requirement_id,
        precondition=payload.precondition,
        test_steps=payload.test_steps,
        expected_result=payload.expected_result,
        iteration=payload.iteration,
        is_smoke=payload.is_smoke,
        project_name=payload.project_name,
    )
    session.add(test_case)
    session.flush()
    if payload.api_details:
        test_case.api_details = ApiCaseDetails(**payload.api_details.model_dump())
    if payload.type == "ui":
        details = payload.ui_details or UiCaseDetails(steps=[])
        test_case.ui_details = (
            details
            if isinstance(details, UiCaseDetails)
            else UiCaseDetails(**details.model_dump(exclude_none=True))
        )
    return test_case


def create_case(session: Session, payload: TestCaseCreate) -> dict:
    test_case = add_case(session, payload)
    session.commit()
    return serialize_case(test_case)


def create_automation_case(
    session: Session, payload: TestCaseCreate, expected_type: str
) -> dict:
    if payload.type != expected_type:
        label = "API" if expected_type == "api" else "UI automation"
        raise HTTPException(status_code=422, detail=f"Only {label} cases are accepted")
    return create_case(session, payload)


def update_automation_case(
    session: Session,
    case_id: int,
    payload: TestCaseUpdate,
    expected_type: str,
) -> dict:
    test_case = session.get(TestCase, case_id)
    if test_case is None:
        raise HTTPException(status_code=404, detail="Test case not found")
    if test_case.type != expected_type:
        label = "API" if expected_type == "api" else "UI automation"
        raise HTTPException(status_code=422, detail=f"Only {label} cases are accepted")
    return update_case(session, case_id, payload)


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
        if payload.ui_details.dependency_case_id:
            dependency = session.get(TestCase, payload.ui_details.dependency_case_id)
            if dependency is None or dependency.type != "ui" or dependency.id == test_case.id:
                raise HTTPException(status_code=422, detail="UI dependency case not found")
        details = payload.ui_details.model_dump(exclude_none=True)
        if test_case.ui_details is None:
            test_case.ui_details = UiCaseDetails(**details)
        else:
            for field, value in details.items():
                setattr(test_case.ui_details, field, value)

    session.commit()
    return serialize_case(test_case)


def delete_case(session: Session, case_id: int) -> None:
    test_case = session.get(TestCase, case_id)
    if test_case is None:
        raise HTTPException(status_code=404, detail="Test case not found")
    session.delete(test_case)
    session.commit()
