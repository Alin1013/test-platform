import { createApiAuthClient } from './authClient';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const apiUser = {
  id: 8,
  account: 'newtester',
  name: '新测试员',
  avatar: null,
  email: 'newtester@example.com',
  department: '质量保障部',
  role: '测试工程师',
  permissions: {
    caseView: true,
    caseEdit: true,
    xmindConvert: true,
    personnelManage: false,
    systemSettings: false,
  },
  status: 'enabled',
};

test('register sends the auth request and maps the created user', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('http://localhost:8000/api/v1/auth/register');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    expect(JSON.parse(String(init?.body))).toEqual({
      account: 'newtester',
      name: '新测试员',
      email: 'newtester@example.com',
      password: 'Register123',
    });
    return jsonResponse({ user: apiUser }, 201);
  });
  const client = createApiAuthClient({ baseUrl: 'http://localhost:8000/api/v1/', fetcher });

  await expect(
    client.register({
      account: 'newtester',
      name: '新测试员',
      email: 'newtester@example.com',
      password: 'Register123',
    }),
  ).resolves.toEqual({ account: 'newtester', name: '新测试员', avatar: undefined });
});

test('register surfaces backend conflict details', async () => {
  const client = createApiAuthClient({
    baseUrl: '/api/v1',
    fetcher: vi.fn(async () => jsonResponse({ detail: 'Account or email already exists' }, 409)),
  });

  await expect(
    client.register({
      account: 'newtester',
      name: '新测试员',
      email: 'newtester@example.com',
      password: 'Register123',
    }),
  ).rejects.toThrow('Account or email already exists');
});
