import { createApiPlatformService } from './apiPlatformService';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('maps dashboard and case responses to the platform contract', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/dashboard/stats')) {
      return jsonResponse({ functional: 2, api: 3, ui: 2, total: 7 });
    }
    if (url.includes('/dashboard/recent-cases')) {
      return jsonResponse({
        items: [
          {
            id: 3,
            code: 'API-253301',
            title: '用户资料查询',
            type: 'api',
            module_id: 'auth',
            priority: 'P0',
            status: '已通过',
            author_name: '江珊',
            updated_at: '2026-08-03T08:00:00Z',
            api_details: { url: '/api/users/profile', method: 'GET', expected_code: 200 },
          },
        ],
        total: 1,
      });
    }
    return jsonResponse({ items: [], total: 0 });
  });
  const service = createApiPlatformService({
    baseUrl: 'http://localhost:8000/api/v1/',
    fetcher,
  });

  const dashboard = await service.getDashboard();

  expect(dashboard.counts).toEqual({ functional: 2, api: 3, ui: 2 });
  expect(dashboard.total).toBe(7);
  expect(dashboard.recentCases[0]).toMatchObject({
    id: 'API-253301',
    name: '用户资料查询',
    moduleId: 'auth',
    maintainer: '江珊',
    endpoint: '/api/users/profile',
    method: 'GET',
    expectedStatus: 200,
  });
  expect(fetcher).toHaveBeenCalledWith(
    'http://localhost:8000/api/v1/dashboard/recent-cases?page_size=6',
    expect.any(Object),
  );
});

test('maps the project module tree to the platform contract', async () => {
  const fetcher = vi.fn(async () =>
    jsonResponse([
      {
        id: 'core',
        name: '核心模块',
        project_id: 1,
        children: [
          { id: 'auth', name: '鉴权', project_id: 1, children: [] },
        ],
      },
    ]),
  );
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  await expect(service.listTestModules()).resolves.toEqual([
    {
      id: 'core',
      name: '核心模块',
      projectId: 1,
      children: [
        { id: 'auth', name: '鉴权', projectId: 1, children: [] },
      ],
    },
  ]);
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/modules',
    expect.any(Object),
  );
});

test('sends contract mutations in the backend request shape', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/test-cases')) {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        title: '刷新访问令牌',
        module_id: 'auth',
        author_id: 1,
        api_details: {
          url: '/api/token/refresh',
          method: 'POST',
          expected_code: 201,
        },
      });
      return jsonResponse({
        id: 8,
        code: 'API-000008',
        title: body.title,
        type: body.type,
        module_id: body.module_id,
        priority: body.priority,
        status: body.status,
        author_name: '江珊',
        updated_at: '2026-08-03T08:00:00Z',
        api_details: body.api_details,
      }, 201);
    }
    if (url.endsWith('/users/2/status')) {
      expect(JSON.parse(String(init?.body))).toEqual({ status: 'disabled' });
      return jsonResponse({ status: 'disabled' });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  const created = await service.createTestCase({
    type: 'api',
    moduleId: 'auth',
    name: '刷新访问令牌',
    priority: 'P1',
    status: '维护中',
    endpoint: '/api/token/refresh',
    method: 'POST',
    expectedStatus: 201,
  });
  await service.setUserEnabled('2', false);

  expect(created.id).toBe('API-000008');
  expect(fetcher).toHaveBeenLastCalledWith(
    '/api/v1/users/2/status',
    expect.objectContaining({ method: 'PATCH' }),
  );
});

test('imports test cases into the selected module', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe('http://localhost:8000/api/v1/test-cases/import?module_id=auth');
    return jsonResponse({ imported_count: 1, codes: ['FUN-90001'] }, 201);
  });
  const service = createApiPlatformService({
    baseUrl: 'http://localhost:8000/api/v1/',
    fetcher,
  });

  const result = await service.importTestCases(
    new File(['用例目录,用例名称,用例类型\n鉴权,导入功能用例,功能测试'], 'apifox.csv', {
      type: 'text/csv',
    }),
    'auth',
  );

  expect(result).toEqual({ importedCount: 1, codes: ['FUN-90001'] });
});

test('sends and maps the complete UI automation case details', async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(body.ui_details).toEqual({
      description: '验证错误密码提示与登录按钮状态',
      dependency_case_id: 2,
      browser: 'chrome',
      environment: 'test',
      timeout_seconds: 45,
      retry_count: 1,
      steps: [
        {
          action: 'input',
          locatorType: 'id',
          target: 'password',
          value: 'wrong-password',
          assertion: 'none',
          expected: '',
        },
      ],
    });
    return jsonResponse(
      {
        id: 9,
        code: 'UI-000009',
        title: body.title,
        type: body.type,
        module_id: body.module_id,
        priority: body.priority,
        status: body.status,
        author_name: '江珊',
        updated_at: '2026-08-03T08:00:00Z',
        ui_details: body.ui_details,
      },
      201,
    );
  });
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  const created = await service.createTestCase({
    type: 'ui',
    authorId: 8,
    moduleId: 'auth',
    name: '用户登录 - 密码错误提示校验',
    priority: 'P0',
    status: '维护中',
    uiDetails: {
      description: '验证错误密码提示与登录按钮状态',
      dependencyCaseId: 2,
      browser: 'chrome',
      environment: 'test',
      timeoutSeconds: 45,
      retryCount: 1,
      steps: [
        {
          action: 'input',
          locatorType: 'id',
          target: 'password',
          value: 'wrong-password',
          assertion: 'none',
          expected: '',
        },
      ],
    },
  });

  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ author_id: 8 });

  expect(created.uiDetails).toMatchObject({
    description: '验证错误密码提示与登录按钮状态',
    dependencyCaseId: 2,
    timeoutSeconds: 45,
  });
});

test('surfaces backend validation details', async () => {
  const service = createApiPlatformService({
    baseUrl: '/api/v1',
    fetcher: vi.fn(async () => jsonResponse({ detail: 'Email already exists' }, 409)),
  });

  await expect(service.listUsers()).rejects.toThrow('Email already exists');
});

test('updates a test case with the backend request shape and maps its response', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/v1/test-cases/8');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      title: '刷新访问令牌',
      module_id: 'auth',
      priority: 'P1',
      status: '已通过',
      api_details: {
        url: '/api/token/refresh',
        method: 'PUT',
        expected_code: 204,
      },
    });
    return jsonResponse({
      id: 8,
      code: 'API-000008',
      title: '刷新访问令牌',
      type: 'api',
      module_id: 'auth',
      priority: 'P1',
      status: '已通过',
      author_name: '江珊',
      updated_at: '2026-08-03T08:00:00Z',
      api_details: { url: '/api/token/refresh', method: 'PUT', expected_code: 204 },
    });
  });
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  const updated = await service.updateTestCase(8, {
    moduleId: 'auth',
    name: '刷新访问令牌',
    priority: 'P1',
    status: '已通过',
    endpoint: '/api/token/refresh',
    method: 'PUT',
    expectedStatus: 204,
  });

  expect(updated).toMatchObject({
    storageId: 8,
    id: 'API-000008',
    status: '已通过',
    method: 'PUT',
    expectedStatus: 204,
  });
});

test('deletes a test case through the backend endpoint', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/v1/test-cases/8');
    expect(init?.method).toBe('DELETE');
    return new Response(null, { status: 204 });
  });
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  await expect(service.deleteTestCase(8)).resolves.toBeUndefined();
});

test('uses the dedicated UI execution endpoints and request shape', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/ui-test/executions')) {
      expect(JSON.parse(String(init?.body))).toEqual({
        projectId: 1,
        suiteIds: [2],
        environment: 'test',
        browser: 'chrome',
        headless: true,
        concurrency: 2,
      });
      return jsonResponse({
        code: 200,
        message: 'success',
        data: {
          executionId: 'ui_exec_20260803_001',
          status: 'RUNNING',
          startTime: '2026-08-03T14:50:00Z',
        },
      });
    }
    if (url.endsWith('/ui-test/executions/ui_exec_20260803_001')) {
      return jsonResponse({
        code: 200,
        data: {
          executionId: 'ui_exec_20260803_001',
          status: 'RUNNING',
          summary: { total: 1, passed: 0, failed: 0, running: 0, pending: 1, durationMs: 0 },
          cases: [],
        },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  const started = await service.startUiExecution({
    projectId: 1,
    suiteIds: [2],
    environment: 'test',
    browser: 'chrome',
    headless: true,
    concurrency: 2,
  });
  const result = await service.getUiExecution(started.executionId);

  expect(started.status).toBe('RUNNING');
  expect(result.summary.pending).toBe(1);
});

test('uses the dedicated API execution report and stop endpoints', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api-test/executions')) {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        projectId: 1,
        suiteIds: [3],
        envId: 3,
        globalHeaders: { Authorization: 'Bearer token' },
        iterations: 1,
      });
      return jsonResponse({
        code: 200,
        message: 'Execution started',
        data: { executionId: 'api_exec_20260803_088', status: 'RUNNING' },
      });
    }
    if (url.endsWith('/api-test/executions/api_exec_20260803_088/report')) {
      return jsonResponse({
        code: 200,
        data: {
          executionId: 'api_exec_20260803_088',
          status: 'RUNNING',
          summary: { totalApi: 1, passedApi: 0, failedApi: 0, pendingApi: 1, avgResponseTimeMs: 0 },
          results: [],
        },
      });
    }
    if (url.endsWith('/api-test/executions/api_exec_20260803_088/stop')) {
      expect(init?.method).toBe('POST');
      return jsonResponse({ code: 200, message: 'Execution stopped successfully' });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  const started = await service.startApiExecution({
    projectId: 1,
    suiteIds: [3],
    envId: 3,
    globalHeaders: { Authorization: 'Bearer token' },
    iterations: 1,
    rampUpTime: 0,
  });
  const report = await service.getApiExecutionReport(started.executionId);
  await service.stopApiExecution(started.executionId);

  expect(report.summary.pendingApi).toBe(1);
});

test('sends API debug configuration to the dedicated endpoint and unwraps the result', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/v1/debug/api-run');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      environment: 'test',
      variables: { token: 'debug-token' },
      url: '/api/profile',
      method: 'POST',
      expected_code: 200,
      headers: { Authorization: 'Bearer {{token}}' },
      query_params: [{ enabled: true, key: 'expand', value: 'roles' }],
      body_type: 'json',
      body_content: '{"name":"demo"}',
      body_fields: [],
      assertions: [
        { type: 'statusCode', target: '', comparison: 'equals', expected: '200' },
      ],
      extracts: [{ name: 'userId', jsonPath: '$.data.id' }],
    });
    return jsonResponse({
      code: 200,
      message: 'Debug run completed',
      data: {
        success: true,
        requestData: {
          method: 'POST',
          url: 'https://test.example.com/api/profile?expand=roles',
          headers: { authorization: 'Bearer debug-token' },
          body: { name: 'demo' },
        },
        statusCode: 200,
        responseTimeMs: 18,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: { data: { id: 42 } },
        assertions: [
          {
            type: 'statusCode',
            expression: '',
            expected: '200',
            actual: '200',
            passed: true,
          },
        ],
        extracts: { userId: 42 },
      },
    });
  });
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  const result = await service.debugApiCase({
    environment: 'test',
    variables: { token: 'debug-token' },
    url: '/api/profile',
    method: 'POST',
    expectedCode: 200,
    headers: { Authorization: 'Bearer {{token}}' },
    queryParams: [{ enabled: true, key: 'expand', value: 'roles' }],
    bodyType: 'json',
    bodyContent: '{"name":"demo"}',
    bodyFields: [],
    assertions: [
      { type: 'statusCode', target: '', comparison: 'equals', expected: '200' },
    ],
    extracts: [{ name: 'userId', jsonPath: '$.data.id' }],
  });

  expect(result).toMatchObject({
    success: true,
    statusCode: 200,
    responseTimeMs: 18,
    responseBody: { data: { id: 42 } },
    extracts: { userId: 42 },
  });
});

test('sends UI debug configuration to the dedicated endpoint and unwraps step results', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('http://localhost:8001/api/v1/debug/ui-run');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      environment: 'staging',
      variables: { user: 'demo-user' },
      browser: 'firefox',
      headless: true,
      timeout_seconds: 45,
      steps: [
        {
          stepIndex: 1,
          action: 'navigate',
          locatorType: 'css',
          target: '{{baseUrl}}/login',
          value: '{{baseUrl}}/login',
          assertion: 'none',
          expected: '',
        },
      ],
    });
    return jsonResponse({
      code: 200,
      message: 'Debug run completed',
      data: {
        success: true,
        status: 'PASSED',
        durationMs: 31,
        stepResults: [
          { stepIndex: 1, action: 'navigate', status: 'PASSED', durationMs: 31 },
        ],
        logs: ['步骤 1 执行成功'],
        screenshotUrl: null,
        videoUrl: '/uploads/executions/debug.webm',
        errorMessage: null,
      },
    });
  });
  const service = createApiPlatformService({ baseUrl: 'http://localhost:8001/api/v1', fetcher });

  const result = await service.debugUiCase({
    environment: 'staging',
    variables: { user: 'demo-user' },
    browser: 'firefox',
    headless: true,
    timeoutSeconds: 45,
    steps: [
      {
        stepIndex: 1,
        action: 'navigate',
        locatorType: 'css',
        target: '{{baseUrl}}/login',
        value: '{{baseUrl}}/login',
        assertion: 'none',
        expected: '',
      },
    ],
  });

  expect(result).toMatchObject({
    success: true,
    status: 'PASSED',
    durationMs: 31,
    videoUrl: 'http://localhost:8001/uploads/executions/debug.webm',
  });
});
