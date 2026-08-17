import { DeleteOutlined, PlusOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Empty, Input, Select, Skeleton, Space, Switch, Table, Tabs, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { PersonAvatar } from '../../components/PersonAvatar';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type {
  CreateUserInput,
  PermissionKey,
  PermissionRole,
  UserRecord,
  UserRole,
} from '../../services/contracts';
import { PermissionMatrix } from './components/PermissionMatrix';
import { UserDrawer } from './components/UserDrawer';
import './personnel.css';

type UserStatusFilter = 'enabled' | 'disabled';

const roleOptions: UserRole[] = ['测试负责人', '测试工程师', '开发人员'];

const roleColors: Record<UserRole, string> = {
  测试负责人: 'blue',
  测试工程师: 'cyan',
  开发人员: 'gold',
};

export function PersonnelPage() {
  const service = usePlatformService();
  const { message, modal } = App.useApp();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState<UserRole | undefined>();
  const [status, setStatus] = useState<UserStatusFilter | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [permissionRoles, setPermissionRoles] = useState<PermissionRole[] | null>(null);
  const [savedPermissionRoles, setSavedPermissionRoles] = useState<PermissionRole[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await service.listUsers());
    } catch {
      setUsers([]);
      void message.error('用户列表加载失败');
    }
  }, [message, service]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const loadRoles = useCallback(async () => {
    try {
      const nextRoles = await service.listRoles();
      setPermissionRoles(nextRoles);
      setSavedPermissionRoles(nextRoles);
    } catch {
      setPermissionRoles([]);
    }
  }, [service]);

  useEffect(() => {
    if (activeTab === 'permissions' && permissionRoles === null) void loadRoles();
  }, [activeTab, loadRoles, permissionRoles]);

  const changedPermissionRoles = useMemo(
    () =>
      permissionRoles?.filter((role) => {
        const saved = savedPermissionRoles.find((candidate) => candidate.id === role.id);
        return !saved || JSON.stringify(saved.permissions) !== JSON.stringify(role.permissions);
      }) ?? [],
    [permissionRoles, savedPermissionRoles],
  );

  const togglePermission = (roleId: string, permission: PermissionKey) => {
    setPermissionRoles((current) =>
      current?.map((role) =>
        role.id === roleId
          ? {
              ...role,
              permissions: {
                ...role.permissions,
                [permission]: !role.permissions[permission],
              },
            }
          : role,
      ) ?? null,
    );
  };

  const savePermissions = async () => {
    if (!changedPermissionRoles.length || savingPermissions) return;
    setSavingPermissions(true);
    const pendingEdits = new Map(changedPermissionRoles.map((role) => [role.id, role]));

    try {
      const results = await Promise.allSettled(
        changedPermissionRoles.map((role) =>
          service.updateRolePermissions(role.id, role.permissions),
        ),
      );

      if (results.some((result) => result.status === 'rejected')) {
        const refreshed = await service.listRoles();
        setSavedPermissionRoles(refreshed);
        setPermissionRoles(refreshed.map((role) => pendingEdits.get(role.id) ?? role));
        void message.error('角色权限保存失败');
        return;
      }

      const updated = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      setPermissionRoles((current) =>
        current?.map((role) => updated.find((item) => item.id === role.id) ?? role) ?? null,
      );
      setSavedPermissionRoles((current) =>
        current.map((role) => updated.find((item) => item.id === role.id) ?? role),
      );
      void message.success('角色权限已保存');
    } catch {
      void message.error('角色权限保存失败');
    } finally {
      setSavingPermissions(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return users?.filter((user) => {
      const matchesKeyword =
        !normalizedKeyword ||
        user.name.toLowerCase().includes(normalizedKeyword) ||
        user.email.toLowerCase().includes(normalizedKeyword);
      const matchesRole = !role || user.role === role;
      const matchesStatus =
        !status || (status === 'enabled' ? user.enabled : !user.enabled);

      return matchesKeyword && matchesRole && matchesStatus;
    });
  }, [keyword, role, status, users]);

  const setUserEnabled = useCallback(
    async (user: UserRecord, enabled: boolean) => {
      setUsers((current) =>
        current?.map((item) => (item.id === user.id ? { ...item, enabled } : item)) ?? null,
      );
      setUpdatingUserId(user.id);

      try {
        await service.setUserEnabled(user.id, enabled);
        void message.success(enabled ? '用户已启用' : '用户已停用');
      } catch {
        setUsers((current) =>
          current?.map((item) =>
            item.id === user.id ? { ...item, enabled: user.enabled } : item,
          ) ?? null,
        );
        void message.error('更新用户状态失败');
      } finally {
        setUpdatingUserId(null);
      }
    },
    [message, service],
  );

  const deleteUser = useCallback(
    async (user: UserRecord) => {
      try {
        await service.deleteUser(user.id);
        setUsers((current) => current?.filter((item) => item.id !== user.id) ?? null);
        void message.success('用户已删除');
      } catch (error) {
        void message.error(error instanceof Error ? error.message : '删除用户失败');
      }
    },
    [message, service],
  );

  const confirmDeleteUser = useCallback(
    (user: UserRecord) => {
      modal.confirm({
        title: `确认删除用户「${user.name}」？`,
        content: '删除后该用户账号将无法恢复。',
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => deleteUser(user),
      });
    },
    [deleteUser, modal],
  );

  const columns = useMemo<ColumnsType<UserRecord>>(
    () => [
      {
        title: '姓名',
        dataIndex: 'name',
        width: 150,
        render: (name: string) => (
          <span className="personnel-user">
            <PersonAvatar name={name} size={28} />
            <strong>{name}</strong>
          </span>
        ),
      },
      { title: '邮箱', dataIndex: 'email', width: 230, ellipsis: true },
      { title: '部门', dataIndex: 'department', width: 140 },
      {
        title: '角色',
        dataIndex: 'role',
        width: 130,
        render: (userRole: UserRole) => <Tag color={roleColors[userRole]}>{userRole}</Tag>,
      },
      {
        title: '状态',
        dataIndex: 'enabled',
        width: 100,
        render: (enabled: boolean) => (
          <span className={`personnel-status ${enabled ? 'is-enabled' : 'is-disabled'}`}>
            <span aria-hidden="true" />
            {enabled ? '已启用' : '已停用'}
          </span>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 150,
        render: (_, user) => (
          <Space size={8}>
            <Switch
              size="small"
              aria-label={`${user.name}的启用状态`}
              checked={user.enabled}
              loading={updatingUserId === user.id}
              disabled={updatingUserId !== null}
              onChange={(enabled) => void setUserEnabled(user, enabled)}
            />
            <Button
              type="link"
              danger
              size="small"
              icon={<DeleteOutlined />}
              aria-label={`删除用户${user.name}`}
              onClick={() => confirmDeleteUser(user)}
            >
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [confirmDeleteUser, setUserEnabled, updatingUserId],
  );

  const addUser = async (input: CreateUserInput) => {
    const created = await service.addUser(input);
    await loadUsers();
    return created;
  };

  return (
    <section className="page-section personnel-page">
      <PageHeader
        title="人员管理"
        description="维护用户账号、角色和访问权限"
        actions={
          activeTab === 'users' ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              aria-label="添加用户"
              onClick={() => setDrawerOpen(true)}
            >
              添加用户
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              aria-label="保存"
              loading={savingPermissions}
              disabled={savingPermissions || !changedPermissionRoles.length}
              onClick={() => void savePermissions()}
            >
              保存
            </Button>
          )
        }
      />

      <Tabs
        className="personnel-tabs"
        activeKey={activeTab}
        items={[
          { key: 'users', label: '用户列表' },
          { key: 'permissions', label: '角色与权限' },
        ]}
        onChange={setActiveTab}
      />

      {activeTab === 'users' ? (
        <section className="personnel-panel" role="region" aria-label="用户列表">
          <div className="personnel-toolbar">
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索姓名或邮箱"
              allowClear
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select
              id="personnel-role-filter"
              aria-label="筛选角色"
              placeholder="全部角色"
              allowClear
              value={role}
              options={roleOptions.map((value) => ({ value, label: value }))}
              onChange={setRole}
            />
            <Select
              id="personnel-status-filter"
              aria-label="筛选状态"
              placeholder="全部状态"
              allowClear
              value={status}
              options={[
                { value: 'enabled', label: '已启用' },
                { value: 'disabled', label: '已停用' },
              ]}
              onChange={setStatus}
            />
          </div>

          <div className="personnel-table-scroll">
            {filteredUsers ? (
              filteredUsers.length ? (
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={filteredUsers}
                  size="small"
                  pagination={false}
                  scroll={{ x: 880 }}
                />
              ) : (
                <Empty description="没有符合条件的用户" />
              )
            ) : (
              <Skeleton active paragraph={{ rows: 6 }} />
            )}
          </div>
        </section>
      ) : (
        <section className="personnel-panel personnel-panel--permissions">
          <PermissionMatrix
            roles={permissionRoles}
            disabled={savingPermissions}
            onToggle={togglePermission}
          />
        </section>
      )}

      <UserDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onSubmit={addUser} />
    </section>
  );
}
