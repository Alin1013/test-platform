/**
 * 前端与后端共享的领域类型契约（纯类型，无运行时代码）。
 */

// ===== 基础枚举 =====
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

// ===== 用例 =====
export interface TestCaseRecord {
  storageId: number;
  id: string;
  type: TestCaseType;
  moduleId: string;
  moduleName?: string;
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
  endpoint?: string;
  method?: HttpMethod;
  expectedStatus?: number;
  apiDetails?: ApiAutomationCaseDetails;
  uiDetails?: UiAutomationCaseDetails;
}

export interface PaginatedResult<T> {
  /** 通用分页结果结构。 */
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ===== 模块 =====
export interface TestModule {
  id: string;
  name: string;
  projectId: number;
  parentId?: string;
  moduleType?: TestCaseType;
  children: TestModule[];
}

export interface CreateTestModuleInput {
  name: string;
  parentId?: string;
  projectId?: number;
  moduleType: TestCaseType;
}

export interface UpdateTestModuleInput {
  name: string;
}

// ===== API 自动化详情 =====
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

// ===== UI 自动化详情 =====
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

// ===== 查询与创建 =====
export interface TestCaseQuery {
  type?: TestCaseType;
  moduleId?: string;
  keyword?: string;
  priority?: Priority;
  status?: TestCaseStatus;
  creatorId?: number;
  iteration?: string;
  isSmoke?: boolean;
}

export interface TestCaseFilterOptions {
  iterations: string[];
  creators: Array<{ id: number; name: string }>;
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

// ===== XMind =====
export interface XMindTreeNode {
  title: string;
  children: XMindTreeNode[];
}

export type XMindTaskStatus = 'PENDING' | 'RUNNING' | 'WAITING_REVIEW' | 'FAILED' | 'COMPLETED' | 'CANCELLED';

/** 用例审核状态：待审核 / 通过 / 待修改。合并时仅取 passed 写入正式用例库。 */
export type XMindCaseReviewStatus = 'pending' | 'passed' | 'needs_modification';

export interface XMindGeneratedCase {
  用例目录: string;
  用例名称: string;
  需求ID: string;
  前置条件: string;
  用例类型: '功能测试';
  用例状态: TestCaseStatus;
  用例等级: Priority;
  创建人: string;
  归属迭代: string;
  用例步骤: string;
  预期结果: string;
  /** 前端/后端生成的稳定标识，用于定位单条用例（增删改与勾选用）。 */
  tempId?: string;
  /** 审核状态，由审核界面驱动。 */
  reviewStatus?: XMindCaseReviewStatus;
  /** 审核评价（待修改或退回时填写）。 */
  reviewNote?: string;
}

/** 单条用例更新请求：所有字段可选，仅提交需要修改的部分。 */
export interface XMindCaseUpdateInput {
  reviewStatus?: XMindCaseReviewStatus;
  reviewNote?: string;
  用例目录?: string;
  用例名称?: string;
  需求ID?: string;
  前置条件?: string;
  用例等级?: string;
  归属迭代?: string;
  用例步骤?: string;
  预期结果?: string;
}

export interface XMindTaskRecord {
  id: number;
  fileName: string;
  fileUrl: string;
  uploaderId: number;
  uploaderName: string;
  status: XMindTaskStatus;
  parsedCasesCount: number;
  attempts: number;
  availableAt: string;
  lockedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
}

export interface XMindTaskDetail extends XMindTaskRecord {
  tree: XMindTreeNode[];
  cases: XMindGeneratedCase[];
  moduleMapping: Record<string, string>;
}

export type XMindGenerationResult = XMindTaskDetail;

export interface XMindTaskListResult extends PaginatedResult<XMindTaskRecord> {}

export interface XMindConfirmInput {
  uploaderId: number;
  moduleMapping: Record<string, string>;
  cases: XMindGeneratedCase[];
}

export interface XMindTaskConfirmInput {
  /** 合并目标模块：整任务共用，所有通过用例统一入库到该模块。 */
  moduleId: string;
}

export interface XMindConfirmResult {
  saved_cases: Array<{
    id: number;
    code: string;
    title: string;
    module_id: string;
  }>;
}

// ===== 人员与角色 =====
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

// ===== 仪表盘与系统设置 =====
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

// ===== 执行 =====
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
  traceUrl?: string | null;
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
  environment: string;
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

// ===== 调试 =====
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
  traceUrl: string | null;
  errorMessage: string | null;
}

// ===== 平台服务接口 =====
export interface PlatformService {
  getDashboard(): Promise<DashboardData>;
  listTestModules(projectId?: number, moduleType?: TestCaseType): Promise<TestModule[]>;
  createTestModule(input: CreateTestModuleInput): Promise<TestModule>;
  updateTestModule(moduleId: string, input: UpdateTestModuleInput): Promise<TestModule>;
  deleteTestModule(moduleId: string): Promise<void>;
  getTestCaseFilterOptions(type?: TestCaseType): Promise<TestCaseFilterOptions>;
  listTestCases(query?: TestCaseQuery): Promise<TestCaseRecord[]>;
  listTestCasesPage(query?: TestCaseQuery, page?: number, pageSize?: number): Promise<PaginatedResult<TestCaseRecord>>;
  createTestCase(input: CreateTestCaseInput): Promise<TestCaseRecord>;
  updateTestCase(storageId: number, input: UpdateTestCaseInput): Promise<TestCaseRecord>;
  deleteTestCase(storageId: number): Promise<void>;
  importTestCases(file: File, moduleId?: string): Promise<TestCaseImportResult>;
  /** 按当前筛选条件导出测试用例，功能用例使用标准导入模板表头。 */
  exportTestCases(query?: TestCaseQuery): Promise<Blob>;
  listUsers(): Promise<UserRecord[]>;
  addUser(input: CreateUserInput): Promise<UserRecord>;
  setUserEnabled(id: string, enabled: boolean): Promise<void>;
  deleteUser(id: string): Promise<void>;
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
  generateXMind(
    file: File,
    uploaderId?: number,
    signal?: AbortSignal,
  ): Promise<XMindTaskDetail>;
  listXMindTasks(page?: number, pageSize?: number, status?: XMindTaskStatus): Promise<PaginatedResult<XMindTaskRecord>>;
  getXMindTask(taskId: number): Promise<XMindTaskDetail>;
  retryXMindTask(taskId: number): Promise<XMindTaskDetail>;
  confirmXMind(input: XMindConfirmInput): Promise<XMindConfirmResult>;
  confirmXMindTask(taskId: number, input: XMindTaskConfirmInput): Promise<XMindConfirmResult>;
  exportXMind(cases: XMindGeneratedCase[]): Promise<Blob>;
  /** 删除 XMind 生成任务（运行中的任务需先取消/等待完成）。 */
  deleteXMindTask(taskId: number): Promise<void>;
  /** 取消生成中的 XMind 任务（仅排队中/生成中可取消，终态任务拒绝）。 */
  cancelXMindTask(taskId: number): Promise<XMindTaskRecord>;
  /** 更新单条预览用例：审核状态、评价或可编辑字段。 */
  updateXMindTaskCase(taskId: number, caseId: string, input: XMindCaseUpdateInput): Promise<XMindTaskDetail>;
  /** 删除单条预览用例。 */
  deleteXMindTaskCase(taskId: number, caseId: string): Promise<XMindTaskDetail>;
}
