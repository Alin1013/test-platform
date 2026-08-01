import { initialRoles, initialTestCases, initialUsers } from '../mocks/fixtures';
import type {
  CreateTestCaseInput,
  CreateUserInput,
  SystemSettings,
  PlatformService,
  TestCaseQuery,
  TestCaseRecord,
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
  let caseSequence = 260000;
  let userSequence = 2000;
  let systemSettings: SystemSettings = {
    general: {
      platformName: '测试平台',
      announcement: '',
      caseNumberPrefix: 'TC-',
    },
    execution: {
      baseUrl: 'https://test-api.example.com',
      retryCount: 1,
      apiTimeoutMs: 30000,
    },
    notifications: {
      wechatWork: '',
      feishu: '',
      dingtalk: '',
    },
    ai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4.1-mini',
    },
  };

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
        id: `${input.type.toUpperCase()}-${caseSequence++}`,
        creator: '江珊',
        maintainer: '江珊',
        updatedAt: '刚刚',
      };
      testCases = [created, ...testCases];
      return respond(created);
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
      return respond(initialRoles);
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
  };
}
