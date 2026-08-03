"""增加业务表中文注释。

修订版本：e91f4c6a2d30
前置版本：d84e2b7f6a19
创建时间：2026-08-03 11:40:00

"""
from collections.abc import Sequence

from alembic import op


revision: str = "e91f4c6a2d30"
down_revision: str | Sequence[str] | None = "d84e2b7f6a19"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLE_COMMENTS = {
    "roles": "角色与权限配置",
    "users": "用户账号、个人资料与启停状态",
    "auth_sessions": "用户登录会话与访问令牌摘要",
    "modules": "项目测试模块及父子层级",
    "test_cases": "测试用例公共信息",
    "api_case_details": "接口测试用例扩展信息",
    "ui_case_details": "UI 自动化用例扩展信息",
    "xmind_records": "XMind 文件上传与解析记录",
    "system_configs": "系统全局配置",
}


def upgrade() -> None:
    """为支持原生表注释的数据库写入中文说明。"""
    if not op.get_bind().dialect.supports_comments:
        return
    for table_name, comment in TABLE_COMMENTS.items():
        op.create_table_comment(table_name, comment)


def downgrade() -> None:
    """删除业务表的原生注释。"""
    if not op.get_bind().dialect.supports_comments:
        return
    for table_name, comment in TABLE_COMMENTS.items():
        op.drop_table_comment(table_name, existing_comment=comment)
