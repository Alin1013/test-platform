# Persistent Account Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a registration modal to the login page backed by a persistent SQLite account-creation API, and make the frontend authentication flow use the same backend boundary.

**Architecture:** Add a public `POST /api/v1/auth/register` endpoint that creates an enabled test-engineer user with normalized account/email values. Keep HTTP transport in a focused frontend auth client; `AuthContext` owns user/session state and accepts a memory client in tests, while the application uses the API client in development.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, SQLite, React 18, TypeScript, Ant Design, Vitest, Testing Library, pytest, Playwright.

---

### Task 1: Add the backend registration contract and service

**Files:**
- Modify: `backend/app/auth_schemas.py`
- Modify: `backend/app/services/auth.py`
- Modify: `backend/app/routers/auth.py`
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: Write the failing HTTP tests**

Add tests at the end of `backend/tests/test_auth.py` that exercise only the public API:

```python
def test_user_can_register_and_login(client: TestClient) -> None:
    registered = client.post(
        "/api/v1/auth/register",
        json={
            "account": "  new.tester ",
            "name": "新测试员",
            "email": "New.Tester@Example.com",
            "password": "Register123",
        },
    )

    assert registered.status_code == 201
    assert registered.json()["user"]["account"] == "new.tester"
    assert registered.json()["user"]["email"] == "new.tester@example.com"
    assert registered.json()["user"]["role"] == "测试工程师"
    assert registered.json()["user"]["department"] == "质量保障部"

    login = client.post(
        "/api/v1/auth/login",
        json={"account": "new.tester", "password": "Register123"},
    )
    assert login.status_code == 200


def test_registration_rejects_duplicate_account_or_email(client: TestClient) -> None:
    payload = {
        "account": "newtester",
        "name": "新测试员",
        "email": "newtester@example.com",
        "password": "Register123",
    }
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201

    duplicate_account = client.post(
        "/api/v1/auth/register",
        json={**payload, "email": "another@example.com"},
    )
    duplicate_email = client.post(
        "/api/v1/auth/register",
        json={**payload, "account": "another"},
    )
    assert duplicate_account.status_code == 409
    assert duplicate_email.status_code == 409
    assert duplicate_account.json()["detail"] == "Account or email already exists"


def test_registration_rejects_invalid_fields(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "account": "bad account",
            "name": "测试员",
            "email": "not-an-email",
            "password": "short",
        },
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Run the focused tests and verify the expected red failure**

Run `./.venv/bin/pytest backend/tests/test_auth.py -q` from the repository root. Expect the new tests to fail because `/register` does not exist, while the existing authentication tests remain green.

- [ ] **Step 3: Add the minimal request/response schemas and service**

Define `RegisterRequest` with `extra="forbid"`, account pattern `^[A-Za-z0-9_.-]+$`, name/email/password bounds, and `RegisterResponse` containing `user: AuthUserResponse`. Add `register(session, payload)` in `auth.py`; normalize account/email, load role `测试工程师`, create an enabled `User` with department `质量保障部` and `hash_password(payload.password)`, commit, and translate `IntegrityError` to `HTTPException(409, "Account or email already exists")`.

- [ ] **Step 4: Expose `POST /api/v1/auth/register`**

Import the new schemas in `backend/app/routers/auth.py` and add a route with `status_code=201` and `response_model=RegisterResponse` that returns `auth.register(session, payload)`.

- [ ] **Step 5: Run the focused tests and verify green**

Run `./.venv/bin/pytest backend/tests/test_auth.py -q`; expect all auth tests to pass.

### Task 2: Define the frontend auth transport boundary

**Files:**
- Create: `frontend/src/services/authClient.ts`
- Create: `frontend/src/services/authClient.test.ts`

- [ ] **Step 1: Write the failing transport tests**

Test `createApiAuthClient({ baseUrl, fetcher })` through a fake `Response` boundary. Assert register sends `POST /auth/register`, JSON content type, exact normalized request payload, maps the returned user, and converts a 409 body into an `Error` with `Account or email already exists`.

- [ ] **Step 2: Run the focused tests and verify red**

Run `npm test -- src/services/authClient.test.ts` from `frontend/`. Expect an import or missing-function failure because the client does not exist.

- [ ] **Step 3: Implement the client interfaces and API client**

Define `AuthClient`, `RegisterInput`, `AuthUserResponse`, and `AuthSession`. Implement a shared request helper that adds JSON headers, parses FastAPI `detail`, and returns typed JSON. Implement `login`, `register`, `logout`, and `updateProfile`; map backend user data to the existing `AuthUser` shape and preserve the bearer token for authenticated requests.

- [ ] **Step 4: Add a deterministic in-memory client for tests**

Implement `createMemoryAuthClient()` with the existing `jiangshan / Test1234` account, mutable registered profiles, synchronous-looking Promise methods, and the same public `AuthClient` interface. Registration must reject duplicate account/email values with the same error text.

- [ ] **Step 5: Run the focused client tests and verify green**

Run `npm test -- src/services/authClient.test.ts` and confirm all transport and error-mapping assertions pass.

### Task 3: Migrate `AuthContext` to the auth client without breaking existing flows

**Files:**
- Modify: `frontend/src/services/AuthContext.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/AppShell.tsx`
- Modify: `frontend/src/pages/settings/SettingsPage.tsx`
- Modify: `frontend/src/pages/settings/SettingsPage.test.tsx`

- [ ] **Step 1: Write the failing context behavior test**

Extend the auth/login tests with a registration flow that creates an account through the context, then logs in using that account. Use the injected memory client so the test observes the public context methods rather than internal state.

- [ ] **Step 2: Run the focused test and verify red**

Run `npm test -- src/pages/login/LoginPage.test.tsx`; expect a type or behavior failure because `AuthContext` currently exposes synchronous login and no register method.

- [ ] **Step 3: Implement injectable async context state**

Add `client?: AuthClient` to `AuthProvider`; default to the API client when `VITE_API_BASE_URL` is set and the memory client in Vitest. Expose `login`, `register`, `logout`, and `updateProfile` as Promise-based methods, keep the current user in state, and retain the API bearer token internally. `updateProfile` must return `passwordChanged` so settings can preserve its existing redirect behavior.

- [ ] **Step 4: Update consumers for async methods**

Await `login` in `LoginPage`, await `logout` before clearing/navigation where appropriate, and await `updateProfile` in `SettingsPage`. Keep existing UI copy and successful password-change redirect semantics.

- [ ] **Step 5: Run the focused login/settings tests and verify green**

Run `npm test -- src/pages/login/LoginPage.test.tsx src/pages/settings/SettingsPage.test.tsx` and confirm all existing auth/profile flows pass with the memory client.

### Task 4: Add the registration modal and login-page behavior

**Files:**
- Modify: `frontend/src/pages/login/LoginPage.tsx`
- Modify: `frontend/src/pages/login/login.css`
- Modify: `frontend/src/pages/login/LoginPage.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

Add tests for: the bottom “立即注册” button opens a dialog; invalid confirmation password shows `两次输入的密码不一致`; successful registration closes the dialog, fills the login account, and shows `注册成功，请登录`; duplicate registration keeps the dialog open and shows `账号或邮箱已存在`.

- [ ] **Step 2: Run the focused tests and verify red**

Run `npm test -- src/pages/login/LoginPage.test.tsx`; expect failures because no register button, modal, or context register action exists.

- [ ] **Step 3: Implement the modal and form**

Add `RegisterFormValues`, modal state, registration error/success state, and a `Form` with account/name/email/password/confirm fields. Add the secondary button below the login form, use `Modal` with stable width and responsive CSS, and keep modal submission loading local to the registration action.

- [ ] **Step 4: Connect success and error behavior**

Call `register`, close/reset on success, set login form account with `form.setFieldsValue`, and display the agreed copy. On failure, keep the modal open and show the error inside it without clearing fields.

- [ ] **Step 5: Run the focused UI tests and verify green**

Run `npm test -- src/pages/login/LoginPage.test.tsx`; confirm all new and existing login tests pass.

### Task 5: Full verification and browser acceptance

**Files:**
- Modify: `frontend/e2e/app.spec.ts` only if the existing authenticated setup needs an explicit registration assertion.

- [ ] **Step 1: Run all backend tests**

Run `./.venv/bin/pytest` from the worktree root and confirm zero failures.

- [ ] **Step 2: Run all frontend tests and static checks**

From `frontend/`, run `npm test`, `npm run typecheck`, and `npm run build`; confirm each exits with code 0.

- [ ] **Step 3: Start the backend and frontend development servers**

Run the backend on port 8000 and the frontend on port 56789 with `VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1`, using another port only if either port is occupied.

- [ ] **Step 4: Verify the real browser flow**

Open `/login`, click “立即注册”, verify the modal at desktop and mobile sizes, register a unique account, verify success feedback and account prefill, then log in with the new account. Confirm the browser reaches `/dashboard` and no console-visible request errors occur.

- [ ] **Step 5: Review the complete diff and commit implementation**

Run `git diff --check`, inspect `git diff main...HEAD`, and commit only implementation files and tests with `feat: add persistent account registration`.
