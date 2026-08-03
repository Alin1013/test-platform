import type {
  CreateTestCaseInput,
  CreateUserInput,
  DashboardData,
  PermissionRole,
  PlatformService,
  SystemSettings,
  TestCaseQuery,
  TestCaseRecord,
  TestCaseStatus,
  TestCaseType,
  UserRecord,
} from './contracts';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ApiPlatformServiceOptions {
  baseUrl: string;
  fetcher?: Fetcher;
}

interface Page<T> {
  items: T[];
  total: number;
}

interface ApiCaseDetails {
  url: string;
  method: TestCaseRecord['method'];
  expected_code: number;
}

interface ApiTestCase {
  id: number;
  code: string;
  title: string;
  type: TestCaseType;
  module_id: string;
  priority: TestCaseRecord['priority'];
  status: TestCaseStatus;
  author_name: string;
  updated_at: string;
  api_details?: ApiCaseDetails | null;
}

interface ApiUser {
  id: number;
  name: string;
  email: string;
  department: string;
  role: UserRecord['role'];
  enabled: boolean;
}

type ApiRole = Omit<PermissionRole, 'id'> & {
  id: number;
};

function mapCase(testCase: ApiTestCase): TestCaseRecord {
  // 传输层使用蛇形字段，页面层继续消费既有的驼峰领域对象。
  const updatedDate = new Date(testCase.updated_at);
  return {
    id: testCase.code,
    type: testCase.type,
    moduleId: testCase.module_id,
    name: testCase.title,
    priority: testCase.priority,
    status: testCase.status,
    maintainer: testCase.author_name,
    creator: testCase.author_name,
    updatedAt: Number.isNaN(updatedDate.valueOf())
      ? testCase.updated_at
      : updatedDate.toLocaleString('zh-CN'),
    endpoint: testCase.api_details?.url,
    method: testCase.api_details?.method,
    expectedStatus: testCase.api_details?.expected_code,
  };
}

function mapUser(user: ApiUser): UserRecord {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    department: user.department,
    role: user.role,
    enabled: user.enabled,
  };
}

function mapRole(role: ApiRole): PermissionRole {
  return {
    id: String(role.id),
    name: role.name,
    permissions: role.permissions,
  };
}

export function createApiPlatformService({
  baseUrl,
  fetcher = globalThis.fetch.bind(globalThis),
}: ApiPlatformServiceOptions): PlatformService {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  const request = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetcher(`${normalizedBaseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      // FastAPI 的 detail 既可能是文本，也可能是结构化校验错误，统一转换为异常消息。
      const errorBody = (await response.json().catch(() => null)) as { detail?: unknown } | null;
      const detail =
        typeof errorBody?.detail === 'string'
          ? errorBody.detail
          : errorBody?.detail
            ? JSON.stringify(errorBody.detail)
            : `HTTP ${response.status}`;
      throw new Error(detail);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };

  return {
    async getDashboard(): Promise<DashboardData> {
      const [stats, recent] = await Promise.all([
        request<Record<TestCaseType, number> & { total: number }>('/dashboard/stats'),
        request<Page<ApiTestCase>>('/dashboard/recent-cases?page_size=6'),
      ]);
      return {
        counts: {
          functional: stats.functional,
          api: stats.api,
          ui: stats.ui,
        },
        total: stats.total,
        recentCases: recent.items.map(mapCase),
      };
    },

    async listTestCases(query: TestCaseQuery = {}) {
      const params = new URLSearchParams({ page_size: '100' });
      if (query.type) params.set('type', query.type);
      if (query.moduleId) params.set('module_id', query.moduleId);
      if (query.keyword) params.set('keyword', query.keyword);
      if (query.priority) params.set('priority', query.priority);
      if (query.status) params.set('status', query.status);
      const page = await request<Page<ApiTestCase>>(`/test-cases?${params}`);
      return page.items.map(mapCase);
    },

    async createTestCase(input: CreateTestCaseInput) {
      const apiDetails =
        input.type === 'api'
          ? {
              url: input.endpoint,
              method: input.method ?? 'POST',
              expected_code: input.expectedStatus ?? 200,
              headers: {},
            }
          : undefined;
      const created = await request<ApiTestCase>('/test-cases', {
        method: 'POST',
        body: JSON.stringify({
          title: input.name,
          type: input.type,
          module_id: input.moduleId,
          priority: input.priority,
          status: input.status,
          author_id: 1,
          api_details: apiDetails,
          ui_details: input.type === 'ui' ? { steps: [] } : undefined,
        }),
      });
      return mapCase(created);
    },

    async listUsers() {
      const page = await request<Page<ApiUser>>('/users?page_size=100');
      return page.items.map(mapUser);
    },

    async addUser(input: CreateUserInput) {
      const user = await request<ApiUser>('/users', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return mapUser(user);
    },

    async setUserEnabled(id: string, enabled: boolean) {
      await request(`/users/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: enabled ? 'enabled' : 'disabled' }),
      });
    },

    async listRoles() {
      const roles = await request<ApiRole[]>('/roles');
      return roles.map(mapRole);
    },

    async updateRolePermissions(id, permissions) {
      const role = await request<ApiRole>(`/roles/${encodeURIComponent(id)}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      });
      return mapRole(role);
    },

    async getSystemSettings() {
      return request<SystemSettings>('/settings');
    },

    async updateSystemSettings(settings: SystemSettings) {
      return request<SystemSettings>('/settings', {
        method: 'POST',
        body: JSON.stringify(settings),
      });
    },

    async testWebhookConnection(input) {
      return request('/settings/test-webhook', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
  };
}
