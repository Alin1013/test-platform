export type TestCaseType = 'functional' | 'api' | 'ui';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type TestCaseStatus = '维护中' | '已通过' | '草稿' | '已失败' | '已停用';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type ApiBodyType = 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded';
export type ApiAssertionType = 'statusCode' | 'jsonPath' | 'responseTime';
export type ApiComparison = 'equals' | 'contains' | 'notNull';
export type UiAction = 'click' | 'input' | 'navigate' | 'hover' | 'wait' | 'assert';
export type UiLocatorType = 'xpath' | 'css' | 'id' | 'text';
export type UiAssertion = 'none' | 'textEquals' | 'isVisible' | 'urlEquals';
export type UserRole = '测试负责人' | '测试工程师' | '开发人员';
export type PermissionKey =
  | 'caseView'
  | 'caseEdit'
  | 'xmindConvert'
  | 'personnelManage'
  | 'systemSettings';

export interface TestCaseRecord {
  storageId: number;
  id: string;
  type: TestCaseType;
  moduleId: string;
  name: string;
  priority: Priority;
  status: TestCaseStatus;
  maintainer: string;
  creator: string;
  updatedAt: string;
  requirementId?: string;
  precondition?: string;
  steps?: string;
  expectedResult?: string;
  iteration?: string;
  isSmoke?: boolean;
  projectName?: string;
  endpoint?: string;
  method?: HttpMethod;
  expectedStatus?: number;
  apiDetails?: ApiAutomationCaseDetails;
  uiDetails?: UiAutomationCaseDetails;
}

export interface TestModule {
  id: string;
  name: string;
  projectId: number;
  children: TestModule[];
}

export interface ApiKeyValueItem {
  enabled: boolean;
  key: string;
  value: string;
}

export interface ApiResponseAssertion {
  type: ApiAssertionType;
  target: string;
  comparison: ApiComparison;
  expected: string;
}

export interface ApiExtractVariable {
  name: string;
  jsonPath: string;
}

export interface ApiAutomationCaseDetails {
  headers: ApiKeyValueItem[];
  queryParams: ApiKeyValueItem[];
  bodyType: ApiBodyType;
  bodyContent: string;
  bodyFields: ApiKeyValueItem[];
  assertions: ApiResponseAssertion[];
  extracts: ApiExtractVariable[];
}

export interface UiAutomationStep {
  action: UiAction;
  locatorType: UiLocatorType;
  target: string;
  value: string;
  assertion: UiAssertion;
  expected: string;
}

export interface UiAutomationCaseDetails {
  description: string;
  dependencyCaseId?: number;
  browser: 'chrome' | 'firefox';
  environment: string;
  timeoutSeconds: number;
  retryCount: number;
  steps: UiAutomationStep[];
}

export interface TestCaseQuery {
  type?: TestCaseType;
  moduleId?: string;
  keyword?: string;
  priority?: Priority;
  status?: TestCaseStatus;
}

export interface CreateTestCaseInput {
  type: TestCaseType;
  authorId?: number;
  moduleId: string;
  name: string;
  priority: Priority;
  status: TestCaseStatus;
  requirementId?: string;
  precondition?: string;
  steps?: string;
  expectedResult?: string;
  iteration?: string;
  isSmoke?: boolean;
  projectName?: string;
  endpoint?: string;
  method?: HttpMethod;
  expectedStatus?: number;
  apiDetails?: ApiAutomationCaseDetails;
  uiDetails?: UiAutomationCaseDetails;
}

export type UpdateTestCaseInput = Omit<CreateTestCaseInput, 'type'>;

export interface TestCaseImportResult {
  importedCount: number;
  codes: string[];
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  department: string;
  role: UserRole;
  enabled: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  department: string;
  role: UserRole;
  password: string;
}

export interface PermissionRole {
  id: string;
  name: UserRole;
  permissions: Record<PermissionKey, boolean>;
}

export interface DashboardData {
  counts: Record<TestCaseType, number>;
  total: number;
  recentCases: TestCaseRecord[];
}

export type NotificationChannel = 'wechatWork' | 'feishu' | 'dingtalk';

export interface TestEnvironment {
  id: string;
  name: string;
  baseUrl: string;
}

export interface SystemSettings {
  general: {
    platformName: string;
    announcement: string;
    caseNumberPrefix: string;
  };
  execution: {
    environments: TestEnvironment[];
    defaultEnvironmentId: string;
    retryCount: number;
    apiTimeoutMs: number;
  };
  notifications: Record<NotificationChannel, string>;
  ai: {
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
  };
}

export interface TestWebhookConnectionInput {
  channel: NotificationChannel;
  webhookUrl: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ExecutionDetailStatus = 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED';

export interface UiExecutionInput {
  projectId: number;
  suiteIds: number[];
  environment: string;
  browser: 'chrome' | 'firefox' | 'safari' | 'edge';
  headless: boolean;
  concurrency: number;
}

export interface ExecutionStart {
  executionId: string;
  status: ExecutionStatus;
  startTime?: string;
}

export interface UiExecutionCase {
  caseId: number;
  caseName: string;
  browser: UiExecutionInput['browser'];
  status: ExecutionDetailStatus;
  durationMs: number;
  errorMessage?: string | null;
  screenshotUrl?: string | null;
  videoUrl?: string | null;
  steps?: Array<Record<string, unknown> | string>;
  logs?: string[];
}

export interface UiExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  summary: {
    total: number;
    passed: number;
    failed: number;
    running: number;
    pending: number;
    durationMs: number;
  };
  cases: UiExecutionCase[];
}

export interface ApiExecutionInput {
  projectId: number;
  suiteIds: number[];
  envId: number;
  globalHeaders: Record<string, string>;
  iterations: number;
  rampUpTime: number;
}

export interface ApiAssertionResult {
  expression: string;
  passed: boolean;
  actual?: string;
}

export interface ApiExecutionResult {
  apiId: number;
  name: string;
  method: HttpMethod;
  url: string;
  responseCode: number | null;
  responseTimeMs: number;
  status: ExecutionDetailStatus;
  requestData: {
    headers: Record<string, string>;
    body: unknown;
  };
  responseData: unknown;
  assertions: ApiAssertionResult[];
}

export interface ApiExecutionReport {
  executionId: string;
  status: ExecutionStatus;
  summary: {
    totalApi: number;
    passedApi: number;
    failedApi: number;
    pendingApi: number;
    avgResponseTimeMs: number;
  };
  results: ApiExecutionResult[];
}

export interface ApiDebugInput {
  environment?: string;
  variables: Record<string, string>;
  url: string;
  method: HttpMethod;
  expectedCode: number;
  headers: Record<string, string>;
  queryParams: ApiKeyValueItem[];
  bodyType: ApiBodyType;
  bodyContent?: string;
  bodyFields: ApiKeyValueItem[];
  assertions: ApiResponseAssertion[];
  extracts: ApiExtractVariable[];
}

export interface ApiDebugAssertionResult {
  type: ApiAssertionType;
  expression: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface ApiDebugResult {
  success: boolean;
  error?: string;
  requestData: {
    method: HttpMethod;
    url: string;
    headers: Record<string, string>;
    body: unknown;
  } | null;
  statusCode: number | null;
  responseTimeMs: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  assertions: ApiDebugAssertionResult[];
  extracts: Record<string, unknown>;
}

export interface UiDebugStep extends UiAutomationStep {
  stepIndex: number;
}

export interface UiDebugInput {
  environment: string;
  variables: Record<string, string>;
  browser: 'chrome' | 'firefox' | 'safari' | 'edge';
  headless: boolean;
  timeoutSeconds: number;
  steps: UiDebugStep[];
}

export interface UiDebugStepResult {
  stepIndex: number;
  action?: UiAction;
  status: ExecutionDetailStatus;
  durationMs: number;
  errorMessage?: string | null;
}

export interface UiDebugResult {
  success: boolean;
  status: ExecutionDetailStatus;
  durationMs: number;
  stepResults: UiDebugStepResult[];
  logs: string[];
  screenshotUrl: string | null;
  videoUrl: string | null;
  errorMessage: string | null;
}

export interface PlatformService {
  getDashboard(): Promise<DashboardData>;
  listTestModules(projectId?: number): Promise<TestModule[]>;
  listTestCases(query?: TestCaseQuery): Promise<TestCaseRecord[]>;
  createTestCase(input: CreateTestCaseInput): Promise<TestCaseRecord>;
  updateTestCase(storageId: number, input: UpdateTestCaseInput): Promise<TestCaseRecord>;
  deleteTestCase(storageId: number): Promise<void>;
  importTestCases(file: File): Promise<TestCaseImportResult>;
  listUsers(): Promise<UserRecord[]>;
  addUser(input: CreateUserInput): Promise<UserRecord>;
  setUserEnabled(id: string, enabled: boolean): Promise<void>;
  listRoles(): Promise<PermissionRole[]>;
  updateRolePermissions(
    id: string,
    permissions: PermissionRole['permissions'],
  ): Promise<PermissionRole>;
  getSystemSettings(): Promise<SystemSettings>;
  updateSystemSettings(settings: SystemSettings): Promise<SystemSettings>;
  testWebhookConnection(input: TestWebhookConnectionInput): Promise<TestConnectionResult>;
  startUiExecution(input: UiExecutionInput): Promise<ExecutionStart>;
  getUiExecution(executionId: string): Promise<UiExecutionResult>;
  stopUiExecution(executionId: string): Promise<void>;
  startApiExecution(input: ApiExecutionInput): Promise<ExecutionStart>;
  getApiExecutionReport(executionId: string): Promise<ApiExecutionReport>;
  stopApiExecution(executionId: string): Promise<void>;
  debugApiCase(input: ApiDebugInput): Promise<ApiDebugResult>;
  debugUiCase(input: UiDebugInput): Promise<UiDebugResult>;
}
