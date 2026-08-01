import type { TestCaseRecord, UserRecord } from '../services/contracts';

export const initialTestCases: TestCaseRecord[] = [
  {
    id: 'API-253301',
    type: 'api',
    moduleId: 'auth',
    name: '用户资料查询',
    priority: 'P0',
    status: '已通过',
    maintainer: '江珊',
    creator: '江珊',
    updatedAt: '今天 09:42',
    endpoint: '/api/users/profile',
    method: 'GET',
    expectedStatus: 200,
  },
  {
    id: 'API-253302',
    type: 'api',
    moduleId: 'payments',
    name: '创建支付订单',
    priority: 'P1',
    status: '维护中',
    maintainer: '林然',
    creator: '林然',
    updatedAt: '昨天 16:20',
    endpoint: '/api/payments',
    method: 'POST',
    expectedStatus: 201,
  },
];

export const initialUsers: UserRecord[] = [
  {
    id: 'USR-1001',
    name: '江珊',
    email: 'jiangshan@example.com',
    department: '质量保障部',
    role: '测试负责人',
    enabled: true,
  },
  {
    id: 'USR-1002',
    name: '林然',
    email: 'linran@example.com',
    department: '研发部',
    role: '开发人员',
    enabled: true,
  },
];
