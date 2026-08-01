export type TestCaseType = 'functional' | 'api' | 'ui';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type TestCaseStatus = '维护中' | '已通过' | '草稿' | '已停用';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type UserRole = '测试负责人' | '测试工程师' | '开发人员';
export type PermissionKey =
  | 'caseView'
  | 'caseEdit'
  | 'xmindConvert'
  | 'personnelManage'
  | 'systemSettings';

export interface TestCaseRecord {
  id: string;
  type: TestCaseType;
  moduleId: string;
  name: string;
  priority: Priority;
  status: TestCaseStatus;
  maintainer: string;
  creator: string;
  updatedAt: string;
  endpoint?: string;
  method?: HttpMethod;
  expectedStatus?: number;
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
  moduleId: string;
  name: string;
  priority: Priority;
  status: TestCaseStatus;
  endpoint?: string;
  method?: HttpMethod;
  expectedStatus?: number;
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
  name: UserRole;
  permissions: Record<PermissionKey, boolean>;
}

export interface DashboardData {
  counts: Record<TestCaseType, number>;
  total: number;
  recentCases: TestCaseRecord[];
}

export type NotificationChannel = 'wechatWork' | 'feishu' | 'dingtalk';

export interface SystemSettings {
  general: {
    platformName: string;
    announcement: string;
    caseNumberPrefix: string;
  };
  execution: {
    baseUrl: string;
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

export interface PlatformService {
  getDashboard(): Promise<DashboardData>;
  listTestCases(query?: TestCaseQuery): Promise<TestCaseRecord[]>;
  createTestCase(input: CreateTestCaseInput): Promise<TestCaseRecord>;
  listUsers(): Promise<UserRecord[]>;
  addUser(input: CreateUserInput): Promise<UserRecord>;
  setUserEnabled(id: string, enabled: boolean): Promise<void>;
  listRoles(): Promise<PermissionRole[]>;
  getSystemSettings(): Promise<SystemSettings>;
  updateSystemSettings(settings: SystemSettings): Promise<SystemSettings>;
  testWebhookConnection(input: TestWebhookConnectionInput): Promise<TestConnectionResult>;
}
