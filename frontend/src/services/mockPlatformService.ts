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
  CreateUserInput,
  SystemSettings,
  PlatformService,
  TestCaseQuery,
  TestCaseRecord,
  UpdateTestCaseInput,
  UiExecutionInput,
  UiExecutionResult,
  UiDebugInput,
  UserRecord,
} from './contracts';

interface MockServiceOptions {
  delay?: number;
}

const copy = <T,>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

export function createMockPlatformService({ delay = 120 }: MockServiceOptions = {}): PlatformService {
  let testCases = copy(initialTestCases);
  let users = copy(initialUsers);
  let roles = copy(initialRoles);
  let caseSequence = 260000;
  let storageIdSequence = Math.max(...testCases.map((testCase) => testCase.storageId)) + 1;
  let userSequence = 2000;
  let systemSettings = copy(initialSystemSettings);
  let executionSequence = 1;
  const uiExecutions = new Map<string, UiExecutionResult>();
  const apiExecutions = new Map<string, ApiExecutionReport>();

  const respond = async <T,>(value: T): Promise<T> => {
    if (delay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
    return copy(value);
  };

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
        recentCases: testCases.slice(0, 6),
      });
    },

    async listTestModules(projectId?: number) {
      return respond(
        projectId === undefined
          ? initialTestModules
          : initialTestModules.filter((module) => module.projectId === projectId),
      );
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
          (!query.status || testCase.status === query.status)
        );
      });
      return respond(rows);
    },

    async createTestCase(input: CreateTestCaseInput) {
      const created: TestCaseRecord = {
        ...input,
        storageId: storageIdSequence++,
        id: `${input.type.toUpperCase()}-${caseSequence++}`,
        creator: '江珊',
        maintainer: '江珊',
        updatedAt: '刚刚',
      };
      testCases = [created, ...testCases];
      return respond(created);
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
      return respond(updated);
    },

    async deleteTestCase(storageId: number) {
      if (!testCases.some((testCase) => testCase.storageId === storageId)) {
        throw new Error('测试用例不存在');
      }
      testCases = testCases.filter((testCase) => testCase.storageId !== storageId);
      await respond(undefined);
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
