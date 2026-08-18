/**
 * 真实后端 API 适配器：实现 PlatformService 契约，负责请求封装、错误归一化与字段映射。
 */
import type {
  CreateTestCaseInput,
  CreateTestModuleInput,
  CreateUserInput,
  ApiDebugInput,
  ApiDebugResult,
  ApiExecutionInput,
  ApiExecutionReport,
  DashboardData,
  ExecutionStart,
  PermissionRole,
  PlatformService,
  SystemSettings,
  TestCaseQuery,
  TestCaseImportResult,
  TestCaseRecord,
  TestCaseStatus,
  TestCaseType,
  TestModule,
  UpdateTestModuleInput,
  UiExecutionInput,
  UiExecutionResult,
  UiDebugInput,
  UiDebugResult,
  UpdateTestCaseInput,
  UserRecord,
  XMindConfirmInput,
  XMindConfirmResult,
  XMindGeneratedCase,
  XMindTreeNode,
  XMindTaskConfirmInput,
  XMindTaskDetail,
  XMindTaskRecord,
  XMindTaskStatus,
} from './contracts';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ApiPlatformServiceOptions {
  baseUrl: string;
  fetcher?: Fetcher;
}

// Same-origin is safe for production deployments; Vite proxies this path locally.
// Split deployments can override it with VITE_API_BASE_URL.
export const DEFAULT_PLATFORM_API_BASE_URL = '/api/v1';

interface Page<T> {
  /** 后端分页响应结构。 */
  items: T[];
  total: number;
}

interface ApiCaseDetails {
  url: string;
  method: TestCaseRecord['method'];
  expected_code: number;
  headers?: Record<string, string>;
  request_body?: unknown;
  expected_response?: {
    automation_config?: {
      version: 1;
      query_params: NonNullable<TestCaseRecord['apiDetails']>['queryParams'];
      body_type: NonNullable<TestCaseRecord['apiDetails']>['bodyType'];
      body_fields: NonNullable<TestCaseRecord['apiDetails']>['bodyFields'];
      assertions: NonNullable<TestCaseRecord['apiDetails']>['assertions'];
      extracts: NonNullable<TestCaseRecord['apiDetails']>['extracts'];
    };
  } | null;
}

interface ApiUiCaseDetails {
  description: string;
  dependency_case_id?: number | null;
  browser: NonNullable<TestCaseRecord['uiDetails']>['browser'];
  environment: NonNullable<TestCaseRecord['uiDetails']>['environment'];
  timeout_seconds: number;
  retry_count: number;
  steps: NonNullable<TestCaseRecord['uiDetails']>['steps'];
}

interface ApiTestCase {
  id: number;
  code: string;
  title: string;
  type: TestCaseType;
  module_id: string;
  module_name?: string;
  priority: TestCaseRecord['priority'];
  status: TestCaseStatus;
  author_name: string;
  updated_at: string;
  requirement_id?: string | null;
  precondition?: string;
  test_steps?: string;
  expected_result?: string;
  iteration?: string;
  is_smoke?: boolean;
  project_name?: string;
  api_details?: ApiCaseDetails | null;
  ui_details?: ApiUiCaseDetails | null;
}

interface ApiTestModule {
  id: string;
  name: string;
  parent_id?: string | null;
  project_id: number;
  children: ApiTestModule[];
}

interface ApiTestCaseFilterOptions {
  project_names: string[];
  iterations: string[];
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

interface ApiEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

interface ApiPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

interface ApiXMindTaskRecord {
  id: number;
  file_name: string;
  file_url: string;
  uploader_id: number;
  uploader_name: string;
  status: XMindTaskStatus;
  parsed_cases_count: number;
  attempts: number;
  available_at: string;
  locked_at?: string | null;
  last_error?: string | null;
  created_at: string;
}

interface ApiXMindTaskDetail extends ApiXMindTaskRecord {
  tree: XMindTreeNode[];
  cases: XMindGeneratedCase[];
  module_mapping: Record<string, string>;
}

function mapCase(testCase: ApiTestCase): TestCaseRecord {
  // 后端 snake_case 字段映射为前端 camelCase 用例结构。
  // 传输层使用蛇形字段，页面层继续消费既有的驼峰领域对象。
  const updatedDate = new Date(testCase.updated_at);
  return {
    storageId: testCase.id,
    id: testCase.code,
    type: testCase.type,
    moduleId: testCase.module_id,
    moduleName: testCase.module_name,
    name: testCase.title,
    priority: testCase.priority,
    status: testCase.status,
    maintainer: testCase.author_name,
    creator: testCase.author_name,
    requirementId: testCase.requirement_id ?? undefined,
    precondition: testCase.precondition,
    steps: testCase.test_steps,
    expectedResult: testCase.expected_result,
    iteration: testCase.iteration,
    isSmoke: testCase.is_smoke,
    projectName: testCase.project_name,
    updatedAt: Number.isNaN(updatedDate.valueOf())
      ? testCase.updated_at
      : updatedDate.toLocaleString('zh-CN'),
    endpoint: testCase.api_details?.url,
    method: testCase.api_details?.method,
    expectedStatus: testCase.api_details?.expected_code,
    apiDetails: testCase.api_details
      ? {
          headers: Object.entries(testCase.api_details.headers ?? {}).map(([key, value]) => ({
            enabled: true,
            key,
            value,
          })),
          queryParams:
            testCase.api_details.expected_response?.automation_config?.query_params ?? [],
          bodyType:
            testCase.api_details.expected_response?.automation_config?.body_type ??
            (testCase.api_details.request_body == null ? 'none' : 'json'),
          bodyContent:
            testCase.api_details.request_body == null
              ? ''
              : JSON.stringify(testCase.api_details.request_body, null, 2),
          bodyFields:
            testCase.api_details.expected_response?.automation_config?.body_fields ?? [],
          assertions:
            testCase.api_details.expected_response?.automation_config?.assertions ?? [
              {
                type: 'statusCode',
                target: '',
                comparison: 'equals',
                expected: String(testCase.api_details.expected_code),
              },
            ],
          extracts: testCase.api_details.expected_response?.automation_config?.extracts ?? [],
        }
      : undefined,
    uiDetails: testCase.ui_details
      ? {
          description: testCase.ui_details.description,
          dependencyCaseId: testCase.ui_details.dependency_case_id ?? undefined,
          browser: testCase.ui_details.browser,
          environment: testCase.ui_details.environment,
          timeoutSeconds: testCase.ui_details.timeout_seconds,
          retryCount: testCase.ui_details.retry_count,
          steps: testCase.ui_details.steps,
        }
      : undefined,
  };
}

function mapXMindTaskRecord(record: ApiXMindTaskRecord): XMindTaskRecord {
  // 后端 XMind 任务记录字段映射。
  return {
    id: record.id,
    fileName: record.file_name,
    fileUrl: record.file_url,
    uploaderId: record.uploader_id,
    uploaderName: record.uploader_name,
    status: record.status,
    parsedCasesCount: record.parsed_cases_count,
    attempts: record.attempts,
    availableAt: record.available_at,
    lockedAt: record.locked_at ?? null,
    lastError: record.last_error ?? null,
    createdAt: record.created_at,
  };
}

function mapXMindTaskDetail(record: ApiXMindTaskDetail): XMindTaskDetail {
  return {
    ...mapXMindTaskRecord(record),
    tree: record.tree,
    cases: record.cases,
    moduleMapping: record.module_mapping ?? {},
  };
}

function mapUser(user: ApiUser): UserRecord {
  // 后端用户字段映射（id 转字符串）。
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    department: user.department,
    role: user.role,
    enabled: user.enabled,
  };
}

function mapModule(module: ApiTestModule): TestModule {
  // 后端模块字段映射，递归转换子模块。
  return {
    id: module.id,
    name: module.name,
    projectId: module.project_id,
    ...(module.parent_id ? { parentId: module.parent_id } : {}),
    children: module.children.map(mapModule),
  };
}

function mapUiDetailsToApi(uiDetails: NonNullable<CreateTestCaseInput['uiDetails']>): ApiUiCaseDetails {
  // 前端 UI 详情转后端 snake_case 结构。
  return {
    description: uiDetails.description,
    dependency_case_id: uiDetails.dependencyCaseId,
    browser: uiDetails.browser,
    environment: uiDetails.environment,
    timeout_seconds: uiDetails.timeoutSeconds,
    retry_count: uiDetails.retryCount,
    steps: uiDetails.steps,
  };
}

function mapRole(role: ApiRole): PermissionRole {
  return {
    id: String(role.id),
    name: role.name,
    permissions: role.permissions,
  };
}

function mapApiDetailsInput(input: CreateTestCaseInput | UpdateTestCaseInput) {
  // 前端 API 详情转后端兼容结构（含旧版 automation_config）。
  if (!input.endpoint) return undefined;
  const enabledHeaders = input.apiDetails?.headers.filter((item) => item.enabled && item.key.trim());
  const requestBody = (() => {
    if (input.apiDetails?.bodyType === 'none') return null;
    if (!input.apiDetails) return undefined;
    if (input.apiDetails.bodyType === 'json') {
      return input.apiDetails.bodyContent.trim()
        ? (JSON.parse(input.apiDetails.bodyContent) as unknown)
        : null;
    }
    return Object.fromEntries(
      input.apiDetails.bodyFields
        .filter((item) => item.enabled && item.key.trim())
        .map((item) => [item.key.trim(), item.value]),
    );
  })();

  return {
    url: input.endpoint,
    method: input.method ?? 'POST',
    expected_code: input.expectedStatus ?? 200,
    ...(input.apiDetails
      ? {
          headers: Object.fromEntries(
            (enabledHeaders ?? []).map((item) => [item.key.trim(), item.value]),
          ),
          request_body: requestBody,
          expected_response: {
            automation_config: {
              version: 1 as const,
              query_params: input.apiDetails.queryParams,
              body_type: input.apiDetails.bodyType,
              body_fields: input.apiDetails.bodyFields,
              assertions: input.apiDetails.assertions,
              extracts: input.apiDetails.extracts,
            },
          },
        }
      : {}),
  };
}

export function createApiPlatformService({
  baseUrl,
  fetcher = globalThis.fetch.bind(globalThis),
}: ApiPlatformServiceOptions): PlatformService {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const resolveArtifactUrl = (url: string | null) => {
    // 相对产物地址（截图/视频）解析为可访问的绝对地址。
    if (!url) return url;
    if (/^https?:\/\//.test(url)) return url;
    if (/^https?:\/\//.test(normalizedBaseUrl)) return new URL(url, normalizedBaseUrl).toString();
    if (globalThis.location?.origin) {
      return new URL(url, globalThis.location.origin).toString();
    }
    return url;
  };

  const request = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    // 统一 JSON 请求封装：自动设置 Content-Type、解析错误并抛出异常。
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

  const download = async (path: string, init: RequestInit): Promise<Blob> => {
    // 下载类请求：返回 Blob，错误处理与 request 一致。
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetcher(`${normalizedBaseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { detail?: unknown } | null;
      const detail =
        typeof errorBody?.detail === 'string'
          ? errorBody.detail
          : errorBody?.detail
            ? JSON.stringify(errorBody.detail)
            : `HTTP ${response.status}`;
      throw new Error(detail);
    }
    return response.blob();
  };

  return {
    async getDashboard(): Promise<DashboardData> {
      // 仪表盘：并发请求统计与最近用例。
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

    async listTestModules(projectId?: number) {
      const path = projectId === undefined
        ? '/modules'
        : `/modules?project_id=${encodeURIComponent(projectId)}`;
      const modules = await request<ApiTestModule[]>(path);
      return modules.map(mapModule);
    },

    async createTestModule(input: CreateTestModuleInput) {
      const module = await request<ApiTestModule>('/modules', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          parent_id: input.parentId,
          project_id: input.projectId ?? 1,
        }),
      });
      return mapModule(module);
    },

    async updateTestModule(moduleId: string, input: UpdateTestModuleInput) {
      const module = await request<ApiTestModule>(`/modules/${encodeURIComponent(moduleId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: input.name }),
      });
      return mapModule(module);
    },

    async deleteTestModule(moduleId: string) {
      await request(`/modules/${encodeURIComponent(moduleId)}`, { method: 'DELETE' });
    },

    async getTestCaseFilterOptions(type?: TestCaseType) {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      const suffix = params.size ? `?${params}` : '';
      const options = await request<ApiTestCaseFilterOptions>(
        `/test-cases/filter-options${suffix}`,
      );
      return {
        projectNames: options.project_names,
        iterations: options.iterations,
      };
    },

    async listTestCases(query: TestCaseQuery = {}) {
      const params = new URLSearchParams({ page_size: '100' });
      if (query.type) params.set('type', query.type);
      if (query.moduleId) params.set('module_id', query.moduleId);
      if (query.keyword) params.set('keyword', query.keyword);
      if (query.priority) params.set('priority', query.priority);
      if (query.status) params.set('status', query.status);
      if (query.projectName) params.set('project_name', query.projectName);
      if (query.iteration) params.set('iteration', query.iteration);
      if (query.isSmoke !== undefined) params.set('is_smoke', String(query.isSmoke));
      const page = await request<Page<ApiTestCase>>(`/test-cases?${params}`);
      return page.items.map(mapCase);
    },

    async listTestCasesPage(query: TestCaseQuery = {}, page = 1, pageSize = 20) {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (query.type) params.set('type', query.type);
      if (query.moduleId) params.set('module_id', query.moduleId);
      if (query.keyword) params.set('keyword', query.keyword);
      if (query.priority) params.set('priority', query.priority);
      if (query.status) params.set('status', query.status);
      if (query.projectName) params.set('project_name', query.projectName);
      if (query.iteration) params.set('iteration', query.iteration);
      if (query.isSmoke !== undefined) params.set('is_smoke', String(query.isSmoke));
      const response = await request<ApiPaginatedResponse<ApiTestCase>>(`/test-cases?${params}`);
      return {
        items: response.items.map(mapCase),
        page: response.page,
        pageSize: response.page_size,
        total: response.total,
      };
    },

    async createTestCase(input: CreateTestCaseInput) {
      const apiDetails =
        input.type === 'api' ? mapApiDetailsInput(input) : undefined;
      const created = await request<ApiTestCase>('/test-cases', {
        method: 'POST',
        body: JSON.stringify({
          title: input.name,
          type: input.type,
          module_id: input.moduleId,
          priority: input.priority,
          status: input.status,
          author_id: input.authorId ?? 1,
          requirement_id: input.requirementId,
          precondition: input.precondition ?? '',
          test_steps: input.steps ?? '',
          expected_result: input.expectedResult ?? '',
          iteration: input.iteration ?? '',
          is_smoke: input.isSmoke ?? false,
          project_name: input.projectName,
          api_details: apiDetails,
          ui_details:
            input.type === 'ui' && input.uiDetails
              ? mapUiDetailsToApi(input.uiDetails)
              : input.type === 'ui'
                ? { steps: [] }
                : undefined,
        }),
      });
      return mapCase(created);
    },

    async updateTestCase(storageId: number, input: UpdateTestCaseInput) {
      const apiDetails = mapApiDetailsInput(input);
      const updated = await request<ApiTestCase>(`/test-cases/${storageId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: input.name,
          module_id: input.moduleId,
          priority: input.priority,
          status: input.status,
          author_id: input.authorId,
          requirement_id: input.requirementId,
          precondition: input.precondition,
          test_steps: input.steps,
          expected_result: input.expectedResult,
          iteration: input.iteration,
          is_smoke: input.isSmoke,
          project_name: input.projectName,
          api_details: apiDetails,
          ui_details: input.uiDetails ? mapUiDetailsToApi(input.uiDetails) : undefined,
        }),
      });
      return mapCase(updated);
    },

    async deleteTestCase(storageId: number) {
      await request(`/test-cases/${storageId}`, { method: 'DELETE' });
    },

    async importTestCases(file: File, moduleId?: string): Promise<TestCaseImportResult> {
      const body = new FormData();
      body.append('file', file);
      const query = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : '';
      const result = await request<{ imported_count: number; codes: string[] }>(
        `/test-cases/import${query}`,
        { method: 'POST', body },
      );
      return { importedCount: result.imported_count, codes: result.codes };
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

    async deleteUser(id: string) {
      await request(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

    async startUiExecution(input: UiExecutionInput) {
      const response = await request<ApiEnvelope<ExecutionStart>>('/ui-test/executions', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return response.data;
    },

    async getUiExecution(executionId: string) {
      const response = await request<ApiEnvelope<UiExecutionResult>>(
        `/ui-test/executions/${encodeURIComponent(executionId)}`,
      );
      return {
        ...response.data,
        cases: response.data.cases.map((item) => ({
          ...item,
          screenshotUrl: resolveArtifactUrl(item.screenshotUrl ?? null),
          videoUrl: resolveArtifactUrl(item.videoUrl ?? null),
          traceUrl: resolveArtifactUrl(item.traceUrl ?? null),
        })),
      };
    },

    async stopUiExecution(executionId: string) {
      await request(`/ui-test/executions/${encodeURIComponent(executionId)}/stop`, {
        method: 'POST',
      });
    },

    async startApiExecution(input: ApiExecutionInput) {
      const response = await request<ApiEnvelope<ExecutionStart>>('/api-test/executions', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return response.data;
    },

    async getApiExecutionReport(executionId: string) {
      const response = await request<ApiEnvelope<ApiExecutionReport>>(
        `/api-test/executions/${encodeURIComponent(executionId)}/report`,
      );
      return response.data;
    },

    async stopApiExecution(executionId: string) {
      await request(`/api-test/executions/${encodeURIComponent(executionId)}/stop`, {
        method: 'POST',
      });
    },

    async debugApiCase(input: ApiDebugInput) {
      const response = await request<ApiEnvelope<ApiDebugResult>>('/debug/api-run', {
        method: 'POST',
        body: JSON.stringify({
          environment: input.environment,
          variables: input.variables,
          url: input.url,
          method: input.method,
          expected_code: input.expectedCode,
          headers: input.headers,
          query_params: input.queryParams,
          body_type: input.bodyType,
          body_content: input.bodyContent,
          body_fields: input.bodyFields,
          assertions: input.assertions,
          extracts: input.extracts,
        }),
      });
      return response.data;
    },

    async debugUiCase(input: UiDebugInput) {
      const response = await request<ApiEnvelope<UiDebugResult>>('/debug/ui-run', {
        method: 'POST',
        body: JSON.stringify({
          environment: input.environment,
          variables: input.variables,
          browser: input.browser,
          headless: input.headless,
          timeout_seconds: input.timeoutSeconds,
          steps: input.steps,
        }),
      });
      return {
        ...response.data,
        screenshotUrl: resolveArtifactUrl(response.data.screenshotUrl),
        videoUrl: resolveArtifactUrl(response.data.videoUrl),
        traceUrl: resolveArtifactUrl(response.data.traceUrl),
      };
    },

    async generateXMind(
      file: File,
      uploaderId = 1,
      signal?: AbortSignal,
    ): Promise<XMindTaskDetail> {
      const body = new FormData();
      body.append('file', file);
      body.append('uploader_id', String(uploaderId));
      const response = await request<ApiXMindTaskDetail>('/xmind/generate', {
        method: 'POST',
        body,
        signal,
      });
      return mapXMindTaskDetail(response);
    },

    async listXMindTasks(page = 1, pageSize = 20, status?: XMindTaskStatus) {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (status) params.set('status', status);
      const response = await request<ApiPaginatedResponse<ApiXMindTaskRecord>>(
        `/xmind/tasks?${params}`,
      );
      return {
        items: response.items.map(mapXMindTaskRecord),
        page: response.page,
        pageSize: response.page_size,
        total: response.total,
      };
    },

    async getXMindTask(taskId: number) {
      const response = await request<ApiXMindTaskDetail>(`/xmind/tasks/${taskId}`);
      return mapXMindTaskDetail(response);
    },

    async retryXMindTask(taskId: number) {
      const response = await request<ApiXMindTaskDetail>(`/xmind/tasks/${taskId}/retry`, {
        method: 'POST',
      });
      return mapXMindTaskDetail(response);
    },

    async confirmXMind(input: XMindConfirmInput): Promise<XMindConfirmResult> {
      return request<XMindConfirmResult>('/xmind/confirm', {
        method: 'POST',
        body: JSON.stringify({
          uploader_id: input.uploaderId,
          module_mapping: input.moduleMapping,
          cases: input.cases,
        }),
      });
    },

    async confirmXMindTask(taskId: number, input: XMindTaskConfirmInput) {
      return request<XMindConfirmResult>(`/xmind/tasks/${taskId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          module_mapping: input.moduleMapping,
        }),
      });
    },

    async exportXMind(cases: XMindGeneratedCase[]): Promise<Blob> {
      return download('/xmind/export', {
        method: 'POST',
        body: JSON.stringify({ cases }),
      });
    },

    async deleteXMindTask(taskId: number): Promise<void> {
      // 后端 204 No Content，request<void> 在 204 状态下返回 undefined。
      await request<void>(`/xmind/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
      });
    },

    async cancelXMindTask(taskId: number): Promise<XMindTaskRecord> {
      // 后端返回取消后的任务记录（含最新状态），供列表就地刷新。
      const response = await request<ApiXMindTaskDetail>(
        `/xmind/tasks/${encodeURIComponent(taskId)}/cancel`,
        { method: 'POST' },
      );
      return mapXMindTaskRecord(response);
    },
  };
}
