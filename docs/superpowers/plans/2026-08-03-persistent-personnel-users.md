# Persistent Personnel Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the personnel list load registered and seeded users from the shared SQLite `users` table in development and production, while preserving an in-memory service for tests.

**Architecture:** Keep registration and personnel listing behind their existing HTTP boundaries. Add a focused frontend factory that selects the API service in development/production and the mock service in tests, then make `PlatformServiceProvider` consume that factory. Do not merge API and mock results or add live synchronization.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, React 18, TypeScript, Vite, Vitest, Testing Library

---

## File Map

- Modify `backend/tests/test_auth.py`: lock the existing cross-endpoint contract that a registered user appears with seeded users in the personnel list.
- Create `frontend/src/services/configuredPlatformService.ts`: own environment-based `PlatformService` selection and its default API URL.
- Create `frontend/src/services/configuredPlatformService.test.ts`: verify API selection, URL override, and test-mode mock behavior.
- Modify `frontend/src/services/PlatformServiceContext.tsx`: inject the configured default service without changing the provider interface.
- Modify `README.md`: document the new development/production default and test-only mock behavior.

At execution start, record the review fixed point:

```bash
git rev-parse HEAD
```

Use that printed commit as the fixed point for the final two-axis code review.

### Task 1: Lock the Shared Backend User Contract

**Files:**
- Modify: `backend/tests/test_auth.py:177-200`
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: Add the public HTTP characterization test**

Add this test after `test_user_can_register_and_login`:

```python
def test_registered_user_appears_with_existing_personnel(client: TestClient) -> None:
    registered = client.post(
        "/api/v1/auth/register",
        json={
            "account": "visible.tester",
            "name": "列表可见用户",
            "email": "visible.tester@example.com",
            "password": "Register123",
        },
    )

    response = client.get("/api/v1/users", params={"page_size": 100})

    assert registered.status_code == 201
    assert response.status_code == 200
    accounts = [user["account"] for user in response.json()["items"]]
    assert accounts[0] == "visible.tester"
    assert "jiangshan" in accounts
```

- [ ] **Step 2: Run the characterization test**

Run from the repository root:

```bash
./.venv/bin/pytest backend/tests/test_auth.py::test_registered_user_appears_with_existing_personnel -q
```

Expected: PASS. The backend already uses the shared `users` table; this test locks that behavior before the frontend fix and intentionally requires no backend production change.

- [ ] **Step 3: Run the focused backend authentication suite**

```bash
./.venv/bin/pytest backend/tests/test_auth.py -q
```

Expected: all authentication tests pass.

- [ ] **Step 4: Commit the backend contract test**

```bash
git add backend/tests/test_auth.py
git commit -m "test: cover registered users in personnel list"
```

### Task 2: Select the Persistent Platform Service by Environment

**Files:**
- Create: `frontend/src/services/configuredPlatformService.test.ts`
- Create: `frontend/src/services/configuredPlatformService.ts`
- Test: `frontend/src/services/configuredPlatformService.test.ts`

- [ ] **Step 1: Write the failing development-mode API selection test**

Create `frontend/src/services/configuredPlatformService.test.ts` with:

```typescript
import { createConfiguredPlatformService } from './configuredPlatformService';

function userPageResponse() {
  return new Response(
    JSON.stringify({
      items: [
        {
          id: 4,
          name: '列表可见用户',
          email: 'visible.tester@example.com',
          department: '质量保障部',
          role: '测试工程师',
          enabled: true,
        },
      ],
      total: 1,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

test('development uses the persistent API default and respects an explicit base URL', async () => {
  const fetcher = vi.fn(async () => userPageResponse());
  const defaultService = createConfiguredPlatformService({
    apiBaseUrl: '',
    mode: 'development',
    fetcher,
  });

  await expect(defaultService.listUsers()).resolves.toEqual([
    expect.objectContaining({ name: '列表可见用户' }),
  ]);
  expect(fetcher).toHaveBeenLastCalledWith(
    'http://127.0.0.1:8000/api/v1/users?page_size=100',
    expect.any(Object),
  );

  fetcher.mockClear();
  const configuredService = createConfiguredPlatformService({
    apiBaseUrl: 'http://localhost:9000/custom/',
    mode: 'development',
    fetcher,
  });
  await configuredService.listUsers();

  expect(fetcher).toHaveBeenLastCalledWith(
    'http://localhost:9000/custom/users?page_size=100',
    expect.any(Object),
  );
});
```

- [ ] **Step 2: Run the test and verify the red state**

```bash
npm --prefix frontend test -- src/services/configuredPlatformService.test.ts
```

Expected: FAIL because `./configuredPlatformService` does not exist.

- [ ] **Step 3: Add the minimal development/production implementation**

Create `frontend/src/services/configuredPlatformService.ts`:

```typescript
import { createApiPlatformService } from './apiPlatformService';
import type { PlatformService } from './contracts';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ConfiguredPlatformServiceOptions {
  apiBaseUrl?: string;
  mode: string;
  fetcher?: Fetcher;
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

export function createConfiguredPlatformService(
  options: ConfiguredPlatformServiceOptions,
): PlatformService {
  return createApiPlatformService({
    baseUrl: options.apiBaseUrl?.trim() || DEFAULT_API_BASE_URL,
    fetcher: options.fetcher,
  });
}
```

- [ ] **Step 4: Run the development-mode test and verify green**

```bash
npm --prefix frontend test -- src/services/configuredPlatformService.test.ts
```

Expected: 1 test passes and both default/configured URL assertions pass.

- [ ] **Step 5: Lock API failures as real loading failures**

Append to `configuredPlatformService.test.ts`:

```typescript
test('development surfaces API failures instead of falling back to mock users', async () => {
  const service = createConfiguredPlatformService({
    apiBaseUrl: '',
    mode: 'development',
    fetcher: vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'backend unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  });

  await expect(service.listUsers()).rejects.toThrow('backend unavailable');
});
```

- [ ] **Step 6: Run the API failure test**

```bash
npm --prefix frontend test -- src/services/configuredPlatformService.test.ts
```

Expected: 2 tests pass. The existing API request helper already propagates the backend error, so no production change is required for this contract.

- [ ] **Step 7: Add the failing test-mode memory-service test**

Append to `configuredPlatformService.test.ts`:

```typescript
test('test mode uses memory users without making a network request', async () => {
  const fetcher = vi.fn(async () => {
    throw new Error('network should not be called');
  });
  const service = createConfiguredPlatformService({
    apiBaseUrl: '',
    mode: 'test',
    fetcher,
  });

  await expect(service.listUsers()).resolves.toEqual([
    expect.objectContaining({ name: '江珊' }),
    expect.objectContaining({ name: '林然' }),
  ]);
  expect(fetcher).not.toHaveBeenCalled();
});
```

- [ ] **Step 8: Run the test and verify the second red state**

```bash
npm --prefix frontend test -- src/services/configuredPlatformService.test.ts
```

Expected: the development test passes; the test-mode case fails with `network should not be called` because the factory still always selects the API service.

- [ ] **Step 9: Add the minimal test-mode branch**

Update `configuredPlatformService.ts`:

```typescript
import { createApiPlatformService } from './apiPlatformService';
import type { PlatformService } from './contracts';
import { createMockPlatformService } from './mockPlatformService';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ConfiguredPlatformServiceOptions {
  apiBaseUrl?: string;
  mode: string;
  fetcher?: Fetcher;
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

export function createConfiguredPlatformService({
  apiBaseUrl,
  mode,
  fetcher,
}: ConfiguredPlatformServiceOptions): PlatformService {
  if (mode === 'test') return createMockPlatformService({ delay: 0 });
  return createApiPlatformService({
    baseUrl: apiBaseUrl?.trim() || DEFAULT_API_BASE_URL,
    fetcher,
  });
}
```

- [ ] **Step 10: Run the configured service tests and typecheck**

```bash
npm --prefix frontend test -- src/services/configuredPlatformService.test.ts
npm --prefix frontend run typecheck
```

Expected: 3 tests pass and TypeScript exits 0.

- [ ] **Step 11: Commit the configured service factory**

```bash
git add frontend/src/services/configuredPlatformService.ts frontend/src/services/configuredPlatformService.test.ts
git commit -m "feat: configure persistent platform service"
```

### Task 3: Wire the Provider and Document the Runtime Contract

**Files:**
- Modify: `frontend/src/services/PlatformServiceContext.tsx:1-10`
- Modify: `README.md:125`
- Test: `frontend/src/services/PlatformServiceContext.test.tsx`

- [ ] **Step 1: Replace the module-level default service selection**

Replace the imports and `defaultService` declaration at the top of `PlatformServiceContext.tsx` with:

```typescript
import { createContext, type ReactNode, useContext } from 'react';
import { createConfiguredPlatformService } from './configuredPlatformService';
import type { PlatformService } from './contracts';

const PlatformServiceContext = createContext<PlatformService | null>(null);
const defaultService = createConfiguredPlatformService({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  mode: import.meta.env.MODE,
});
```

Keep `PlatformServiceProvider` and `usePlatformService()` unchanged so tests and pages can still inject a service explicitly.

- [ ] **Step 2: Run focused provider and personnel tests**

```bash
npm --prefix frontend test -- src/services/configuredPlatformService.test.ts src/services/PlatformServiceContext.test.tsx src/pages/personnel/PersonnelPage.test.tsx
```

Expected: configured service, provider injection, and personnel interactions all pass without a running backend because Vitest uses `mode === "test"` or injects a mock.

- [ ] **Step 3: Update the documented service selection contract**

Replace README line 125 with:

```markdown
`PlatformServiceContext` 负责向页面注入具体服务。开发和生产环境默认使用 `http://127.0.0.1:8000/api/v1`，设置 `VITE_API_BASE_URL` 时使用配置地址；Vitest 测试环境使用内存 Mock，页面层不依赖具体传输协议。
```

- [ ] **Step 4: Run frontend typecheck again**

```bash
npm --prefix frontend run typecheck
```

Expected: TypeScript exits 0.

- [ ] **Step 5: Commit provider wiring and documentation**

```bash
git add frontend/src/services/PlatformServiceContext.tsx README.md
git commit -m "fix: load personnel users from persistent API"
```

### Task 4: Verify the Full Workflow and Review the Diff

**Files:**
- Verify: `backend/tests/test_auth.py`
- Verify: `frontend/src/services/configuredPlatformService.ts`
- Verify: `frontend/src/services/PlatformServiceContext.tsx`
- Verify: `README.md`

- [ ] **Step 1: Run all automated verification**

From the repository root:

```bash
./.venv/bin/pytest -q
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff "$(git merge-base HEAD main)"...HEAD --check
```

Expected: backend and frontend tests pass, typecheck/build exit 0, and `git diff --check` emits no output. The existing Vite chunk-size warning is non-blocking.

- [ ] **Step 2: Re-run the original provider repro**

Start the backend and frontend in separate terminals without setting `VITE_API_BASE_URL`:

```bash
./.venv/bin/uvicorn backend.app.main:app --reload --port 8000
npm --prefix frontend run dev -- --host 127.0.0.1 --port 56789
```

Register account `personnel.visible.803` through `/login` with name `列表持久化用户`, email `personnel.visible.803@example.com`, and password `Register123`. Reload, log in, and enter `/personnel`. Confirm the new account and seeded accounts are visible. Reload `/personnel` once and confirm the same rows remain.

- [ ] **Step 3: Verify the API and SQLite row**

```bash
curl -sS 'http://127.0.0.1:8000/api/v1/users?page_size=100'
sqlite3 -header -column backend/test_platform.db "SELECT id, account, name, email, status FROM users WHERE account = 'personnel.visible.803';"
```

Expected: both commands include the registered account, while the API response also includes seeded users.

- [ ] **Step 4: Run the two-axis code review**

Invoke `/code-review` with the commit printed at execution start as the fixed point and this spec:

```text
docs/superpowers/specs/2026-08-03-persistent-personnel-users-design.md
```

Address Standards and Spec findings one at a time, rerunning the focused test for every review fix.

- [ ] **Step 5: Commit any review fixes**

If review changes were required, stage only their exact files and commit:

```bash
git add README.md \
  backend/tests/test_auth.py \
  frontend/src/services/PlatformServiceContext.tsx \
  frontend/src/services/configuredPlatformService.ts \
  frontend/src/services/configuredPlatformService.test.ts
git commit -m "fix: address persistent personnel review findings"
```

If the review found no required changes, do not create an empty commit.

- [ ] **Step 6: Run fresh completion verification**

```bash
./.venv/bin/pytest -q
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run build
git status --short --branch
```

Expected: all checks pass and the feature branch has no uncommitted changes.
