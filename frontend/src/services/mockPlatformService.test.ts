import { createMockPlatformService } from './mockPlatformService';

it('返回项目测试用例目录树', async () => {
  const service = createMockPlatformService({ delay: 0 });

  await expect(service.listTestModules()).resolves.toEqual([
    expect.objectContaining({
      id: 'core',
      name: '核心模块',
      children: expect.arrayContaining([
        expect.objectContaining({ id: 'auth', name: '鉴权' }),
      ]),
    }),
  ]);
});

it('创建新模块后返回可用于归类用例的模块 ID，并更新模块树', async () => {
  const service = createMockPlatformService({ delay: 0 });

  const created = await service.createTestModule({ name: '结算' });

  expect(created).toMatchObject({ name: '结算', projectId: 1, children: [] });
  await expect(service.listTestModules(1)).resolves.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: created.id, name: '结算' })]),
  );
  await expect(service.createTestModule({ name: '结算' })).resolves.toMatchObject({
    id: created.id,
  });
});

it('重命名和删除模块后列表仍反映持久化结果', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const created = await service.createTestModule({ name: '临时模块' });

  await expect(service.updateTestModule(created.id, { name: '结算模块' })).resolves.toMatchObject({
    id: created.id,
    name: '结算模块',
  });
  expect((await service.listTestModules(1)).some((module) => module.name === '结算模块')).toBe(true);

  await service.deleteTestModule(created.id);
  expect((await service.listTestModules(1)).some((module) => module.id === created.id)).toBe(false);
});

it('XMind 确认存在无效目录映射时不会保存部分用例', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const before = await service.listTestCases({ type: 'functional' });
  const generated = await service.generateXMind(new File(['xmind'], '登录.xmind'));
  const ready = await service.getXMindTask(generated.id);
  const cases = [
    ready.cases[0],
    { ...ready.cases[1], 用例目录: '不存在/目录' },
  ];

  await expect(
    service.confirmXMind({
      uploaderId: 1,
      moduleMapping: { '核心模块/鉴权': 'auth' },
      cases,
    }),
  ).rejects.toThrow('模块映射不存在：不存在/目录');

  await expect(service.listTestCases({ type: 'functional' })).resolves.toEqual(before);
});

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

it('按项目归属、归属迭代和非冒烟标记组合筛选功能用例', async () => {
  const service = createMockPlatformService({ delay: 0 });

  const rows = await service.listTestCases({
    type: 'functional',
    projectName: '官网环境',
    iteration: 'Sprint 12',
    isSmoke: false,
  });

  expect(rows.map((testCase) => testCase.id)).toEqual(['FUN-12584']);
});

it('从完整功能用例数据生成筛选选项', async () => {
  const service = createMockPlatformService({ delay: 0 });
  await service.createTestCase({
    type: 'functional',
    moduleId: 'auth',
    name: '移动端结算回归',
    priority: 'P1',
    status: '维护中',
    projectName: '移动端',
    iteration: 'Sprint 13',
  });

  await expect(service.getTestCaseFilterOptions('functional')).resolves.toEqual({
    projectNames: ['官网环境', '移动端'],
    iterations: ['Sprint 12', 'Sprint 13'],
  });
});

it('创建 UI 自动化用例后保留执行配置和步骤', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const uiDetails = {
    description: '登录失败场景',
    browser: 'firefox' as const,
    environment: 'staging' as const,
    timeoutSeconds: 60,
    retryCount: 1,
    steps: [
      {
        action: 'navigate' as const,
        locatorType: 'css' as const,
        target: 'https://staging.example.com/login',
        value: '',
        assertion: 'urlEquals' as const,
        expected: 'https://staging.example.com/login',
      },
    ],
  };

  const created = await service.createTestCase({
    type: 'ui',
    moduleId: 'auth',
    name: '登录失败',
    priority: 'P1',
    status: '维护中',
    uiDetails,
  });

  expect(created.uiDetails).toEqual(uiDetails);
  await expect(service.listTestCases({ type: 'ui', keyword: '登录失败' })).resolves.toContainEqual(created);
});

it('按 storageId 更新功能用例并反映在关键词查询中', async () => {
  const service = createMockPlatformService({ delay: 0 });

  const updated = await service.updateTestCase(1, {
    moduleId: 'profile',
    name: '用户登录并进入资料页',
    priority: 'P2',
    status: '已通过',
  });

  expect(updated).toMatchObject({
    storageId: 1,
    id: 'FUN-12583',
    type: 'functional',
    moduleId: 'profile',
    name: '用户登录并进入资料页',
    priority: 'P2',
    status: '已通过',
    updatedAt: '刚刚',
  });
  await expect(service.listTestCases({ keyword: '进入资料页' })).resolves.toEqual([updated]);
});

it('更新 API 用例的公共字段时保留显式 undefined 的 API 详情', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const existing = (await service.listTestCases({ keyword: 'API-253301' }))[0];

  const updated = await service.updateTestCase(existing.storageId, {
    moduleId: 'profile',
    name: '用户资料查询更新',
    priority: 'P2',
    status: '已通过',
    endpoint: undefined,
    method: undefined,
    expectedStatus: undefined,
  });

  expect(updated).toMatchObject({
    moduleId: 'profile',
    name: '用户资料查询更新',
    priority: 'P2',
    endpoint: '/api/users/profile',
    method: 'GET',
    expectedStatus: 200,
  });
  await expect(service.listTestCases({ keyword: '用户资料查询更新' })).resolves.toEqual([updated]);
});

it('按 storageId 删除功能用例后显示编号查询不到记录', async () => {
  const service = createMockPlatformService({ delay: 0 });

  await service.deleteTestCase(1);

  await expect(service.listTestCases({ keyword: 'FUN-12583' })).resolves.toEqual([]);
});

it('导入功能用例时归一化 Apifox 中文枚举并允许覆盖模块', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const csv = [
    '用例目录,用例名称,需求ID,前置条件,用例步骤,预期结果,用例类型,用例状态,用例等级,创建人,归属迭代,是否冒烟,项目归属',
    ',导入 Apifox 功能用例,REQ-APIFOX,账号已启用,打开登录页,进入首页,功能测试,正常,中,江珊,Sprint 13,否,测试平台',
  ].join('\n');
  const file = {
    name: 'apifox-functional.csv',
    text: async () => csv,
    arrayBuffer: async () => new TextEncoder().encode(csv).buffer,
  } as File;

  const result = await service.importTestCases(file, 'auth');
  const rows = await service.listTestCases({ keyword: '导入 Apifox 功能用例' });

  expect(result).toEqual({ importedCount: 1, codes: [rows[0].id] });
  expect(rows[0]).toMatchObject({
    type: 'functional',
    moduleId: 'auth',
    priority: 'P1',
    status: '维护中',
    requirementId: 'REQ-APIFOX',
    projectName: '测试平台',
  });
});

it('更新或删除不存在的用例时抛出明确错误', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const input = {
    moduleId: 'auth',
    name: '不存在的用例',
    priority: 'P1' as const,
    status: '维护中' as const,
  };

  await expect(service.updateTestCase(999, input)).rejects.toThrow('测试用例不存在');
  await expect(service.deleteTestCase(999)).rejects.toThrow('测试用例不存在');
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

it('删除用户后列表不再包含该用户，重复删除报错', async () => {
  const service = createMockPlatformService({ delay: 0 });

  await service.setUserEnabled('USR-1001', false);
  await service.deleteUser('USR-1001');

  expect((await service.listUsers()).find((item) => item.id === 'USR-1001')).toBeUndefined();
  await expect(service.deleteUser('USR-1001')).rejects.toThrow('用户不存在');
});

it('已启用用户不允许删除', async () => {
  const service = createMockPlatformService({ delay: 0 });

  await expect(service.deleteUser('USR-1001')).rejects.toThrow('请先停用账号');
  expect((await service.listUsers()).find((item) => item.id === 'USR-1001')).toBeDefined();
});

it('返回角色与权限列表', async () => {
  const service = createMockPlatformService({ delay: 0 });

  const roles = await service.listRoles();

  expect(roles.map((role) => role.name)).toEqual(['测试负责人', '测试工程师', '开发人员']);
});

it('模拟 UI 自动化执行的启动、查询和中断', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const started = await service.startUiExecution({
    projectId: 1,
    suiteIds: [2],
    environment: 'staging',
    browser: 'chrome',
    headless: true,
    concurrency: 1,
  });

  expect((await service.getUiExecution(started.executionId)).summary.pending).toBe(1);
  await service.stopUiExecution(started.executionId);
  expect((await service.getUiExecution(started.executionId)).status).toBe('CANCELLED');
});

it('模拟接口自动化执行报告', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const started = await service.startApiExecution({
    projectId: 1,
    suiteIds: [3],
    envId: 3,
    globalHeaders: {},
    iterations: 1,
    rampUpTime: 0,
  });

  const report = await service.getApiExecutionReport(started.executionId);

  expect(report.summary).toMatchObject({ totalApi: 1, pendingApi: 1 });
  expect(report.results[0]).toMatchObject({ name: '用户资料查询', method: 'GET' });
});

it('保存系统设置后再次读取时返回最新配置', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const settings = await service.getSystemSettings();

  await service.updateSystemSettings({
    ...settings,
    general: {
      ...settings.general,
      platformName: '质量保障中心',
      caseNumberPrefix: 'QA-',
    },
    execution: {
      ...settings.execution,
      retryCount: 3,
    },
  });

  await expect(service.getSystemSettings()).resolves.toMatchObject({
    general: { platformName: '质量保障中心', caseNumberPrefix: 'QA-' },
    execution: { retryCount: 3 },
  });
});

it('保存测试环境列表后再次读取时保留环境名称与 Base URL', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const settings = await service.getSystemSettings();

  await service.updateSystemSettings({
    ...settings,
    execution: {
      ...settings.execution,
      environments: [
        ...settings.execution.environments,
        { id: 'staging', name: 'STAG', baseUrl: 'https://staging.example.com' },
      ],
      defaultEnvironmentId: 'staging',
    },
  });

  await expect(service.getSystemSettings()).resolves.toMatchObject({
    execution: {
      defaultEnvironmentId: 'staging',
      environments: expect.arrayContaining([
        { id: 'staging', name: 'STAG', baseUrl: 'https://staging.example.com' },
      ]),
    },
  });
});
