/**
 * 角色权限服务测试：真实 API 与 Mock 实现的权限保存契约。
 */
import { createApiPlatformService } from './apiPlatformService';
import { createMockPlatformService } from './mockPlatformService';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

it('通过角色权限接口保存完整权限对象', async () => {
  const permissions = {
    caseView: true,
    caseEdit: true,
    xmindConvert: false,
    personnelManage: false,
    systemSettings: false,
  };
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/v1/roles/3/permissions');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ permissions });
    return jsonResponse({ id: 3, name: '开发人员', permissions });
  });
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  await expect(service.updateRolePermissions('3', permissions)).resolves.toEqual({
    id: '3',
    name: '开发人员',
    permissions,
  });
});

it('模拟服务保存角色权限后再次读取时返回最新值', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const developer = (await service.listRoles()).find((role) => role.name === '开发人员')!;

  await service.updateRolePermissions(developer.id, {
    ...developer.permissions,
    caseEdit: true,
  });

  expect(
    (await service.listRoles()).find((role) => role.id === developer.id)?.permissions.caseEdit,
  ).toBe(true);
});
