"""创建初始数据库结构。

修订版本：ec4691e0b496
前置版本：无
创建时间：2026-08-03 09:25:59.338576

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Alembic 迁移链标识。
revision: str = 'ec4691e0b496'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """创建测试平台的全部初始数据表和索引。"""
    op.create_table('modules',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=128), nullable=False),
    sa.Column('parent_id', sa.String(length=64), nullable=True),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['parent_id'], ['modules.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_modules_project_id'), 'modules', ['project_id'], unique=False)
    op.create_table('roles',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=64), nullable=False),
    sa.Column('permissions', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_roles_name'), 'roles', ['name'], unique=True)
    op.create_table('system_configs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('key', sa.String(length=128), nullable=False),
    sa.Column('value', sa.JSON(), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_system_configs_key'), 'system_configs', ['key'], unique=True)
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=64), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('department', sa.String(length=128), nullable=False),
    sa.Column('role_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_name'), 'users', ['name'], unique=False)
    op.create_index(op.f('ix_users_role_id'), 'users', ['role_id'], unique=False)
    op.create_index(op.f('ix_users_status'), 'users', ['status'], unique=False)
    op.create_table('test_cases',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=32), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('type', sa.String(length=16), nullable=False),
    sa.Column('module_id', sa.String(length=64), nullable=False),
    sa.Column('priority', sa.String(length=4), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['module_id'], ['modules.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_test_cases_author_id'), 'test_cases', ['author_id'], unique=False)
    op.create_index(op.f('ix_test_cases_code'), 'test_cases', ['code'], unique=True)
    op.create_index(op.f('ix_test_cases_module_id'), 'test_cases', ['module_id'], unique=False)
    op.create_index(op.f('ix_test_cases_priority'), 'test_cases', ['priority'], unique=False)
    op.create_index(op.f('ix_test_cases_status'), 'test_cases', ['status'], unique=False)
    op.create_index(op.f('ix_test_cases_title'), 'test_cases', ['title'], unique=False)
    op.create_index(op.f('ix_test_cases_type'), 'test_cases', ['type'], unique=False)
    op.create_table('xmind_records',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('file_url', sa.String(length=2048), nullable=False),
    sa.Column('uploader_id', sa.Integer(), nullable=False),
    sa.Column('parsed_cases_count', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['uploader_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_xmind_records_uploader_id'), 'xmind_records', ['uploader_id'], unique=False)
    op.create_table('api_case_details',
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('url', sa.String(length=2048), nullable=False),
    sa.Column('method', sa.String(length=8), nullable=False),
    sa.Column('expected_code', sa.Integer(), nullable=False),
    sa.Column('headers', sa.JSON(), nullable=False),
    sa.Column('request_body', sa.JSON(), nullable=True),
    sa.Column('expected_response', sa.JSON(), nullable=True),
    sa.ForeignKeyConstraint(['case_id'], ['test_cases.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('case_id')
    )
    op.create_table('ui_case_details',
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('steps', sa.JSON(), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['test_cases.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('case_id')
    )


def downgrade() -> None:
    """按外键依赖的逆序删除初始数据库结构。"""
    op.drop_table('ui_case_details')
    op.drop_table('api_case_details')
    op.drop_index(op.f('ix_xmind_records_uploader_id'), table_name='xmind_records')
    op.drop_table('xmind_records')
    op.drop_index(op.f('ix_test_cases_type'), table_name='test_cases')
    op.drop_index(op.f('ix_test_cases_title'), table_name='test_cases')
    op.drop_index(op.f('ix_test_cases_status'), table_name='test_cases')
    op.drop_index(op.f('ix_test_cases_priority'), table_name='test_cases')
    op.drop_index(op.f('ix_test_cases_module_id'), table_name='test_cases')
    op.drop_index(op.f('ix_test_cases_code'), table_name='test_cases')
    op.drop_index(op.f('ix_test_cases_author_id'), table_name='test_cases')
    op.drop_table('test_cases')
    op.drop_index(op.f('ix_users_status'), table_name='users')
    op.drop_index(op.f('ix_users_role_id'), table_name='users')
    op.drop_index(op.f('ix_users_name'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_system_configs_key'), table_name='system_configs')
    op.drop_table('system_configs')
    op.drop_index(op.f('ix_roles_name'), table_name='roles')
    op.drop_table('roles')
    op.drop_index(op.f('ix_modules_project_id'), table_name='modules')
    op.drop_table('modules')
