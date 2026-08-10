import {
  initialRoles,
  initialSystemSettings,
  initialTestCases,
  initialTestModules,
  initialUsers,
} from '../mocks/fixtures';
import type {
  ApiExecutionInput,
  ApiExecutionReport,
  ApiDebugInput,
  CreateTestCaseInput,
  CreateTestModuleInput,
  CreateUserInput,
  SystemSettings,
  PlatformService,
  TestCaseQuery,
  TestCaseImportResult,
  TestCaseRecord,
  TestCaseType,
  TestModule,
  UpdateTestModuleInput,
  UpdateTestCaseInput,
  UiExecutionInput,
  UiExecutionResult,
  UiDebugInput,
  UserRecord,
  XMindConfirmInput,
  XMindConfirmResult,
  XMindGeneratedCase,
  XMindGenerationResult,
  XMindTaskDetail,
  XMindTaskRecord,
  XMindTaskStatus,
  PaginatedResult,
} from './contracts';

interface MockServiceOptions {
  delay?: number;
}

const copy = <T,>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

function findModuleById(modules: TestModule[], moduleId: string): TestModule | undefined {
  for (const module of modules) {
    if (module.id === moduleId) return module;
    const child = findModuleById(module.children, moduleId);
    if (child) return child;
  }
  return undefined;
}

function updateModuleChildren(
  modules: TestModule[],
  moduleId: string,
  update: (children: TestModule[]) => TestModule[],
): TestModule[] {
  return modules.map((module) => {
    if (module.id === moduleId) {
      return { ...module, children: update(module.children) };
    }
    if (!module.children.length) return module;
    return {
      ...module,
      children: updateModuleChildren(module.children, moduleId, update),
    };
  });
}

function updateModule(
  modules: TestModule[],
  moduleId: string,
  update: (module: TestModule) => TestModule,
): TestModule[] {
  return modules.map((module) => {
    if (module.id === moduleId) return update(module);
    if (!module.children.length) return module;
    return { ...module, children: updateModule(module.children, moduleId, update) };
  });
}

function removeModule(modules: TestModule[], moduleId: string): TestModule[] {
  return modules
    .filter((module) => module.id !== moduleId)
    .map((module) => ({
      ...module,
      children: removeModule(module.children, moduleId),
    }));
}

function flattenModuleIds(module: TestModule): string[] {
  return [module.id, ...module.children.flatMap(flattenModuleIds)];
}

function flattenModules(modules: TestModule[]): TestModule[] {
  return modules.flatMap((module) => [module, ...flattenModules(module.children)]);
}

function addModuleName(testCase: TestCaseRecord, modules: TestModule[]): TestCaseRecord {
  return {
    ...testCase,
    moduleName: findModuleById(modules, testCase.moduleId)?.name ?? testCase.moduleName,
  };
}

export function createMockPlatformService({ delay = 120 }: MockServiceOptions = {}): PlatformService {
  let testCases = copy(initialTestCases);
  let modules = copy(initialTestModules);
  let users = copy(initialUsers);
  let roles = copy(initialRoles);
  let caseSequence = 260000;
  let storageIdSequence = Math.max(...testCases.map((testCase) => testCase.storageId)) + 1;
  let userSequence = 2000;
  let systemSettings = copy(initialSystemSettings);
  let executionSequence = 1;
  let xmindTaskSequence = 1;
  let xmindTasks: XMindTaskDetail[] = [];
  const uiExecutions = new Map<string, UiExecutionResult>();
  const apiExecutions = new Map<string, ApiExecutionReport>();

  const respond = async <T,>(value: T): Promise<T> => {
    if (delay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
    return copy(value);
  };

  const typeAliases: Record<string, TestCaseRecord['type']> = {
    功能用例: 'functional',
    功能测试: 'functional',
    功能测试用例: 'functional',
    接口用例: 'api',
    接口测试: 'api',
    接口测试用例: 'api',
    UI自动化: 'ui',
    UI测试: 'ui',
    UI测试用例: 'ui',
  };
  const priorityAliases: Record<string, TestCaseRecord['priority']> = {
    高: 'P0',
    最高: 'P0',
    P0: 'P0',
    中: 'P1',
    P1: 'P1',
    低: 'P2',
    P2: 'P2',
    很低: 'P3',
    极低: 'P3',
    最低: 'P3',
    P3: 'P3',
  };
  const statusAliases: Record<string, TestCaseRecord['status']> = {
    正常: '维护中',
    启用: '维护中',
    维护中: '维护中',
    已通过: '已通过',
    草稿: '草稿',
    失败: '已失败',
    已失败: '已失败',
    停用: '已停用',
    禁用: '已停用',
    已停用: '已停用',
  };
  const normalizeValue = <T extends string>(value: string, aliases: Record<string, T>) =>
    (aliases[value] ?? value) as T;

  return {
    async getDashboard() {
      const counts = {
        functional: testCases.filter((testCase) => testCase.type === 'functional').length,
        api: testCases.filter((testCase) => testCase.type === 'api').length,
        ui: testCases.filter((testCase) => testCase.type === 'ui').length,
      };
      return respond({
        counts,
        total: counts.functional + counts.api + counts.ui,
        recentCases: testCases.slice(0, 6).map((testCase) => addModuleName(testCase, modules)),
      });
    },

    async listTestModules(projectId?: number) {
      return respond(
        projectId === undefined
          ? modules
          : modules.filter((module) => module.projectId === projectId),
      );
    },

    async createTestModule(input: CreateTestModuleInput) {
      const projectId = input.projectId ?? 1;
      const name = input.name.trim();
      if (!name) throw new Error('模块名称不能为空');
      const findModule = (nodes: typeof modules): TestModule | undefined => {
        for (const module of nodes) {
          if (
            module.projectId === projectId &&
            module.parentId === input.parentId &&
            module.name.toLocaleLowerCase() === name.toLocaleLowerCase()
          ) {
            return module;
          }
          const child = findModule(module.children);
          if (child) return child;
        }
        return undefined;
      };
      const existing = findModule(modules);
      if (existing) return respond(existing);

      if (input.parentId && !findModuleById(modules, input.parentId)) {
        throw new Error('父模块不存在');
      }
      const created: TestModule = {
        id: `module-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        projectId,
        ...(input.parentId ? { parentId: input.parentId } : {}),
        children: [],
      };
      if (input.parentId) {
        modules = updateModuleChildren(modules, input.parentId, (children) => [
          ...children,
          created,
        ]);
      } else {
        modules = [...modules, created];
      }
      return respond(created);
    },

    async updateTestModule(moduleId: string, input: UpdateTestModuleInput) {
      const existing = findModuleById(modules, moduleId);
      if (!existing) throw new Error('模块不存在');
      const name = input.name.trim();
      if (!name) throw new Error('模块名称不能为空');
      const siblings = flattenModules(modules)
        .filter((module) => module.parentId === existing.parentId && module.id !== moduleId);
      if (siblings.some((module) => module.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new Error('同级模块名称已存在');
      }
      const updated = { ...existing, name };
      modules = updateModule(modules, moduleId, () => updated);
      return respond(updated);
    },

    async deleteTestModule(moduleId: string) {
      const existing = findModuleById(modules, moduleId);
      if (!existing) throw new Error('模块不存在');
      const moduleIds = new Set(flattenModuleIds(existing));
      if (testCases.some((testCase) => moduleIds.has(testCase.moduleId))) {
        throw new Error('包含测试用例的模块不能删除');
      }
      modules = removeModule(modules, moduleId);
      await respond(undefined);
    },

    async getTestCaseFilterOptions(type?: TestCaseType) {
      const matchingCases = testCases.filter((testCase) => !type || testCase.type === type);
      const uniqueValues = (values: Array<string | undefined>) =>
        Array.from(new Set(values.filter((value): value is string => Boolean(value))))
          .sort((left, right) => left.localeCompare(right, 'zh-CN'));
      return respond({
        projectNames: uniqueValues(matchingCases.map((testCase) => testCase.projectName)),
        iterations: uniqueValues(matchingCases.map((testCase) => testCase.iteration)),
      });
    },

    async listTestCases(query: TestCaseQuery = {}) {
      const keyword = query.keyword?.trim().toLowerCase();
      const rows = testCases.filter((testCase) => {
        const matchesKeyword =
          !keyword ||
          testCase.name.toLowerCase().includes(keyword) ||
          testCase.id.toLowerCase().includes(keyword) ||
          testCase.endpoint?.toLowerCase().includes(keyword);

        return (
          matchesKeyword &&
          (!query.type || testCase.type === query.type) &&
          (!query.moduleId || testCase.moduleId === query.moduleId) &&
          (!query.priority || testCase.priority === query.priority) &&
          (!query.status || testCase.status === query.status) &&
          (!query.projectName || testCase.projectName === query.projectName) &&
          (!query.iteration || testCase.iteration === query.iteration) &&
          (query.isSmoke === undefined || testCase.isSmoke === query.isSmoke)
        );
      });
      return respond(rows.map((testCase) => addModuleName(testCase, modules)));
    },

    async listTestCasesPage(query: TestCaseQuery = {}, page = 1, pageSize = 20): Promise<PaginatedResult<TestCaseRecord>> {
      const rows = await this.listTestCases(query);
      const start = (page - 1) * pageSize;
      return respond({
        items: rows.slice(start, start + pageSize),
        page,
        pageSize,
        total: rows.length,
      });
    },

    async createTestCase(input: CreateTestCaseInput) {
      const author = users.find((item, index) => {
        const numericId = Number.isFinite(Number(item.id)) ? Number(item.id) : index + 1;
        return numericId === (input.authorId ?? 1);
      });
      const created: TestCaseRecord = {
        ...input,
        storageId: storageIdSequence++,
        id: `${input.type.toUpperCase()}-${caseSequence++}`,
        creator: author?.name ?? '江珊',
        maintainer: author?.name ?? '江珊',
        updatedAt: '刚刚',
      };
      testCases = [created, ...testCases];
      return respond(addModuleName(created, modules));
    },

    async updateTestCase(storageId: number, input: UpdateTestCaseInput) {
      const existing = testCases.find((testCase) => testCase.storageId === storageId);
      if (!existing) throw new Error('测试用例不存在');

      const { endpoint, method, expectedStatus, ...commonInput } = input;
      const updated: TestCaseRecord = {
        ...existing,
        ...commonInput,
        ...(endpoint === undefined ? {} : { endpoint }),
        ...(method === undefined ? {} : { method }),
        ...(expectedStatus === undefined ? {} : { expectedStatus }),
        updatedAt: '刚刚',
      };
      testCases = testCases.map((testCase) => (testCase.storageId === storageId ? updated : testCase));
      return respond(addModuleName(updated, modules));
    },

    async deleteTestCase(storageId: number) {
      if (!testCases.some((testCase) => testCase.storageId === storageId)) {
        throw new Error('测试用例不存在');
      }
      testCases = testCases.filter((testCase) => testCase.storageId !== storageId);
      await respond(undefined);
    },

    async importTestCases(file: File, moduleId?: string) {
      const { read, utils } = await import('xlsx');
      const extension = file.name.toLowerCase().split('.').pop();
      const workbook = extension === 'csv'
        ? read(await file.text(), { type: 'string' })
        : read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const values = utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
      const expectedHeaders = [
        '用例目录', '用例名称', '需求ID', '前置条件', '用例步骤', '预期结果',
        '用例类型', '用例状态', '用例等级', '创建人', '归属迭代', '是否冒烟', '项目归属',
      ];
      const headers = values[0]?.map((value) => String(value).trim()) ?? [];
      if (headers.length !== expectedHeaders.length || headers.some((value, index) => value !== expectedHeaders[index])) {
        throw new Error('功能用例导入表头不一致，请使用标准模板');
      }
      const moduleIds: Record<string, string> = {
        鉴权: 'auth',
        支付: 'payments',
        用户资料: 'profile',
      };
      const dataRows = values.slice(1).filter((row) => row.some((value) => String(value).trim()));
      if (!dataRows.length) throw new Error('导入文件没有数据行');
      const created = dataRows.map((row) => {
        const moduleValue = String(row[0] ?? '').trim();
        const typeValue = normalizeValue(String(row[6] ?? '').trim(), typeAliases);
        if (typeValue !== 'functional') {
          throw new Error(`仅支持导入功能用例：${String(row[1] ?? '')}`);
        }
        const record: TestCaseRecord = {
          storageId: storageIdSequence++,
          id: `FUN-${caseSequence++}`,
          type: 'functional',
          moduleId: moduleId ?? moduleIds[moduleValue] ?? moduleValue,
          name: String(row[1] ?? '').trim(),
          requirementId: String(row[2] ?? '').trim() || undefined,
          precondition: String(row[3] ?? '').trim(),
          steps: String(row[4] ?? '').trim(),
          expectedResult: String(row[5] ?? '').trim(),
          status: normalizeValue(String(row[7] ?? '').trim() || '草稿', statusAliases),
          priority: normalizeValue(String(row[8] ?? '').trim() || 'P1', priorityAliases),
          creator: String(row[9] ?? '').trim() || '江珊',
          maintainer: String(row[9] ?? '').trim() || '江珊',
          iteration: String(row[10] ?? '').trim(),
          isSmoke: ['是', 'true', '1', 'yes'].includes(String(row[11] ?? '').trim().toLowerCase()),
          projectName: String(row[12] ?? '').trim() || '测试平台',
          updatedAt: '刚刚',
        };
        return record;
      });
      testCases = [...created, ...testCases];
      return respond({ importedCount: created.length, codes: created.map((item) => item.id) });
    },

    async listUsers() {
      return respond(users);
    },

    async addUser(input: CreateUserInput) {
      const created: UserRecord = {
        id: `USR-${userSequence++}`,
        name: input.name,
        email: input.email,
        department: input.department,
        role: input.role,
        enabled: true,
      };
      users = [created, ...users];
      return respond(created);
    },

    async setUserEnabled(id: string, enabled: boolean) {
      users = users.map((user) => (user.id === id ? { ...user, enabled } : user));
      await respond(undefined);
    },

    async listRoles() {
      return respond(roles);
    },

    async updateRolePermissions(id, permissions) {
      const existing = roles.find((role) => role.id === id);
      if (!existing) throw new Error('角色不存在');

      const updated = { ...existing, permissions: copy(permissions) };
      roles = roles.map((role) => (role.id === id ? updated : role));
      return respond(updated);
    },

    async getSystemSettings() {
      return respond(systemSettings);
    },

    async updateSystemSettings(settings) {
      systemSettings = copy(settings);
      return respond(systemSettings);
    },

    async testWebhookConnection({ webhookUrl }) {
      return respond({
        success: true,
        message: `已成功连接 ${new URL(webhookUrl).host}`,
      });
    },

    async startUiExecution(input: UiExecutionInput) {
      const executionId = `ui_exec_demo_${String(executionSequence++).padStart(3, '0')}`;
      const selectedCases = input.suiteIds.map((suiteId) => {
        const testCase = testCases.find((item) => item.storageId === suiteId && item.type === 'ui');
        if (!testCase) throw new Error('UI 自动化用例不存在');
        return testCase;
      });
      uiExecutions.set(executionId, {
        executionId,
        status: 'RUNNING',
        summary: {
          total: selectedCases.length,
          passed: 0,
          failed: 0,
          running: 0,
          pending: selectedCases.length,
          durationMs: 0,
        },
        cases: selectedCases.map((testCase) => ({
          caseId: testCase.storageId!,
          caseName: testCase.name,
          browser: input.browser,
          status: 'PENDING',
          durationMs: 0,
          steps: [],
          logs: ['测试用例已加入执行队列'],
          screenshotUrl: null,
          videoUrl: null,
        })),
      });
      return respond({ executionId, status: 'RUNNING' as const, startTime: new Date().toISOString() });
    },

    async getUiExecution(executionId: string) {
      const execution = uiExecutions.get(executionId);
      if (!execution) throw new Error('执行任务不存在');
      return respond(execution);
    },

    async stopUiExecution(executionId: string) {
      const execution = uiExecutions.get(executionId);
      if (!execution) throw new Error('执行任务不存在');
      execution.status = 'CANCELLED';
      execution.cases = execution.cases.map((item) =>
        item.status === 'PENDING' || item.status === 'RUNNING'
          ? { ...item, status: 'SKIPPED' }
          : item,
      );
      execution.summary.pending = 0;
      await respond(undefined);
    },

    async startApiExecution(input: ApiExecutionInput) {
      const executionId = `api_exec_demo_${String(executionSequence++).padStart(3, '0')}`;
      const selectedCases = input.suiteIds.map((suiteId) => {
        const testCase = testCases.find((item) => item.storageId === suiteId && item.type === 'api');
        if (!testCase) throw new Error('接口自动化用例不存在');
        return testCase;
      });
      apiExecutions.set(executionId, {
        executionId,
        status: 'RUNNING',
        summary: {
          totalApi: selectedCases.length,
          passedApi: 0,
          failedApi: 0,
          pendingApi: selectedCases.length,
          avgResponseTimeMs: 0,
        },
        results: selectedCases.map((testCase) => ({
          apiId: testCase.storageId!,
          name: testCase.name,
          method: testCase.method ?? 'GET',
          url: testCase.endpoint ?? '',
          responseCode: null,
          responseTimeMs: 0,
          status: 'PENDING',
          requestData: { headers: input.globalHeaders, body: null },
          responseData: null,
          assertions: [],
        })),
      });
      return respond({ executionId, status: 'RUNNING' as const });
    },

    async getApiExecutionReport(executionId: string) {
      const execution = apiExecutions.get(executionId);
      if (!execution) throw new Error('执行任务不存在');
      return respond(execution);
    },

    async stopApiExecution(executionId: string) {
      const execution = apiExecutions.get(executionId);
      if (!execution) throw new Error('执行任务不存在');
      execution.status = 'CANCELLED';
      execution.results = execution.results.map((item) =>
        item.status === 'PENDING' || item.status === 'RUNNING'
          ? { ...item, status: 'SKIPPED' }
          : item,
      );
      execution.summary.pendingApi = 0;
      await respond(undefined);
    },

    async generateXMind(file: File, uploaderId = 1): Promise<XMindGenerationResult> {
      const cases: XMindGeneratedCase[] = Array.from({ length: 6 }, (_, index) => ({
        用例目录: '核心模块/鉴权',
        用例名称: index % 2 === 0 ? `登录正向场景 ${index + 1}` : `登录异常场景 ${index + 1}`,
        需求ID: '',
        前置条件: '测试账号已准备',
        用例类型: '功能测试',
        用例状态: '草稿',
        用例等级: index === 0 ? 'P1' : 'P2',
        创建人: users.find((user) => Number(user.id) === uploaderId)?.name ?? '江珊',
        归属迭代: '',
        用例步骤: `1. 执行登录场景 ${index + 1}`,
        预期结果: `1. 系统正确处理登录场景 ${index + 1}`,
      }));
      const task: XMindTaskDetail = {
        id: xmindTaskSequence++,
        fileName: file.name,
        fileUrl: '/uploads/mock.xmind',
        uploaderId,
        uploaderName: users.find((user) => Number(user.id) === uploaderId)?.name ?? '江珊',
        status: 'PENDING',
        parsedCasesCount: 0,
        attempts: 0,
        availableAt: new Date().toISOString(),
        lockedAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        tree: [
          {
            title: '登录',
            children: [
              { title: '成功登录', children: [] },
              { title: '登录失败', children: [] },
            ],
          },
        ],
        cases: [],
        moduleMapping: {},
      };
      task.cases = cases;
      xmindTasks = [task, ...xmindTasks];
      return respond({ ...task, cases: [], parsedCasesCount: 0 });
    },

    async listXMindTasks(page = 1, pageSize = 20, status?: XMindTaskStatus) {
      const matching = xmindTasks.filter((task) => !status || task.status === status);
      const start = (page - 1) * pageSize;
      return respond({
        items: matching.slice(start, start + pageSize).map(({ tree, cases, moduleMapping, ...record }) => record),
        page,
        pageSize,
        total: matching.length,
      });
    },

    async getXMindTask(taskId: number) {
      const task = xmindTasks.find((item) => item.id === taskId);
      if (!task) throw new Error('XMind 生成任务不存在');
      if (task.status === 'PENDING' || task.status === 'RUNNING') {
        task.status = 'WAITING_REVIEW';
        task.attempts = Math.max(1, task.attempts);
        task.parsedCasesCount = task.cases.length;
      }
      return respond(task);
    },

    async retryXMindTask(taskId: number) {
      const task = xmindTasks.find((item) => item.id === taskId);
      if (!task) throw new Error('XMind 生成任务不存在');
      if (task.status !== 'FAILED') throw new Error('只有失败的 XMind 任务可以重试');
      task.status = 'PENDING';
      task.lastError = null;
      task.parsedCasesCount = 0;
      return respond(task);
    },

    async confirmXMind(input: XMindConfirmInput): Promise<XMindConfirmResult> {
      const resolvedCases = input.cases.map((item) => {
        const moduleId = input.moduleMapping[item.用例目录];
        if (!moduleId || !findModuleById(modules, moduleId)) {
          throw new Error(`模块映射不存在：${item.用例目录}`);
        }
        return { item, moduleId };
      });
      const author = users.find((user) => Number(user.id) === input.uploaderId);
      const createdCases = resolvedCases.map(({ item, moduleId }, index) => {
        const created: TestCaseRecord = {
          storageId: storageIdSequence + index,
          id: `FUN-${caseSequence + index}`,
          type: 'functional',
          moduleId,
          name: item.用例名称,
          priority: item.用例等级,
          status: '草稿',
          maintainer: author?.name ?? '江珊',
          creator: author?.name ?? '江珊',
          updatedAt: '刚刚',
          requirementId: item.需求ID || undefined,
          precondition: item.前置条件,
          steps: item.用例步骤,
          expectedResult: item.预期结果,
          iteration: item.归属迭代,
          projectName: '测试平台',
          isSmoke: false,
        };
        return created;
      });
      storageIdSequence += createdCases.length;
      caseSequence += createdCases.length;
      testCases = [...createdCases, ...testCases];
      return respond({
        saved_cases: createdCases.map((created) => ({
          id: created.storageId,
          code: created.id,
          title: created.name,
          module_id: created.moduleId,
        })),
      });
    },

    async confirmXMindTask(taskId: number, input: { moduleMapping: Record<string, string> }) {
      const task = xmindTasks.find((item) => item.id === taskId);
      if (!task) throw new Error('XMind 生成任务不存在');
      if (task.status !== 'WAITING_REVIEW') throw new Error('XMind 任务尚未准备好审核');
      const result = await this.confirmXMind({
        uploaderId: task.uploaderId,
        moduleMapping: input.moduleMapping,
        cases: task.cases,
      });
      task.moduleMapping = { ...input.moduleMapping };
      task.status = 'COMPLETED';
      return result;
    },

    async exportXMind(cases: XMindGeneratedCase[]): Promise<Blob> {
      const { utils, write } = await import('xlsx');
      const headers = [
        '用例目录', '用例名称', '需求ID', '前置条件', '用例类型', '用例状态',
        '用例等级', '创建人', '归属迭代', '用例步骤', '预期结果',
      ];
      const workbook = utils.book_new();
      const sheet = utils.json_to_sheet(cases, { header: headers });
      utils.book_append_sheet(workbook, sheet, 'XMind Generated Cases');
      const output = write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      return new Blob([output], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    },

    async debugApiCase(input: ApiDebugInput) {
      const statusAssertion = input.assertions.find((assertion) => assertion.type === 'statusCode');
      const statusCode = Number(statusAssertion?.expected || input.expectedCode);
      const assertions = input.assertions.map((assertion) => ({
        type: assertion.type,
        expression:
          assertion.type === 'statusCode'
            ? 'response.status'
            : assertion.type === 'responseTime'
              ? 'response.time_ms'
              : assertion.target,
        expected: assertion.expected,
        actual:
          assertion.type === 'statusCode'
            ? String(statusCode)
            : assertion.type === 'responseTime'
              ? '36'
              : assertion.expected,
        passed: true,
      }));
      return respond({
        success: true,
        requestData: {
          method: input.method,
          url: input.url,
          headers: input.headers,
          body: input.bodyType === 'json' && input.bodyContent
            ? JSON.parse(input.bodyContent)
            : null,
        },
        statusCode,
        responseTimeMs: 36,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: {
          code: 0,
          message: 'success',
          data: { requestId: 'debug-request-001' },
        },
        assertions,
        extracts: Object.fromEntries(
          input.extracts.map((item) => [item.name, `mock:${item.jsonPath}`]),
        ),
      });
    },

    async debugUiCase(input: UiDebugInput) {
      return respond({
        success: true,
        status: 'PASSED' as const,
        durationMs: input.steps.length * 24,
        stepResults: input.steps.map((step) => ({
          stepIndex: step.stepIndex,
          action: step.action,
          status: 'PASSED' as const,
          durationMs: 24,
        })),
        logs: input.steps.map((step) => `步骤 ${step.stepIndex} 执行成功`),
        screenshotUrl: null,
        videoUrl: '/uploads/executions/debug-demo.webm',
        errorMessage: null,
      });
    },
  };
}
