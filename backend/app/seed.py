from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ApiCaseDetails, Module, Role, SystemConfig, TestCase, UiCaseDetails, User


DEFAULT_PERMISSIONS = {
    "测试负责人": {
        "caseView": True,
        "caseEdit": True,
        "xmindConvert": True,
        "personnelManage": True,
        "systemSettings": True,
    },
    "测试工程师": {
        "caseView": True,
        "caseEdit": True,
        "xmindConvert": True,
        "personnelManage": False,
        "systemSettings": False,
    },
    "开发人员": {
        "caseView": True,
        "caseEdit": False,
        "xmindConvert": False,
        "personnelManage": False,
        "systemSettings": False,
    },
}


DEFAULT_SETTINGS = {
    "general": {
        "platformName": "测试平台",
        "announcement": "",
        "caseNumberPrefix": "TC-",
    },
    "execution": {
        "baseUrl": "https://test-api.example.com",
        "retryCount": 1,
        "apiTimeoutMs": 30000,
    },
    "notifications": {"wechatWork": "", "feishu": "", "dingtalk": ""},
    "ai": {
        "apiKey": "",
        "baseUrl": "https://api.openai.com/v1",
        "defaultModel": "gpt-4.1-mini",
    },
}


def seed_database(session: Session) -> None:
    if session.scalar(select(Role.id).limit(1)) is not None:
        return

    roles = [Role(name=name, permissions=permissions) for name, permissions in DEFAULT_PERMISSIONS.items()]
    session.add_all(roles)
    session.flush()

    lead = User(
        name="江珊",
        email="jiangshan@example.com",
        department="质量保障部",
        role=roles[0],
        status="enabled",
    )
    developer = User(
        name="林然",
        email="linran@example.com",
        department="研发部",
        role=roles[2],
        status="enabled",
    )
    engineer = User(
        name="沈怡",
        email="shenyi@example.com",
        department="质量保障部",
        role=roles[1],
        status="enabled",
    )
    session.add_all([lead, developer, engineer])
    session.add_all(
        [
            Module(id="auth", name="鉴权", project_id=1),
            Module(id="payments", name="支付", project_id=1),
            Module(id="profile", name="用户资料", parent_id="auth", project_id=1),
        ]
    )
    session.flush()

    cases = [
        TestCase(code="FUN-12583", title="用户登录成功", type="functional", module_id="auth", priority="P0", status="维护中", author=lead),
        TestCase(code="UI-13533", title="登录表单校验", type="ui", module_id="auth", priority="P1", status="已通过", author=engineer),
        TestCase(code="API-253301", title="用户资料查询", type="api", module_id="auth", priority="P0", status="已通过", author=lead),
        TestCase(code="API-253302", title="创建支付订单", type="api", module_id="payments", priority="P1", status="维护中", author=developer),
        TestCase(code="API-253303", title="用户登录", type="api", module_id="auth", priority="P0", status="维护中", author=lead),
        TestCase(code="FUN-12584", title="订单退款成功", type="functional", module_id="payments", priority="P1", status="已通过", author=developer),
        TestCase(code="UI-13534", title="支付结果页展示", type="ui", module_id="payments", priority="P2", status="草稿", author=engineer),
    ]
    session.add_all(cases)
    session.flush()
    session.add_all(
        [
            ApiCaseDetails(case_id=cases[2].id, url="/api/users/profile", method="GET", expected_code=200),
            ApiCaseDetails(case_id=cases[3].id, url="/api/payments", method="POST", expected_code=201),
            ApiCaseDetails(case_id=cases[4].id, url="/api/auth/login", method="POST", expected_code=200),
            UiCaseDetails(case_id=cases[1].id, steps=[]),
            UiCaseDetails(case_id=cases[6].id, steps=[]),
            SystemConfig(key="platform_settings", value=DEFAULT_SETTINGS, description="平台全局配置"),
        ]
    )
    session.commit()
