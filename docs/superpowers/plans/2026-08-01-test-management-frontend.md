# 测试管理平台前端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在独立的 `frontend/` 目录中交付一个中文、响应式、可完整操作的测试管理平台前端原型。

**Architecture:** 应用使用 React Router 和统一应用壳组织五个路由页面。页面只调用 `services` 中的异步契约，本阶段由内存模拟仓库实现；页面专用组件与样式就近放置，共享组件只承载跨页面能力。

**Tech Stack:** React 18、TypeScript、Vite、Ant Design、Ant Design Icons、Recharts、Vitest、React Testing Library、Playwright

---

## 文件结构

```text
frontend/
├── e2e/app.spec.ts                       # 真实浏览器关键流程和视觉检查
├── index.html                            # Vite 入口
├── package.json                          # 前端依赖与脚本
├── playwright.config.ts                  # 桌面和移动端项目
├── tsconfig.app.json                     # 应用 TypeScript 配置
├── tsconfig.json                         # TypeScript 引用配置
├── tsconfig.node.json                    # Vite 配置 TypeScript 配置
├── vite.config.ts                        # Vite 与 Vitest 配置
└── src/
    ├── main.tsx                          # React 挂载入口
    ├── app/
    │   ├── App.tsx                       # 路由定义与默认重定向
    │   ├── AppShell.tsx                  # 侧栏、顶部栏和移动导航
    │   ├── AppShell.test.tsx             # 导航与响应式交互测试
    │   └── app-shell.css                 # 应用壳布局
    ├── components/
    │   ├── PageHeader.tsx                # 页面标题和操作区
    │   ├── PersonAvatar.tsx              # 确定性头像
    │   └── StatusBadge.tsx               # 统一状态展示
    ├── mocks/fixtures.ts                 # 初始用例、用户、模块与权限数据
    ├── services/
    │   ├── contracts.ts                  # 领域类型和服务接口
    │   ├── PlatformServiceContext.tsx    # 服务依赖注入与页面 Hook
    │   ├── mockPlatformService.ts        # 可变内存模拟服务
    │   └── mockPlatformService.test.ts   # 服务行为测试
    ├── pages/
    │   ├── dashboard/
    │   │   ├── DashboardPage.tsx
    │   │   ├── DashboardPage.test.tsx
    │   │   └── dashboard.css
    │   ├── test-cases/
    │   │   ├── TestCasesPage.tsx
    │   │   ├── TestCasesPage.test.tsx
    │   │   ├── test-cases.css
    │   │   └── components/
    │   │       ├── CaseDrawer.tsx
    │   │       └── ModuleTreePanel.tsx
    │   ├── xmind/
    │   │   ├── XMindPage.tsx
    │   │   ├── XMindPage.test.tsx
    │   │   └── xmind.css
    │   ├── personnel/
    │   │   ├── PersonnelPage.tsx
    │   │   ├── PersonnelPage.test.tsx
    │   │   ├── personnel.css
    │   │   └── components/
    │   │       ├── PermissionMatrix.tsx
    │   │       └── UserDrawer.tsx
    │   └── settings/SettingsPage.tsx
    ├── styles/
    │   ├── global.css                    # 重置、排版和响应式通则
    │   └── tokens.css                    # 颜色、尺寸和阴影变量
    └── tests/
        ├── renderApp.tsx                 # 带路由和服务的渲染帮助器
        └── setup.ts                      # jest-dom 与浏览器 API 桩
```

## Task 1: 建立可测试的 React 前端骨架

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/app/App.tsx`
- Create: `frontend/src/tests/setup.ts`
- Create: `frontend/src/app/App.test.tsx`

- [ ] **Step 1: 创建构建与测试配置**

`frontend/package.json` 使用以下脚本和依赖边界：

```json
{
  "name": "test-management-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@ant-design/icons": "latest",
    "antd": "latest",
    "dayjs": "latest",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.30.1",
    "recharts": "latest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/user-event": "latest",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "latest",
    "jsdom": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

`vite.config.ts` 必须启用 React 插件，并设置 `test.environment = 'jsdom'`、`test.setupFiles = './src/tests/setup.ts'` 和 `css: true`。

- [ ] **Step 2: 安装依赖**

Run: `cd frontend && npm install`

Expected: 依赖安装成功并生成 `frontend/package-lock.json`。

- [ ] **Step 3: 写第一个失败的应用测试**

```tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';

it('默认进入仪表盘', async () => {
  render(<App router="memory" initialEntries={['/']} />);
  expect(await screen.findByRole('heading', { name: '仪表盘' })).toBeInTheDocument();
});
```

- [ ] **Step 4: 运行测试并确认因应用尚未实现而失败**

Run: `cd frontend && npm test -- src/app/App.test.tsx`

Expected: FAIL，缺少 `App` 导出或找不到“仪表盘”标题。

- [ ] **Step 5: 实现最小应用入口和默认路由**

`App` 接收 `router?: 'browser' | 'memory'` 与 `initialEntries?: string[]`，测试环境使用 `MemoryRouter`，生产环境使用 `BrowserRouter`。根路由重定向到 `/dashboard`，仪表盘先渲染 `<h1>仪表盘</h1>`。

- [ ] **Step 6: 验证测试与类型检查**

Run: `cd frontend && npm test -- src/app/App.test.tsx && npm run typecheck`

Expected: 1 个测试通过，TypeScript 无错误。

- [ ] **Step 7: 提交骨架**

```bash
git add frontend
git commit -m "chore: scaffold React frontend"
```

## Task 2: 定义数据契约与模拟服务

**Files:**
- Create: `frontend/src/services/contracts.ts`
- Create: `frontend/src/services/PlatformServiceContext.tsx`
- Create: `frontend/src/mocks/fixtures.ts`
- Create: `frontend/src/services/mockPlatformService.ts`
- Create: `frontend/src/services/mockPlatformService.test.ts`

- [ ] **Step 1: 写模拟服务失败测试**

```ts
import { createMockPlatformService } from './mockPlatformService';

it('创建接口用例后返回在列表首行', async () => {
  const service = createMockPlatformService();
  const created = await service.createTestCase({
    type: 'api', moduleId: 'auth', name: '刷新访问令牌',
    priority: 'P1', endpoint: '/api/token/refresh', method: 'POST', status: '维护中'
  });
  const rows = await service.listTestCases({ type: 'api', moduleId: 'auth' });
  expect(rows[0]).toMatchObject({ id: created.id, name: '刷新访问令牌' });
});

it('新增用户并切换启用状态', async () => {
  const service = createMockPlatformService();
  const user = await service.addUser({
    name: '周敏', email: 'zhoumin@example.com', department: '质量保障部',
    role: '测试负责人', password: 'Test1234'
  });
  await service.setUserEnabled(user.id, false);
  expect((await service.listUsers()).find((item) => item.id === user.id)?.enabled).toBe(false);
});
```

- [ ] **Step 2: 运行并确认缺少实现**

Run: `cd frontend && npm test -- src/services/mockPlatformService.test.ts`

Expected: FAIL，找不到 `mockPlatformService`。

- [ ] **Step 3: 实现领域类型与服务接口**

`contracts.ts` 定义 `TestCaseType`、`Priority`、`TestCaseStatus`、`TestCaseRecord`、`CreateTestCaseInput`、`UserRecord`、`CreateUserInput`、`ModuleNode`、`PermissionRole` 和 `PlatformService`。`PlatformService` 至少提供：

```ts
interface PlatformService {
  getDashboard(): Promise<DashboardData>;
  listTestCases(query: TestCaseQuery): Promise<TestCaseRecord[]>;
  createTestCase(input: CreateTestCaseInput): Promise<TestCaseRecord>;
  listUsers(): Promise<UserRecord[]>;
  addUser(input: CreateUserInput): Promise<UserRecord>;
  setUserEnabled(id: string, enabled: boolean): Promise<void>;
  listRoles(): Promise<PermissionRole[]>;
}
```

`createMockPlatformService()` 对 fixtures 做深拷贝，所有方法通过短延迟 Promise 返回；新增记录使用稳定前缀和递增序号。

`PlatformServiceContext.tsx` 导出 `PlatformServiceProvider` 和 `usePlatformService()`。Provider 接收可选 `service` 属性，生产环境使用模块级模拟服务实例，测试通过属性注入每次全新的实例；Hook 在缺少 Provider 时抛出明确错误。

- [ ] **Step 4: 运行服务测试**

Run: `cd frontend && npm test -- src/services/mockPlatformService.test.ts`

Expected: 2 个测试通过。

- [ ] **Step 5: 提交数据层**

```bash
git add frontend/src/services frontend/src/mocks
git commit -m "feat: add mock platform service"
```

## Task 3: 实现应用壳与中文导航

**Files:**
- Create: `frontend/src/app/AppShell.tsx`
- Create: `frontend/src/app/AppShell.test.tsx`
- Create: `frontend/src/app/app-shell.css`
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/global.css`
- Create: `frontend/src/tests/renderApp.tsx`
- Create: `frontend/src/components/PageHeader.tsx`
- Create: `frontend/src/components/PersonAvatar.tsx`
- Create: `frontend/src/components/StatusBadge.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: 写导航失败测试**

```tsx
it('侧栏可进入人员管理', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');
  await user.click(screen.getByRole('menuitem', { name: '人员管理' }));
  expect(await screen.findByRole('heading', { name: '人员管理' })).toBeInTheDocument();
});

it('窄屏通过菜单按钮打开导航抽屉', async () => {
  window.matchMedia = createMatchMedia(false);
  const user = userEvent.setup();
  renderApp('/dashboard');
  await user.click(screen.getByRole('button', { name: '打开导航' }));
  expect(screen.getByRole('dialog', { name: '主导航' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `cd frontend && npm test -- src/app/AppShell.test.tsx`

Expected: FAIL，应用壳和菜单尚不存在。

- [ ] **Step 3: 实现应用壳与路由占位页**

使用 Ant Design `Layout`、`Menu`、`Drawer`、`Select`、`Badge` 和图标。桌面侧栏宽度 224px，顶部栏高度 64px；菜单全部使用中文。创建仪表盘、测试用例、XMind 转换器、人员管理和设置路由占位标题，项目选择器显示“阿尔法测试平台”。

`renderApp(route)` 必须为每次测试创建新的 `createMockPlatformService()`，并使用 `PlatformServiceProvider` 包裹 memory 模式的 `App`。`setup.ts` 导出 `createMatchMedia(matches)`，补齐 `window.matchMedia` 的 `addEventListener`、`removeEventListener` 和 `dispatchEvent` 接口。

`PersonAvatar` 根据姓名计算四种稳定背景色；`StatusBadge` 统一维护中、已通过、已停用和启用状态颜色。

- [ ] **Step 4: 实现方案 A 样式变量**

`tokens.css` 定义 `--nav-bg: #132b48`、`--nav-active: #1f446d`、`--workspace: #f3f6fa`、`--surface: #ffffff`、`--primary: #1677ff`、`--success: #2f9b83`、`--warning: #d89a25`、`--danger: #d94b55`。卡片圆角不超过 8px，字间距为 0。

- [ ] **Step 5: 验证导航、类型和构建**

Run: `cd frontend && npm test -- src/app/AppShell.test.tsx && npm run typecheck && npm run build`

Expected: 导航测试通过，构建生成 `frontend/dist/`。

- [ ] **Step 6: 提交应用壳**

```bash
git add frontend/src/app frontend/src/components frontend/src/styles frontend/src/main.tsx
git commit -m "feat: add responsive application shell"
```

## Task 4: 实现仪表盘

**Files:**
- Create: `frontend/src/pages/dashboard/DashboardPage.tsx`
- Create: `frontend/src/pages/dashboard/DashboardPage.test.tsx`
- Create: `frontend/src/pages/dashboard/dashboard.css`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: 写快捷操作失败测试**

```tsx
it('从仪表盘新建接口用例', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');
  await user.click(await screen.findByRole('button', { name: '新建接口用例' }));
  expect(await screen.findByRole('heading', { name: '接口用例' })).toBeInTheDocument();
});

it('展示用例总数与最近用例', async () => {
  renderApp('/dashboard');
  expect(await screen.findByText('用例总数')).toBeInTheDocument();
  expect(await screen.findByRole('table', { name: '最近用例' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行并确认仪表盘功能缺失**

Run: `cd frontend && npm test -- src/pages/dashboard/DashboardPage.test.tsx`

Expected: FAIL，缺少统计区和快捷操作。

- [ ] **Step 3: 实现仪表盘四个区域**

通过 `service.getDashboard()` 加载数据。用 Recharts `PieChart` 绘制环形图；导入导出中心提供“导出电子表格”和“从 XMind 生成用例”；快捷操作提供三类新建按钮；最近用例使用紧凑表格、优先级标签和维护人头像。

快捷操作导航至 `/test-cases/api?create=1` 等目标，测试用例页根据查询参数打开抽屉。导出按钮生成 UTF-8 CSV Blob，并下载中文文件名 `测试用例.csv`。

- [ ] **Step 4: 验证仪表盘测试**

Run: `cd frontend && npm test -- src/pages/dashboard/DashboardPage.test.tsx`

Expected: 2 个测试通过。

- [ ] **Step 5: 提交仪表盘**

```bash
git add frontend/src/pages/dashboard frontend/src/app/App.tsx
git commit -m "feat: build dashboard overview"
```

## Task 5: 实现测试用例管理与差异化抽屉

**Files:**
- Create: `frontend/src/pages/test-cases/TestCasesPage.tsx`
- Create: `frontend/src/pages/test-cases/TestCasesPage.test.tsx`
- Create: `frontend/src/pages/test-cases/test-cases.css`
- Create: `frontend/src/pages/test-cases/components/CaseDrawer.tsx`
- Create: `frontend/src/pages/test-cases/components/ModuleTreePanel.tsx`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: 写接口用例表单失败测试**

```tsx
it('校验 JSON 并创建接口用例', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/api?create=1');
  await user.type(await screen.findByLabelText('用例名称'), '刷新访问令牌');
  await user.type(screen.getByLabelText('接口地址'), '/api/token/refresh');
  await user.type(screen.getByLabelText('请求体'), '{bad json}');
  await user.click(screen.getByRole('button', { name: '创建用例' }));
  expect(await screen.findByText('请输入有效的 JSON')).toBeInTheDocument();
  await user.clear(screen.getByLabelText('请求体'));
  await user.type(screen.getByLabelText('请求体'), '{"refreshToken":"demo"}');
  await user.click(screen.getByRole('button', { name: '创建用例' }));
  expect(await screen.findByText('刷新访问令牌')).toBeInTheDocument();
});

it('从仪表盘进入时自动打开接口用例抽屉', async () => {
  renderApp('/test-cases/api?create=1');
  expect(await screen.findByRole('dialog', { name: '新建接口用例' })).toBeInTheDocument();
});

it('切换模块后过滤用例', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/api');
  await user.click(await screen.findByText('支付'));
  expect(screen.getByRole('table', { name: '接口用例列表' })).toHaveTextContent('创建支付订单');
  expect(screen.getByRole('table', { name: '接口用例列表' })).not.toHaveTextContent('用户登录');
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `cd frontend && npm test -- src/pages/test-cases/TestCasesPage.test.tsx`

Expected: FAIL，测试用例页面和抽屉不存在。

- [ ] **Step 3: 实现双栏列表和筛选**

页签绑定 `functional`、`api`、`ui` 路由。左栏 `Tree` 选择模块，右栏包含搜索、优先级、状态筛选和表格。模块栏宽度在桌面为 248px，低于 900px 时移动到表格上方。

- [ ] **Step 4: 实现差异化 CaseDrawer**

功能用例字段：名称、模块、优先级、前置条件、步骤、预期结果。接口用例字段：名称、模块、优先级、接口地址、HTTP 方法、请求头键值对、请求体、断言规则。UI自动化字段：名称、模块、优先级、页面地址、定位方式、执行环境。关闭脏表单时弹出“放弃未保存内容？”确认框。

- [ ] **Step 5: 验证测试和全量单测**

Run: `cd frontend && npm test -- src/pages/test-cases/TestCasesPage.test.tsx && npm test`

Expected: 用例页面测试与现有全部测试通过。

- [ ] **Step 6: 提交测试用例页面**

```bash
git add frontend/src/pages/test-cases frontend/src/app/App.tsx
git commit -m "feat: add test case management"
```

## Task 6: 实现 XMind 转换工作流

**Files:**
- Create: `frontend/src/pages/xmind/XMindPage.tsx`
- Create: `frontend/src/pages/xmind/XMindPage.test.tsx`
- Create: `frontend/src/pages/xmind/xmind.css`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: 写上传与解析失败测试**

```tsx
it('拒绝非 xmind 文件并完成合法文件解析', async () => {
  const user = userEvent.setup();
  renderApp('/xmind');
  const input = screen.getByLabelText('选择 XMind 文件');
  await user.upload(input, new File(['bad'], 'login.txt', { type: 'text/plain' }));
  expect(await screen.findByText('仅支持 .xmind 文件')).toBeInTheDocument();
  await user.upload(input, new File(['demo'], '用户登录.xmind'));
  expect(await screen.findByText('解析预览')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '开始完整解析' }));
  expect(await screen.findByText('已生成 6 条测试用例')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行并确认工作流不存在**

Run: `cd frontend && npm test -- src/pages/xmind/XMindPage.test.tsx`

Expected: FAIL，缺少上传控件。

- [ ] **Step 3: 实现四状态转换器**

使用显式状态联合 `idle | uploading | preview | complete`。上传阶段显示进度条和取消按钮；预览阶段左侧显示“登录/成功登录/登录失败”树，右侧显示到“核心模块/鉴权”的映射；完成阶段显示生成数量、查看接口用例和重新上传操作。

测试环境跳过定时器或使用 fake timers；生产交互用短计时器更新进度。文件校验只依据文件名扩展名，界面说明当前为解析预览。

- [ ] **Step 4: 验证 XMind 测试**

Run: `cd frontend && npm test -- src/pages/xmind/XMindPage.test.tsx`

Expected: 1 个工作流测试通过。

- [ ] **Step 5: 提交 XMind 页面**

```bash
git add frontend/src/pages/xmind frontend/src/app/App.tsx
git commit -m "feat: add XMind conversion workflow"
```

## Task 7: 实现人员、权限与设置页面

**Files:**
- Create: `frontend/src/pages/personnel/PersonnelPage.tsx`
- Create: `frontend/src/pages/personnel/PersonnelPage.test.tsx`
- Create: `frontend/src/pages/personnel/personnel.css`
- Create: `frontend/src/pages/personnel/components/UserDrawer.tsx`
- Create: `frontend/src/pages/personnel/components/PermissionMatrix.tsx`
- Create: `frontend/src/pages/settings/SettingsPage.tsx`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: 写新增用户和状态切换失败测试**

```tsx
it('新增用户并停用该用户', async () => {
  const user = userEvent.setup();
  renderApp('/personnel');
  await user.click(await screen.findByRole('button', { name: '添加用户' }));
  await user.type(screen.getByLabelText('姓名'), '周敏');
  await user.type(screen.getByLabelText('邮箱'), 'zhoumin@example.com');
  await user.type(screen.getByLabelText('初始密码'), 'Test1234');
  await user.click(screen.getByRole('button', { name: '添加' }));
  expect(await screen.findByText('周敏')).toBeInTheDocument();
  await user.click(screen.getByRole('switch', { name: '周敏的启用状态' }));
  expect(await screen.findByText('用户已停用')).toBeInTheDocument();
});

it('角色与权限页签展示权限矩阵', async () => {
  const user = userEvent.setup();
  renderApp('/personnel');
  await user.click(await screen.findByRole('tab', { name: '角色与权限' }));
  expect(screen.getByRole('table', { name: '权限矩阵' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `cd frontend && npm test -- src/pages/personnel/PersonnelPage.test.tsx`

Expected: FAIL，人员页面尚未实现。

- [ ] **Step 3: 实现用户列表和添加抽屉**

列表包含头像、姓名、邮箱、部门、角色、状态和操作，支持关键字、角色与状态筛选。抽屉校验必填、邮箱格式和至少 8 位密码；提交调用 `addUser` 并刷新列表。状态开关失败时恢复原状态。

- [ ] **Step 4: 实现权限矩阵与设置占位页**

矩阵行显示测试负责人、测试工程师、开发人员，列显示用例查看、用例编辑、XMind 转换、人员管理和系统设置。复选框在原型内可切换但不持久化。设置页展示“系统设置”和“更多配置将在后续版本开放”。

- [ ] **Step 5: 验证人员页面和全量单测**

Run: `cd frontend && npm test -- src/pages/personnel/PersonnelPage.test.tsx && npm test`

Expected: 人员页面测试与全部现有测试通过。

- [ ] **Step 6: 提交人员与设置页面**

```bash
git add frontend/src/pages/personnel frontend/src/pages/settings frontend/src/app/App.tsx
git commit -m "feat: add personnel and permission management"
```

## Task 8: 响应式完善与真实浏览器验收

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/app.spec.ts`
- Modify: `frontend/src/app/app-shell.css`
- Modify: `frontend/src/pages/dashboard/dashboard.css`
- Modify: `frontend/src/pages/test-cases/test-cases.css`
- Modify: `frontend/src/pages/xmind/xmind.css`
- Modify: `frontend/src/pages/personnel/personnel.css`
- Modify: `frontend/package.json`

- [ ] **Step 1: 写 Playwright 失败流程**

```ts
import { expect, test } from '@playwright/test';

test('桌面端可浏览四个核心页面', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'XMind 转换器' }).click();
  await expect(page.getByRole('heading', { name: 'XMind 转换器' })).toBeVisible();
  await page.getByRole('menuitem', { name: '人员管理' }).click();
  await expect(page.getByRole('heading', { name: '人员管理' })).toBeVisible();
});

test('移动端导航和页面内容不重叠', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: '打开导航' }).click();
  await expect(page.getByRole('dialog', { name: '主导航' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'visible');
});
```

- [ ] **Step 2: 启动应用并确认 Playwright 初始失败**

Run: `cd frontend && npm run dev -- --host 127.0.0.1`

Run in another shell: `cd frontend && npx playwright test`

Expected: 在响应式样式或配置完成前至少一个流程失败。

- [ ] **Step 3: 完成响应式与稳定尺寸样式**

在 1200px、900px 和 600px 断点调整仪表盘网格、模块树、上传预览和人员表格。所有表格外层提供横向滚动；移动端抽屉宽度使用 `min(100vw, 480px)`；图表容器使用固定高度和 `ResponsiveContainer`；按钮文字允许换行但不溢出。

- [ ] **Step 4: 配置桌面和移动 Playwright 项目**

`playwright.config.ts` 设置 `baseURL: 'http://127.0.0.1:4173'`，`webServer.command: 'npm run dev -- --host 127.0.0.1 --port 4173'`，并创建 `desktop` 的 `1440x1000` 与 `mobile` 的 `390x844` 项目。每个核心页面保存截图到 Playwright 输出目录，不提交生成图片。

- [ ] **Step 5: 运行完整验证**

Run: `cd frontend && npm test && npm run typecheck && npm run build && npx playwright test`

Expected: 所有单测通过，TypeScript 无错误，Vite 构建成功，桌面和移动项目全部通过。

- [ ] **Step 6: 检查英文界面词与版本差异**

Run: `rg -n 'Dashboard|Test Cases|Functional|API ACTIVE|UI Automation|Personnel|Settings|Create|Add User|Full Name|Email|Role|Status' frontend/src || true`

Expected: 不存在作为用户可见界面文字的匹配；内部类型名和技术字段若匹配需人工确认不可见。

Run: `git diff --check && git status --short`

Expected: 无空白错误，只显示计划内前端变更。

- [ ] **Step 7: 提交最终实现**

```bash
git add frontend
git commit -m "feat: complete responsive test management frontend"
```

## 完成检查

- [ ] 四个核心页面和设置页均从侧栏可达。
- [ ] 快捷新建、差异化抽屉、模块过滤、XMind 流程、用户新增与启停均可操作。
- [ ] 所有前端代码、配置、测试与资源都位于 `frontend/`。
- [ ] 用户可见文案为中文，技术标识除外。
- [ ] 桌面与移动视口不存在内容重叠、不可达按钮或空白图表。
- [ ] `npm test`、`npm run typecheck`、`npm run build`、`npx playwright test` 全部通过。
