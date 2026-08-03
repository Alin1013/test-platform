# Role Permissions Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit save button that persists edited role permissions through the existing backend API.

**Architecture:** Keep role identifiers and the update operation in the `PlatformService` boundary. Let `PersonnelPage` own the saved snapshot, editable roles, dirty detection, and save lifecycle while `PermissionMatrix` becomes a controlled table. The API service writes to the existing role-permissions endpoint and the mock service preserves saved roles in its in-memory store.

**Tech Stack:** React 18, TypeScript, Ant Design 6, Vitest, Testing Library, FastAPI REST endpoint already present

---

### Task 1: Persist Role Permissions Through PlatformService

**Files:**
- Create: `frontend/src/services/rolePermissionsService.test.ts`
- Modify: `frontend/src/services/contracts.ts`
- Modify: `frontend/src/mocks/fixtures.ts`
- Modify: `frontend/src/services/apiPlatformService.ts`
- Modify: `frontend/src/services/mockPlatformService.ts`

- [ ] **Step 1: Write failing API and mock persistence tests**

Create `frontend/src/services/rolePermissionsService.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused service test and verify RED**

Run:

```bash
cd frontend && npm test -- src/services/rolePermissionsService.test.ts
```

Expected: TypeScript/Vitest fails because `PermissionRole.id` and `updateRolePermissions` do not exist.

- [ ] **Step 3: Add role identity and update contract**

Update the role contract in `frontend/src/services/contracts.ts`:

```ts
export interface PermissionRole {
  id: string;
  name: UserRole;
  permissions: Record<PermissionKey, boolean>;
}
```

Add this method beside `listRoles()` in `PlatformService`:

```ts
updateRolePermissions(
  id: string,
  permissions: PermissionRole['permissions'],
): Promise<PermissionRole>;
```

- [ ] **Step 4: Give fixture roles stable backend-compatible IDs**

Add `id: '1'`, `id: '2'`, and `id: '3'` respectively to the three objects in `initialRoles` in `frontend/src/mocks/fixtures.ts`.

- [ ] **Step 5: Implement API mapping and update request**

Keep `ApiRole.id` numeric and add this mapper in `frontend/src/services/apiPlatformService.ts`:

```ts
function mapRole(role: ApiRole): PermissionRole {
  return {
    id: String(role.id),
    name: role.name,
    permissions: role.permissions,
  };
}
```

Replace `listRoles` and add the mutation:

```ts
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
```

- [ ] **Step 6: Implement mutable role storage in the mock service**

Initialize role state beside the existing user and settings state in `frontend/src/services/mockPlatformService.ts`:

```ts
let roles = copy(initialRoles);
```

Replace the role methods with:

```ts
async listRoles() {
  return respond(roles);
},

async updateRolePermissions(id, permissions) {
  let updated = roles.find((role) => role.id === id);
  if (!updated) throw new Error('Role not found');
  updated = { ...updated, permissions: copy(permissions) };
  roles = roles.map((role) => (role.id === id ? updated! : role));
  return respond(updated);
},
```

- [ ] **Step 7: Run the focused test and typecheck to verify GREEN**

Run:

```bash
cd frontend && npm test -- src/services/rolePermissionsService.test.ts
cd frontend && npm run typecheck
```

Expected: both commands exit 0; the focused test reports 2 passing tests.

- [ ] **Step 8: Commit the service boundary**

```bash
git add frontend/src/services/rolePermissionsService.test.ts frontend/src/services/contracts.ts frontend/src/mocks/fixtures.ts frontend/src/services/apiPlatformService.ts frontend/src/services/mockPlatformService.ts
git commit -m "feat: persist role permission updates"
```

### Task 2: Add Explicit Save Interaction to PersonnelPage

**Files:**
- Modify: `frontend/src/pages/personnel/PersonnelPage.test.tsx`
- Modify: `frontend/src/pages/personnel/PersonnelPage.tsx`
- Modify: `frontend/src/pages/personnel/components/PermissionMatrix.tsx`

- [ ] **Step 1: Replace the local-toggle assertion with a failing save workflow test**

Extend the existing “可以查看角色权限矩阵” test in `frontend/src/pages/personnel/PersonnelPage.test.tsx` after locating the developer permission:

```ts
const saveButton = screen.getByRole('button', { name: '保存' });
expect(saveButton).toBeDisabled();

const permission = within(matrix).getByRole('checkbox', { name: '开发人员的用例编辑权限' });
expect(permission).not.toBeChecked();
await user.click(permission);
expect(permission).toBeChecked();
expect(saveButton).toBeEnabled();

await user.click(saveButton);

expect(await screen.findByText('角色权限已保存')).toBeInTheDocument();
expect(saveButton).toBeDisabled();
await user.click(screen.getByRole('tab', { name: '用户列表' }));
await user.click(screen.getByRole('tab', { name: '角色与权限' }));
expect(
  within(screen.getByRole('table', { name: '权限矩阵' })).getByRole('checkbox', {
    name: '开发人员的用例编辑权限',
  }),
).toBeChecked();
```

- [ ] **Step 2: Run the personnel page test and verify RED**

Run:

```bash
cd frontend && npm test -- src/pages/personnel/PersonnelPage.test.tsx
```

Expected: the test fails because the “保存” button is absent.

- [ ] **Step 3: Make PermissionMatrix controlled and disable it while saving**

Replace the service and state ownership in `PermissionMatrix.tsx` with props:

```ts
interface PermissionMatrixProps {
  roles: PermissionRole[] | null;
  disabled?: boolean;
  onToggle: (roleId: string, permission: PermissionKey) => void;
}

export function PermissionMatrix({ roles, disabled = false, onToggle }: PermissionMatrixProps) {
```

Keep the existing skeleton and empty states. Update each checkbox to use the role ID and disabled state:

```tsx
<Checkbox
  aria-label={`${role.name}的${permission.label}权限`}
  checked={role.permissions[permission.key]}
  disabled={disabled}
  onChange={() => onToggle(role.id, permission.key)}
/>
```

- [ ] **Step 4: Load roles and track dirty rows in PersonnelPage**

Import `SaveOutlined`, `PermissionKey`, and `PermissionRole`. Add state:

```ts
const [permissionRoles, setPermissionRoles] = useState<PermissionRole[] | null>(null);
const [savedPermissionRoles, setSavedPermissionRoles] = useState<PermissionRole[]>([]);
const [savingPermissions, setSavingPermissions] = useState(false);
```

Add a loader that clones the saved snapshot, and run it when the permissions tab is first opened:

```ts
const loadRoles = useCallback(async () => {
  try {
    const nextRoles = await service.listRoles();
    setPermissionRoles(nextRoles);
    setSavedPermissionRoles(nextRoles);
  } catch {
    setPermissionRoles([]);
  }
}, [service]);

useEffect(() => {
  if (activeTab === 'permissions' && permissionRoles === null) void loadRoles();
}, [activeTab, loadRoles, permissionRoles]);
```

Compare permission records and derive changed roles:

```ts
const changedPermissionRoles = useMemo(
  () =>
    permissionRoles?.filter((role) => {
      const saved = savedPermissionRoles.find((candidate) => candidate.id === role.id);
      return !saved || JSON.stringify(saved.permissions) !== JSON.stringify(role.permissions);
    }) ?? [],
  [permissionRoles, savedPermissionRoles],
);
```

Add the controlled toggle:

```ts
const togglePermission = (roleId: string, permission: PermissionKey) => {
  setPermissionRoles((current) =>
    current?.map((role) =>
      role.id === roleId
        ? {
            ...role,
            permissions: {
              ...role.permissions,
              [permission]: !role.permissions[permission],
            },
          }
        : role,
    ) ?? null,
  );
};
```

- [ ] **Step 5: Save changed roles and preserve edits on failure**

Add the save handler:

```ts
const savePermissions = async () => {
  if (!changedPermissionRoles.length) return;
  setSavingPermissions(true);
  const pendingEdits = new Map(changedPermissionRoles.map((role) => [role.id, role]));

  try {
    const results = await Promise.allSettled(
      changedPermissionRoles.map((role) =>
        service.updateRolePermissions(role.id, role.permissions),
      ),
    );
    if (results.some((result) => result.status === 'rejected')) {
      const refreshed = await service.listRoles();
      setSavedPermissionRoles(refreshed);
      setPermissionRoles(
        refreshed.map((role) => pendingEdits.get(role.id) ?? role),
      );
      void message.error('角色权限保存失败');
      return;
    }

    const updated = results.map((result) =>
      result.status === 'fulfilled' ? result.value : null,
    ).filter((role): role is PermissionRole => role !== null);
    setPermissionRoles((current) =>
      current?.map((role) => updated.find((item) => item.id === role.id) ?? role) ?? null,
    );
    setSavedPermissionRoles((current) =>
      current.map((role) => updated.find((item) => item.id === role.id) ?? role),
    );
    void message.success('角色权限已保存');
  } catch {
    void message.error('角色权限保存失败');
  } finally {
    setSavingPermissions(false);
  }
};
```

- [ ] **Step 6: Render the save button and controlled matrix**

Use the existing `PageHeader` action slot:

```tsx
activeTab === 'users' ? (
  <Button type="primary" icon={<PlusOutlined />} aria-label="添加用户" onClick={() => setDrawerOpen(true)}>
    添加用户
  </Button>
) : (
  <Button
    type="primary"
    icon={<SaveOutlined />}
    loading={savingPermissions}
    disabled={!changedPermissionRoles.length}
    onClick={() => void savePermissions()}
  >
    保存
  </Button>
)
```

Render the controlled table:

```tsx
<PermissionMatrix
  roles={permissionRoles}
  disabled={savingPermissions}
  onToggle={togglePermission}
/>
```

- [ ] **Step 7: Run the focused page test and typecheck to verify GREEN**

Run:

```bash
cd frontend && npm test -- src/pages/personnel/PersonnelPage.test.tsx
cd frontend && npm run typecheck
```

Expected: both commands exit 0; the personnel page test reports all tests passing.

- [ ] **Step 8: Commit the page interaction**

```bash
git add frontend/src/pages/personnel/PersonnelPage.test.tsx frontend/src/pages/personnel/PersonnelPage.tsx frontend/src/pages/personnel/components/PermissionMatrix.tsx
git commit -m "feat: add explicit role permission save"
```

### Task 3: Full Verification and Browser QA

**Files:**
- Verify only; no planned source changes

- [ ] **Step 1: Run the full frontend unit suite**

```bash
cd frontend && npm test
```

Expected: all Vitest files and tests pass with exit code 0.

- [ ] **Step 2: Run typecheck and production build**

```bash
cd frontend && npm run typecheck
cd frontend && npm run build
```

Expected: both commands exit 0 and Vite writes `frontend/dist`.

- [ ] **Step 3: Run backend personnel regression tests**

```bash
pytest backend/tests/test_personnel.py -q
```

Expected: all personnel API tests pass with exit code 0.

- [ ] **Step 4: Verify the real page in desktop and mobile viewports**

Open `/personnel`, enter “角色与权限”, toggle “开发人员的用例编辑权限”, save, leave and re-enter the tab, then reload and confirm the value remains checked. Capture desktop (1307x964) and mobile (390x844) screenshots and confirm the save button, permissions matrix scroll, loading state, and success message do not overlap or overflow.

- [ ] **Step 5: Review the final diff against the design**

Verify that only role permissions persist, unchanged roles are not submitted, save is disabled while clean, failed saves retain edits, and user-list filters remain unchanged. Run `git diff --check` and inspect `git status --short` to ensure unrelated execution-module work remains unstaged.
