"""演示数据初始化：幂等写入角色、用户、模块、用例与平台配置。"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ApiCaseDetails, Module, Role, SystemConfig, TestCase, UiCaseDetails, User
from .services.auth import hash_password


DEFAULT_PERMISSIONS = {
    # 三种内置角色的权限基线，供初始化与重置使用。
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
    # 平台首次启动时的默认配置：通用、用例管理、执行、通知与 AI。
    "general": {
        "platformName": "测试平台",
        "announcement": "",
        "caseNumberPrefix": "TC-",
    },
    "execution": {
        "environments": [
            {"id": "dev", "name": "DEV", "baseUrl": "https://dev-api.example.com"},
            {"id": "test", "name": "TEST", "baseUrl": "https://test-api.example.com"},
        ],
        "defaultEnvironmentId": "test",
        "retryCount": 1,
        "apiTimeoutMs": 30000,
    },
    "notifications": {"wechatWork": "", "feishu": "", "dingtalk": ""},
    "ai": {
        "apiKey": "",
        "baseUrl": "https://api.openai.com/v1",
        "defaultModel": "gpt-5.6",
    },
}


def seed_database(session: Session) -> None:
    """幂等填充演示数据；已存在角色时仅修复旧版演示账号缺失的密码。"""
    # 角色是种子数据哨兵；已存在时只修复旧版演示账号的缺失凭据。
    if session.scalar(select(Role.id).limit(1)) is not None:
        # 旧版演示库没有登录凭据，仅为预置邮箱补齐默认密码。
        demo_users = session.scalars(
            select(User).where(
                User.email.in_(
                    {
                        "jiangshan@example.com",
                        "linran@example.com",
                        "shenyi@example.com",
                    }
                )
            )
        ).all()
        changed = False
        for user in demo_users:
            if user.password_hash is None:
                user.password_hash = hash_password("Test1234")
                changed = True
        if changed:
            session.commit()
        return

    roles = [Role(name=name, permissions=permissions) for name, permissions in DEFAULT_PERMISSIONS.items()]
    session.add_all(roles)
    session.flush()

    lead = User(
        account="jiangshan",
        name="江珊",
        email="jiangshan@example.com",
        department="质量保障部",
        role=roles[0],
        status="enabled",
        password_hash=hash_password("Test1234"),
    )
    developer = User(
        account="linran",
        name="林然",
        email="linran@example.com",
        department="研发部",
        role=roles[2],
        status="enabled",
        password_hash=hash_password("Test1234"),
    )
    engineer = User(
        account="shenyi",
        name="沈怡",
        email="shenyi@example.com",
        department="质量保障部",
        role=roles[1],
        status="enabled",
        password_hash=hash_password("Test1234"),
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
