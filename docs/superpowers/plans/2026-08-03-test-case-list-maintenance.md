# Test Case List Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transient module-sidebar resizing plus visible edit and delete actions for all test case types.

**Architecture:** Keep list querying and mutations in `TestCasesPage`, extend the existing `PlatformService` boundary for update/delete parity, and extend `CaseDrawer` with an explicit edit mode. Reuse the in-progress `storageId` field as the backend resource identifier while preserving `id` as the displayed case code.

**Tech Stack:** React 18, TypeScript, Ant Design 6, Vitest, Testing Library, FastAPI-compatible JSON requests, CSS Grid

---

## File Map

- `frontend/src/services/contracts.ts`: mutation inputs and public service methods.
- `frontend/src/services/mockPlatformService.ts`: in-memory update/delete behavior and storage IDs for created records.
- `frontend/src/services/apiPlatformService.ts`: PUT/DELETE request mapping to the existing backend endpoints.
- `frontend/src/services/mockPlatformService.test.ts`: public mock-service mutation behavior.
- `frontend/src/services/apiPlatformService.test.ts`: backend request and response mapping.
- `frontend/src/pages/test-cases/components/CaseDrawer.tsx`: create/edit form modes and mutation error handling.
- `frontend/src/pages/test-cases/TestCasesPage.tsx`: edit/delete state, fixed action column, list refresh, and resize state.
- `frontend/src/pages/test-cases/TestCasesPage.test.tsx`: page behavior through accessible user interactions.
- `frontend/src/pages/test-cases/test-cases.css`: three-column desktop grid, resize handle, action styling, and mobile fallback.

The service files already contain unrelated uncommitted execution work. Every commit below must stage only the hunks introduced by this plan and must leave those pre-existing changes unstaged.

### Task 1: Mock Service Update And Delete

**Files:**
- Modify: `frontend/src/services/contracts.ts`
- Modify: `frontend/src/services/mockPlatformService.ts`
- Test: `frontend/src/services/mockPlatformService.test.ts`

- [ ] **Step 1: Write failing mock-service mutation tests**

Append two public-interface tests:

```ts
it('更新用例后列表返回持久化字段', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const [record] = await service.listTestCases({ type: 'functional' });

  const updated = await service.updateTestCase(record.storageId, {
    moduleId: 'profile',
    name: '用户登录并进入资料页',
    priority: 'P2',
    status: '已通过',
  });

  expect(updated).toMatchObject({
    storageId: record.storageId,
    moduleId: 'profile',
    name: '用户登录并进入资料页',
    priority: 'P2',
    status: '已通过',
  });
  await expect(service.listTestCases({ keyword: '进入资料页' })).resolves.toHaveLength(1);
});

it('删除用例后列表不再返回该记录', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const [record] = await service.listTestCases({ type: 'functional' });

  await service.deleteTestCase(record.storageId);

  await expect(service.listTestCases({ keyword: record.id })).resolves.toHaveLength(0);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd frontend && npx vitest run src/services/mockPlatformService.test.ts
```

Expected: TypeScript/Vitest fails because `storageId` may be undefined and `PlatformService` has no `updateTestCase` or `deleteTestCase` methods.

- [ ] **Step 3: Add the mutation contract**

Make the existing identifier required and add the update input and methods:

```ts
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
  endpoint?: string;
  method?: HttpMethod;
  expectedStatus?: number;
}

export type UpdateTestCaseInput = Omit<CreateTestCaseInput, 'type'>;
```

Add these methods immediately after `createTestCase` in `PlatformService`:

```ts
updateTestCase(storageId: number, input: UpdateTestCaseInput): Promise<TestCaseRecord>;
deleteTestCase(storageId: number): Promise<void>;
```

- [ ] **Step 4: Implement minimal mock mutations**

Import `UpdateTestCaseInput`, assign a storage ID when creating, and add the methods after `createTestCase`:

```ts
async createTestCase(input: CreateTestCaseInput) {
  const storageId = caseSequence++;
  const created: TestCaseRecord = {
    ...input,
    storageId,
    id: `${input.type.toUpperCase()}-${storageId}`,
    creator: '江珊',
    maintainer: '江珊',
    updatedAt: '刚刚',
  };
  testCases = [created, ...testCases];
  return respond(created);
},

async updateTestCase(storageId: number, input: UpdateTestCaseInput) {
  const index = testCases.findIndex((testCase) => testCase.storageId === storageId);
  if (index === -1) throw new Error('测试用例不存在');
  const updated = { ...testCases[index], ...input, updatedAt: '刚刚' };
  testCases = testCases.map((testCase) =>
    testCase.storageId === storageId ? updated : testCase,
  );
  return respond(updated);
},

async deleteTestCase(storageId: number) {
  if (!testCases.some((testCase) => testCase.storageId === storageId)) {
    throw new Error('测试用例不存在');
  }
  testCases = testCases.filter((testCase) => testCase.storageId !== storageId);
  await respond(undefined);
},
```

- [ ] **Step 5: Run the focused mock-service tests**

Run:

```bash
cd frontend && npx vitest run src/services/mockPlatformService.test.ts
```

Expected: the focused tests pass. Continue immediately to Task 2, which completes the shared contract before the next repository-wide type check.

- [ ] **Step 6: Commit only Task 1 hunks after Task 2 restores type safety**

Do not commit yet because the shared contract deliberately makes Task 2 mandatory for a green checkpoint.

### Task 2: API Service Update And Delete

**Files:**
- Modify: `frontend/src/services/apiPlatformService.ts`
- Test: `frontend/src/services/apiPlatformService.test.ts`

- [ ] **Step 1: Write failing API adapter tests**

Add one test per HTTP operation:

```ts
test('updates a test case through its storage id', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/v1/test-cases/8');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      title: '刷新令牌成功',
      module_id: 'auth',
      priority: 'P1',
      status: '已通过',
      api_details: {
        url: '/api/token/refresh',
        method: 'POST',
        expected_code: 201,
      },
    });
    return jsonResponse({
      id: 8,
      code: 'API-000008',
      title: '刷新令牌成功',
      type: 'api',
      module_id: 'auth',
      priority: 'P1',
      status: '已通过',
      author_name: '江珊',
      updated_at: '2026-08-03T08:00:00Z',
      api_details: { url: '/api/token/refresh', method: 'POST', expected_code: 201 },
    });
  });
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  const updated = await service.updateTestCase(8, {
    name: '刷新令牌成功',
    moduleId: 'auth',
    priority: 'P1',
    status: '已通过',
    endpoint: '/api/token/refresh',
    method: 'POST',
    expectedStatus: 201,
  });

  expect(updated).toMatchObject({ storageId: 8, id: 'API-000008', status: '已通过' });
});

test('deletes a test case through its storage id', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/v1/test-cases/8');
    expect(init?.method).toBe('DELETE');
    return new Response(null, { status: 204 });
  });
  const service = createApiPlatformService({ baseUrl: '/api/v1', fetcher });

  await service.deleteTestCase(8);

  expect(fetcher).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the API adapter test and verify RED**

Run:

```bash
cd frontend && npx vitest run src/services/apiPlatformService.test.ts
```

Expected: FAIL because the API service has no mutation methods.

- [ ] **Step 3: Implement API request mapping**

Import `UpdateTestCaseInput` and add these methods after `createTestCase`:

```ts
async updateTestCase(storageId: number, input: UpdateTestCaseInput) {
  const updated = await request<ApiTestCase>(`/test-cases/${storageId}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: input.name,
      module_id: input.moduleId,
      priority: input.priority,
      status: input.status,
      api_details: input.endpoint
        ? {
            url: input.endpoint,
            method: input.method ?? 'POST',
            expected_code: input.expectedStatus ?? 200,
          }
        : undefined,
    }),
  });
  return mapCase(updated);
},

async deleteTestCase(storageId: number) {
  await request(`/test-cases/${storageId}`, { method: 'DELETE' });
},
```

- [ ] **Step 4: Run both service tests and type checking**

Run:

```bash
cd frontend && npx vitest run src/services/mockPlatformService.test.ts src/services/apiPlatformService.test.ts && npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the service slice**

Stage only the mutation-related hunks from these five files, verify the cached diff excludes execution work, then commit:

```bash
git diff --cached --check
git diff --cached --stat
git commit -m "feat: add test case mutation services"
```

### Task 3: Edit A Test Case From The Fixed Action Column

**Files:**
- Modify: `frontend/src/pages/test-cases/TestCasesPage.tsx`
- Modify: `frontend/src/pages/test-cases/components/CaseDrawer.tsx`
- Test: `frontend/src/pages/test-cases/TestCasesPage.test.tsx`

- [ ] **Step 1: Write a failing page-level edit test**

Append:

```ts
it('从固定操作列编辑功能用例并刷新列表', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');
  const list = await screen.findByRole('region', { name: '功能用例列表' });

  await user.click(within(list).getByRole('button', { name: '编辑用例 FUN-12583' }));
  const drawer = await screen.findByRole('dialog', { name: '编辑功能用例' });
  const nameInput = within(drawer).getByRole('textbox', { name: '用例名称' });
  expect(nameInput).toHaveValue('用户登录成功');

  await user.clear(nameInput);
  await user.type(nameInput, '用户登录并进入资料页');
  await user.click(within(drawer).getByRole('button', { name: '保存修改' }));

  expect(await within(list).findByText('用户登录并进入资料页')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: '编辑功能用例' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the page test and verify RED**

Run:

```bash
cd frontend && npx vitest run src/pages/test-cases/TestCasesPage.test.tsx
```

Expected: FAIL because no edit button exists.

- [ ] **Step 3: Extend `CaseDrawer` with edit mode**

Add props and form fields:

```ts
interface CaseDrawerProps {
  type: TestCaseType;
  open: boolean;
  defaultModule: string;
  editingCase?: TestCaseRecord | null;
  onClose: () => void;
  onSubmit: (input: CreateTestCaseInput) => Promise<TestCaseRecord>;
  onUpdate: (input: UpdateTestCaseInput) => Promise<TestCaseRecord>;
}

interface CaseFormValues {
  name: string;
  moduleId: string;
  priority: CreateTestCaseInput['priority'];
  status?: TestCaseStatus;
  endpoint?: string;
  method?: CreateTestCaseInput['method'];
  expectedStatus?: number;
  headers?: Array<{ key?: string; value?: string }>;
  requestBody?: string;
  assertions?: string;
  precondition?: string;
  steps?: string;
  expected?: string;
  pageUrl?: string;
  selector?: string;
  environment?: string;
}
```

When opening, reset and set either record values or create defaults:

```ts
const isEditing = Boolean(editingCase);
const title = `${isEditing ? '编辑' : '新建'}${typeLabels[type]}`;

useEffect(() => {
  if (!open) return;
  form.resetFields();
  form.setFieldsValue(
    editingCase
      ? {
          name: editingCase.name,
          moduleId: editingCase.moduleId,
          priority: editingCase.priority,
          status: editingCase.status,
          endpoint: editingCase.endpoint,
          method: editingCase.method,
          expectedStatus: editingCase.expectedStatus,
        }
      : {
          moduleId: defaultModule === 'all' ? 'auth' : defaultModule,
          priority: 'P1',
          method: 'POST',
          expectedStatus: 200,
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          environment: '测试环境',
        },
  );
}, [defaultModule, editingCase, form, open]);
```

Add `const [submitting, setSubmitting] = useState(false);`, then branch submission and keep the drawer open on failure:

```ts
setSubmitting(true);
try {
  const saved = editingCase
    ? await onUpdate({
        moduleId: values.moduleId,
        name: values.name,
        priority: values.priority,
        status: values.status ?? editingCase.status,
        endpoint: type === 'api' ? values.endpoint : undefined,
        method: type === 'api' ? values.method : undefined,
        expectedStatus: type === 'api' ? values.expectedStatus : undefined,
      })
    : await onSubmit({
        type,
        moduleId: values.moduleId,
        name: values.name,
        priority: values.priority,
        status: '维护中',
        endpoint: type === 'api' ? values.endpoint : undefined,
        method: type === 'api' ? values.method : undefined,
        expectedStatus: type === 'api' ? values.expectedStatus ?? 200 : undefined,
      });
  form.resetFields();
  onClose();
  void message.success(`${typeLabels[type]}已${editingCase ? '更新' : '创建'}：${saved.name}`);
} catch (error) {
  void message.error(error instanceof Error ? error.message : `${typeLabels[type]}保存失败`);
} finally {
  setSubmitting(false);
}
```

Import `InputNumber` and render the persisted edit fields with these exact controls:

```tsx
{isEditing ? (
  <Form.Item name="status" label="状态" rules={[{ required: true }]}>
    <Select
      id="case-status-select"
      options={['维护中', '已通过', '草稿', '已失败', '已停用'].map((value) => ({
        value,
        label: value,
      }))}
    />
  </Form.Item>
) : null}

{type === 'api' ? (
  <Form.Item
    name="expectedStatus"
    label="预期状态"
    rules={[{ required: true, message: '请输入预期状态码' }]}
  >
    <InputNumber min={100} max={599} precision={0} />
  </Form.Item>
) : null}
```

Change the three current creation-only conditional expressions without changing their child JSX:

- API request headers, body, and assertions: `type === 'api' && !isEditing`.
- Functional precondition, steps, and expected result: `type === 'functional' && !isEditing`.
- UI page URL, selector, and environment: `type === 'ui' && !isEditing`.

Set the footer primary button to:

```tsx
<Button type="primary" loading={submitting} onClick={() => form.submit()}>
  {isEditing ? '保存修改' : '创建用例'}
</Button>
```

- [ ] **Step 4: Add page edit state and fixed edit action**

Import `EditOutlined`, `Tooltip`, and `UpdateTestCaseInput`. Add `editingCase` state and an edit handler:

```ts
const [editingCase, setEditingCase] = useState<TestCaseRecord | null>(null);

const updateCase = async (input: UpdateTestCaseInput) => {
  if (!editingCase) throw new Error('未选择要编辑的测试用例');
  const updated = await service.updateTestCase(editingCase.storageId, input);
  setRows(await service.listTestCases(query));
  return updated;
};
```

Append the fixed action column after status:

```tsx
{
  title: '操作',
  key: 'actions',
  width: 48,
  fixed: 'right',
  render: (_, record) => (
    <div className="case-row-actions">
      <Tooltip title="编辑">
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          aria-label={`编辑用例 ${record.id}`}
          onClick={() => setEditingCase(record)}
        />
      </Tooltip>
    </div>
  ),
}
```

Pass `editingCase`, `onUpdate`, and a close callback that clears edit state to `CaseDrawer`. Increase the table scroll width by 48 pixels. Task 4 expands this same column with the delete action.

- [ ] **Step 5: Run the focused page test and type checking**

Run:

```bash
cd frontend && npx vitest run src/pages/test-cases/TestCasesPage.test.tsx && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the edit slice**

```bash
git add frontend/src/pages/test-cases/TestCasesPage.tsx frontend/src/pages/test-cases/components/CaseDrawer.tsx frontend/src/pages/test-cases/TestCasesPage.test.tsx
git diff --cached --check
git commit -m "feat: edit test cases from list"
```

### Task 4: Confirm And Delete A Test Case

**Files:**
- Modify: `frontend/src/pages/test-cases/TestCasesPage.tsx`
- Test: `frontend/src/pages/test-cases/TestCasesPage.test.tsx`

- [ ] **Step 1: Write the failing delete-flow test**

```ts
it('确认后删除功能用例并刷新列表', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');
  const list = await screen.findByRole('region', { name: '功能用例列表' });

  await user.click(within(list).getByRole('button', { name: '删除用例 FUN-12583' }));
  const confirmation = await screen.findByRole('dialog', { name: '删除用例' });
  expect(within(confirmation).getByText(/FUN-12583/)).toBeInTheDocument();
  expect(within(confirmation).getByText(/用户登录成功/)).toBeInTheDocument();

  await user.click(within(confirmation).getByRole('button', { name: '删除' }));

  await waitFor(() => {
    expect(within(list).queryByText('FUN-12583')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend && npx vitest run src/pages/test-cases/TestCasesPage.test.tsx -t '确认后删除功能用例'
```

Expected: FAIL because the delete action does not open a confirmation dialog.

- [ ] **Step 3: Implement confirmed deletion and failure handling**

Import `DeleteOutlined`, use Ant Design app messages, and add mutation state:

```ts
const { message } = App.useApp();
const [caseToDelete, setCaseToDelete] = useState<TestCaseRecord | null>(null);
const [deleting, setDeleting] = useState(false);

const deleteCase = async () => {
  if (!caseToDelete) return;
  setDeleting(true);
  try {
    await service.deleteTestCase(caseToDelete.storageId);
    setRows(await service.listTestCases(query));
    void message.success(`测试用例已删除：${caseToDelete.name}`);
    setCaseToDelete(null);
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '测试用例删除失败');
  } finally {
    setDeleting(false);
  }
};
```

Add this button beside the edit button in the existing `case-row-actions` container, then increase the action column and table scroll widths by another 40 pixels:

```tsx
<Tooltip title="删除">
  <Button
    danger
    type="text"
    size="small"
    icon={<DeleteOutlined />}
    aria-label={`删除用例 ${record.id}`}
    onClick={() => setCaseToDelete(record)}
  />
</Tooltip>
```

Render the confirmation after the drawer:

```tsx
<Modal
  title="删除用例"
  open={Boolean(caseToDelete)}
  okText="删除"
  cancelText="取消"
  okButtonProps={{ danger: true, loading: deleting, 'aria-label': '删除' }}
  cancelButtonProps={{ disabled: deleting, 'aria-label': '取消' }}
  closable={!deleting}
  maskClosable={!deleting}
  onOk={() => void deleteCase()}
  onCancel={() => setCaseToDelete(null)}
>
  <p>
    确定删除用例 {caseToDelete?.id}「{caseToDelete?.name}」吗？删除后无法恢复。
  </p>
</Modal>
```

- [ ] **Step 4: Run focused and full page tests**

Run:

```bash
cd frontend && npx vitest run src/pages/test-cases/TestCasesPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the delete slice**

```bash
git add frontend/src/pages/test-cases/TestCasesPage.tsx frontend/src/pages/test-cases/TestCasesPage.test.tsx
git diff --cached --check
git commit -m "feat: delete test cases from list"
```

### Task 5: Resize The Module Sidebar

**Files:**
- Modify: `frontend/src/pages/test-cases/TestCasesPage.tsx`
- Modify: `frontend/src/pages/test-cases/test-cases.css`
- Test: `frontend/src/pages/test-cases/TestCasesPage.test.tsx`

- [ ] **Step 1: Write failing pointer and keyboard resize tests**

```ts
it('桌面模块侧栏支持拖拽和键盘调整宽度', async () => {
  renderApp('/test-cases/functional');
  const handle = await screen.findByRole('separator', { name: '调整模块侧栏宽度' });
  const layout = handle.parentElement as HTMLElement;
  expect(layout.style.getPropertyValue('--case-sidebar-width')).toBe('248px');

  fireEvent.pointerDown(handle, { clientX: 248 });
  fireEvent.pointerMove(window, { clientX: 338 });
  fireEvent.pointerUp(window);
  expect(layout.style.getPropertyValue('--case-sidebar-width')).toBe('338px');

  fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  expect(layout.style.getPropertyValue('--case-sidebar-width')).toBe('330px');
});

it('模块侧栏宽度被限制在可用范围内', async () => {
  renderApp('/test-cases/functional');
  const handle = await screen.findByRole('separator', { name: '调整模块侧栏宽度' });
  const layout = handle.parentElement as HTMLElement;

  fireEvent.pointerDown(handle, { clientX: 248 });
  fireEvent.pointerMove(window, { clientX: 900 });
  fireEvent.pointerUp(window);

  expect(layout.style.getPropertyValue('--case-sidebar-width')).toBe('420px');
});
```

- [ ] **Step 2: Run resize tests and verify RED**

Run:

```bash
cd frontend && npx vitest run src/pages/test-cases/TestCasesPage.test.tsx -t '模块侧栏'
```

Expected: FAIL because there is no separator.

- [ ] **Step 3: Implement transient resize state**

Import `CSSProperties`, `KeyboardEvent`, and `useRef`. Add constants, state, global pointer listeners, and keyboard handling:

```ts
const DEFAULT_SIDEBAR_WIDTH = 248;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 420;
const clampSidebarWidth = (width: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
const resizeStart = useRef<{ x: number; width: number } | null>(null);

useEffect(() => {
  const move = (event: PointerEvent) => {
    if (!resizeStart.current) return;
    setSidebarWidth(
      clampSidebarWidth(resizeStart.current.width + event.clientX - resizeStart.current.x),
    );
  };
  const stop = () => {
    resizeStart.current = null;
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
  return () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
}, []);

const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  setSidebarWidth((width) =>
    clampSidebarWidth(width + (event.key === 'ArrowRight' ? 8 : -8)),
  );
};
```

Set the CSS variable on the existing layout element:

```tsx
<div
  className="test-cases-layout"
  style={{ '--case-sidebar-width': `${sidebarWidth}px` } as CSSProperties}
>
```

Then insert this handle immediately after the current `ModuleTreePanel` and before the current `case-list-panel` sibling:

```tsx
<div
  className="case-sidebar-resizer"
  role="separator"
  aria-label="调整模块侧栏宽度"
  aria-orientation="vertical"
  aria-valuemin={MIN_SIDEBAR_WIDTH}
  aria-valuemax={MAX_SIDEBAR_WIDTH}
  aria-valuenow={sidebarWidth}
  tabIndex={0}
  onPointerDown={(event) => {
    event.preventDefault();
    resizeStart.current = { x: event.clientX, width: sidebarWidth };
  }}
  onKeyDown={resizeWithKeyboard}
/>
```

- [ ] **Step 4: Style the resize handle and mobile fallback**

```css
.test-cases-layout {
  display: grid;
  grid-template-columns: var(--case-sidebar-width, 248px) 5px minmax(0, 1fr);
}

.module-panel {
  border-right: 0;
}

.case-sidebar-resizer {
  position: relative;
  z-index: 1;
  width: 5px;
  background: var(--border);
  cursor: col-resize;
  touch-action: none;
}

.case-sidebar-resizer::after {
  position: absolute;
  inset: 0 -3px;
  content: '';
}

.case-sidebar-resizer:hover,
.case-sidebar-resizer:focus-visible {
  outline: 0;
  background: var(--primary);
}

.case-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

@media (max-width: 900px) {
  .test-cases-layout {
    grid-template-columns: 1fr;
  }

  .case-sidebar-resizer {
    display: none;
  }
}
```

- [ ] **Step 5: Run page tests and type checking**

Run:

```bash
cd frontend && npx vitest run src/pages/test-cases/TestCasesPage.test.tsx && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the resize slice**

```bash
git add frontend/src/pages/test-cases/TestCasesPage.tsx frontend/src/pages/test-cases/test-cases.css frontend/src/pages/test-cases/TestCasesPage.test.tsx
git diff --cached --check
git commit -m "feat: resize test case module sidebar"
```

### Task 6: Full Verification And Visual QA

**Files:**
- Verify: all frontend files changed above

- [ ] **Step 1: Run the full frontend verification suite**

Run:

```bash
cd frontend && npm run typecheck && npm test && npm run build
```

Expected: all commands exit 0 without warnings caused by this change.

- [ ] **Step 2: Start or reuse the local application**

Confirm `http://127.0.0.1:56789/test-cases/functional` loads. If the existing server is unavailable, start the configured frontend and backend servers on free ports and record their URLs.

- [ ] **Step 3: Verify desktop interactions in a real browser**

At 1440x900:

- Drag the module separator from 248 pixels toward 360 pixels and confirm the table receives the remaining width without overlap.
- Use Left/Right Arrow while the separator is focused and confirm 8-pixel adjustments.
- Confirm each row shows fixed edit/delete icons with tooltips.
- Edit `FUN-12583`, save a changed name, and confirm the filtered list refreshes.
- Delete the edited record, cancel once, then confirm once, and verify removal.
- Capture a screenshot after resizing and after opening the edit drawer.

- [ ] **Step 4: Verify mobile layout**

At 390x844, confirm the module panel stacks above the list, the separator is hidden, action buttons remain reachable through horizontal table scrolling, and no text or controls overlap. Capture a screenshot.

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git log --oneline -6
```

Expected: no whitespace errors; unrelated pre-existing work remains intact and unstaged.

- [ ] **Step 6: Run the required two-axis code review**

Use the design spec `docs/superpowers/specs/2026-08-03-test-case-list-maintenance-design.md` as the Spec source and the pre-implementation commit as the fixed point. Run Standards and Spec review in parallel, fix all confirmed findings through new red-green slices, and rerun the full verification command.
