/**
 * 人员管理页：用户列表（搜索/筛选/启停/删除）与角色权限矩阵两个 Tab。
 */
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { PersonAvatar } from '../../components/PersonAvatar';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type {
  CreateRoleInput,
  CreateUserInput,
  PermissionKey,
  PermissionRole,
  UserRecord,
  UserRole,
  UpdateRoleInput,
} from '../../services/contracts';
import { PermissionMatrix } from './components/PermissionMatrix';
import { UserDrawer } from './components/UserDrawer';
import './personnel.css';

type UserStatusFilter = 'enabled' | 'disabled';

const roleColors: Record<string, string> = {
  测试负责人: 'blue',
  测试工程师: 'cyan',
  开发人员: 'gold',
};

export function PersonnelPage() {
  // users 为 null 表示加载中；权限矩阵维护“已保存快照”以便计算变更。
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
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<PermissionRole | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [roleForm] = Form.useForm<CreateRoleInput | UpdateRoleInput>();
  const [roleEditingUser, setRoleEditingUser] = useState<UserRecord | null>(null);
  const [savingUserRole, setSavingUserRole] = useState(false);
  const [userRoleForm] = Form.useForm<{ role: UserRole }>();

  const loadUsers = useCallback(async () => {
    // 加载失败降级为空列表并提示，避免整页报错。
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
    // 用户抽屉也依赖角色列表，因此进入人员页时就加载，避免角色选项与权限配置脱节。
    if (permissionRoles === null) void loadRoles();
  }, [loadRoles, permissionRoles]);

  const changedPermissionRoles = useMemo(
    // 与已保存快照对比，只提交发生变化的角色。
    () =>
      permissionRoles?.filter((role) => {
        const saved = savedPermissionRoles.find((candidate) => candidate.id === role.id);
        return !saved || JSON.stringify(saved.permissions) !== JSON.stringify(role.permissions);
      }) ?? [],
    [permissionRoles, savedPermissionRoles],
  );

  const togglePermission = (roleId: string, permission: PermissionKey) => {
    // 不可变更新权限位，触发变更列表重新计算。
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
    // 并行保存变更角色；部分失败时用服务端最新数据刷新并保留未保存的编辑。
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

  const openCreateRole = () => {
    // 新增角色从空权限开始，管理员必须显式授予访问权限。
    setEditingRole(null);
    setRoleModalOpen(true);
  };

  const openEditRole = (nextRole: PermissionRole) => {
    // 编辑只修改名称，权限位继续由矩阵和保存按钮负责。
    setEditingRole(nextRole);
    setRoleModalOpen(true);
  };

  useEffect(() => {
    // Modal 挂载 Form 后再写入字段，避免 Ant Design 在弹窗尚未连接时产生控制台警告。
    if (!roleModalOpen) return;
    roleForm.setFieldsValue(editingRole ? { name: editingRole.name } : { name: undefined });
  }, [editingRole, roleForm, roleModalOpen]);

  const closeRoleModal = () => {
    roleForm.resetFields();
    setEditingRole(null);
    setRoleModalOpen(false);
  };

  const submitRole = async (values: CreateRoleInput | UpdateRoleInput) => {
    const name = values.name.trim();
    if (!name) {
      roleForm.setFields([{ name: 'name', errors: ['请输入角色名称'] }]);
      return;
    }

    setSavingRole(true);
    try {
      const saved = editingRole
        ? await service.updateRole(editingRole.id, { name })
        : await service.createRole({ name });
      setPermissionRoles((current) => {
        if (!current) return [saved];
        return editingRole
          ? current.map((role) => (role.id === saved.id ? saved : role))
          : [...current, saved];
      });
      setSavedPermissionRoles((current) =>
        editingRole
          ? current.map((role) => (role.id === saved.id ? saved : role))
          : [...current, saved],
      );
      closeRoleModal();
      void message.success(editingRole ? '角色已修改' : '角色已添加');
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '角色保存失败');
    } finally {
      setSavingRole(false);
    }
  };

  const openUserRoleEditor = (user: UserRecord) => {
    // 用户角色编辑只改变角色归属，角色权限仍统一从角色配置矩阵继承。
    setRoleEditingUser(user);
  };

  useEffect(() => {
    // 弹窗挂载后再回填当前角色，避免表单实例尚未连接时产生 Ant Design 警告。
    if (roleEditingUser) userRoleForm.setFieldsValue({ role: roleEditingUser.role });
  }, [roleEditingUser, userRoleForm]);

  const closeUserRoleEditor = () => {
    if (savingUserRole) return;
    userRoleForm.resetFields();
    setRoleEditingUser(null);
  };

  const submitUserRole = async (values: { role: UserRole }) => {
    if (!roleEditingUser) return;
    setSavingUserRole(true);
    try {
      const updated = await service.updateUserRole(roleEditingUser.id, values);
      setUsers((current) =>
        current?.map((user) => (user.id === updated.id ? updated : user)) ?? null,
      );
      userRoleForm.resetFields();
      setRoleEditingUser(null);
      void message.success('用户角色已更新');
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '更新用户角色失败');
    } finally {
      setSavingUserRole(false);
    }
  };

  const filteredUsers = useMemo(() => {
    // 客户端过滤：姓名/邮箱关键字 + 角色 + 启用状态。
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
      // 先乐观更新 UI，失败时回滚到原状态。
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
      // 后端约束启用账号不可删除，前端先拦截提示。
      if (user.enabled) {
        void message.warning('请先停用账号');
        return;
      }
      modal.confirm({
        title: `确认删除用户「${user.name}」？`,
        content: '删除后该用户账号将无法恢复。',
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => deleteUser(user),
      });
    },
    [deleteUser, message, modal],
  );

  const columns = useMemo<ColumnsType<UserRecord>>(
    // 用户表格列：姓名/邮箱/部门/角色/状态/操作。
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
        render: (userRole: UserRole) => (
          <Tag color={roleColors[userRole] ?? 'default'}>{userRole}</Tag>
        ),
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
        width: 220,
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
              size="small"
              icon={<EditOutlined />}
              aria-label={`编辑用户${user.name}的角色`}
              onClick={() => openUserRoleEditor(user)}
            >
              角色
            </Button>
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
    // 添加用户成功后刷新列表，让新账号立即可见。
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
            <Space>
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
              <Button icon={<PlusOutlined />} aria-label="添加角色" onClick={openCreateRole}>
                添加角色
              </Button>
            </Space>
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
              options={(permissionRoles ?? []).map((item) => ({
                value: item.name,
                label: item.name,
              }))}
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
                  scroll={{ x: 950 }}
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
            onEditRole={openEditRole}
          />
        </section>
      )}

      <UserDrawer
        open={drawerOpen}
        roles={permissionRoles}
        onClose={() => setDrawerOpen(false)}
        onSubmit={addUser}
      />

      <Modal
        title={editingRole ? '编辑角色' : '添加角色'}
        open={roleModalOpen}
        destroyOnHidden
        okText="保存"
        cancelText="取消"
        confirmLoading={savingRole}
        onOk={() => roleForm.submit()}
        onCancel={closeRoleModal}
      >
        <Form
          form={roleForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => void submitRole(values)}
        >
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, whitespace: true, message: '请输入角色名称' }]}
          >
            <Input
              autoFocus
              maxLength={64}
              placeholder="例如：产品经理"
              aria-label="角色名称"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`修改${roleEditingUser?.name ?? ''}的角色`}
        open={roleEditingUser !== null}
        destroyOnHidden
        okText="保存"
        cancelText="取消"
        confirmLoading={savingUserRole}
        onOk={() => userRoleForm.submit()}
        onCancel={closeUserRoleEditor}
      >
        <Form
          form={userRoleForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => void submitUserRole(values)}
        >
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              aria-label="角色"
              options={(permissionRoles ?? []).map((role) => ({
                value: role.name,
                label: role.name,
              }))}
              placeholder="请选择角色"
            />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
