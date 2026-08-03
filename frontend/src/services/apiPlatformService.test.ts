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

test('surfaces backend validation details', async () => {
  const service = createApiPlatformService({
    baseUrl: '/api/v1',
    fetcher: vi.fn(async () => jsonResponse({ detail: 'Email already exists' }, 409)),
  });

  await expect(service.listUsers()).rejects.toThrow('Email already exists');
});
