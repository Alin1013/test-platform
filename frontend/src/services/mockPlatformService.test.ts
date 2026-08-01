import { createMockPlatformService } from './mockPlatformService';

it('创建接口用例后返回在列表首行', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const created = await service.createTestCase({
    type: 'api',
    moduleId: 'auth',
    name: '刷新访问令牌',
    priority: 'P1',
    endpoint: '/api/token/refresh',
    method: 'POST',
    status: '维护中',
  });

  const rows = await service.listTestCases({ type: 'api', moduleId: 'auth' });

  expect(rows[0]).toMatchObject({ id: created.id, name: '刷新访问令牌' });
});

it('新增用户并切换启用状态', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const user = await service.addUser({
    name: '周敏',
    email: 'zhoumin@example.com',
    department: '质量保障部',
    role: '测试负责人',
    password: 'Test1234',
  });

  await service.setUserEnabled(user.id, false);

  expect((await service.listUsers()).find((item) => item.id === user.id)?.enabled).toBe(false);
});

it('返回角色与权限列表', async () => {
  const service = createMockPlatformService({ delay: 0 });

  const roles = await service.listRoles();

  expect(roles.map((role) => role.name)).toEqual(['测试负责人', '测试工程师', '开发人员']);
});
