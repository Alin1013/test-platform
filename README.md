# 测试管理平台项目结构与功能说明

> 更新日期：2026-08-04
> 当前阶段：React 前端与 FastAPI 后端均可运行；支持 SQLite 持久化、账号认证、用户资料维护、XMind 解析、CSV/XLSX 导入导出、接口同步调试，以及 UI/接口自动化执行编排。

## 1. 项目定位

本项目是一个面向测试团队的测试管理平台，用于统一管理功能用例、接口用例、UI 自动化用例、自动化执行记录、XMind 用例转换、人员和角色权限。

当前采用前后端分离结构：

- `frontend/`：可运行的 React 前端应用。
- `backend/`：FastAPI、SQLAlchemy、Alembic 后端服务及 HTTP 集成测试。
- `docs/`：设计说明和实施计划等项目文档。
- `requirements.txt`：锁定的 Python 后端运行与测试依赖。

## 2. 根目录层级

```text
test-platform/
├── backend/
│   ├── app/                       # 模型、路由、服务与应用工厂
│   ├── migrations/                # Alembic 数据库迁移
│   └── tests/                     # 后端 HTTP/数据库集成测试
├── docs/
│   └── superpowers/
│       ├── plans/                 # 分阶段实施计划
│       └── specs/                 # 产品与技术设计说明
├── frontend/                      # React 前端应用
├── DATABASE.md                    # 数据库表结构、连接信息与维护命令
├── requirements.txt              # 锁定的 Python 后端依赖
└── README.md                      # 项目结构、运行与验证说明
```

本地开发时可能出现以下生成目录，它们不属于业务源码：

- `.venv/`：本地 Python 虚拟环境。
- `frontend/node_modules/`：前端依赖。
- `frontend/dist/`：生产构建产物。
- `frontend/output/`：Playwright 测试产物。

## 3. 前端目录层级

```text
frontend/
├── e2e/
│   └── app.spec.ts                        # 桌面端和移动端端到端流程
├── public/
│   └── favicon.svg                        # 公共静态资源
├── src/
│   ├── app/
│   │   ├── App.tsx                        # Provider、路由和默认重定向
│   │   ├── AppShell.tsx                   # 侧栏、顶部栏、移动端导航和内容区
│   │   ├── App.test.tsx                   # 应用路由测试
│   │   ├── AppShell.test.tsx              # 应用壳交互测试
│   │   └── app-shell.css                  # 应用壳样式
│   ├── components/
│   │   ├── PageHeader.tsx                 # 通用页面标题与操作区
│   │   ├── PersonAvatar.tsx               # 通用人员头像
│   │   └── StatusBadge.tsx                # 通用用例状态标识
│   ├── mocks/
│   │   └── fixtures.ts                    # 初始用例、用户和权限模拟数据
│   ├── pages/
│   │   ├── dashboard/                     # 仪表盘
│   │   ├── test-cases/                    # 测试用例列表及创建表单
│   │   │   └── components/
│   │   │       ├── CaseDrawer.tsx         # 分类用例创建抽屉
│   │   │       └── ModuleTreePanel.tsx    # 业务模块筛选树
│   │   ├── xmind/                         # XMind 转换工作流
│   │   ├── execution/                     # UI 与接口自动化执行工作台
│   │   ├── personnel/                     # 用户、角色和权限管理
│   │   │   └── components/
│   │   │       ├── PermissionMatrix.tsx   # 角色权限矩阵
│   │   │       └── UserDrawer.tsx         # 新增用户抽屉
│   │   └── settings/                      # 系统设置占位页
│   ├── services/
│   │   ├── contracts.ts                   # 领域类型、查询参数和服务接口
│   │   ├── PlatformServiceContext.tsx     # 服务依赖注入及访问 Hook
│   │   ├── mockPlatformService.ts         # 内存 Mock 服务实现
│   │   └── *.test.ts(x)                   # 服务契约与上下文测试
│   ├── styles/
│   │   ├── global.css                     # 全局布局、基础样式和响应式规则
│   │   └── tokens.css                     # 颜色、间距、阴影等设计变量
│   ├── tests/
│   │   ├── renderApp.tsx                  # 测试渲染辅助方法
│   │   └── setup.ts                       # Vitest 浏览器环境初始化
│   └── main.tsx                           # React 应用挂载入口
├── index.html                              # Vite HTML 入口
├── package.json                            # 依赖和 npm 命令
├── package-lock.json                       # npm 依赖锁文件
├── playwright.config.ts                    # Playwright 双视口配置
├── tsconfig*.json                          # TypeScript 配置
└── vite.config.ts                          # Vite、React 和 Vitest 配置
```

## 4. 功能模块定义

| 模块 | 路由 | 功能定义 | 当前状态 |
| --- | --- | --- | --- |
| 应用框架 | 全局 | 桌面侧栏、顶部项目选择器、通知入口、用户头像及移动端抽屉导航 | 已实现；全局搜索和通知仅有界面入口 |
| 仪表盘 | `/dashboard` | 展示用例总数和类型分布、最近用例、快捷创建入口 | 前后端接口已实现 |
| 功能用例 | `/test-cases/functional` | 按模块、关键字、优先级和状态筛选及维护功能用例 | CRUD 与文件导入导出已持久化 |
| 接口用例 | `/test-cases/api` | 维护接口地址、HTTP 方法、请求、断言和变量提取 | 完整 Runner 配置已结构化持久化；后端支持同步调试运行 |
| UI自动化 | `/test-cases/ui` | 管理 UI 自动化步骤配置 | 主表与 UI 详情扩展表已持久化；执行引擎未接入 |
| UI 自动化执行 | `/execution/ui-test` | 选择 UI 用例，配置环境、浏览器、无头模式与并发数，查看进度、步骤、媒体和日志 | 页面、执行记录、状态查询、中断接口及 WebSocket 快照已实现 |
| 接口自动化执行 | `/execution/api-test` | 批量运行接口用例，配置环境、迭代、Ramp-up 和全局请求头，查看 KPI、请求、响应与断言 | 页面、执行记录、报告查询、中断及 JSON 导出已实现 |
| 用例生成器 | `/xmind` | 上传并解析 XMind 节点树，生成结构化用例预览 | 支持新版 JSON 与 XMind 8 XML 格式 |
| 人员管理 | `/personnel` | 查询、新增、启停用户并维护角色权限 | 后端筛选、密码哈希和权限更新已实现 |
| 系统设置 | `/settings` | 维护平台、环境、通知和 AI 配置 | 结构化配置持久化已实现 |
| 账号认证 | `/login` | 账号密码登录、退出及当前用户资料维护 | 后端使用可撤销会话令牌，修改密码后全部会话失效 |

根路径 `/` 会自动重定向到 `/dashboard`。无法识别的测试用例类型在页面内部按接口用例视图处理，但正式导航只生成 `functional`、`api` 和 `ui` 三种类型。

## 5. 数据模型与服务边界

页面不直接访问 `mocks/fixtures.ts`，统一通过 `PlatformService` 获取或修改数据。该接口当前定义以下能力：

| 服务方法 | 职责 |
| --- | --- |
| `getDashboard()` | 获取用例统计和最近用例 |
| `listTestCases(query)` | 按类型、模块、关键字、优先级和状态查询用例 |
| `createTestCase(input)` | 创建测试用例 |
| `listUsers()` | 获取用户列表 |
| `addUser(input)` | 新增用户 |
| `setUserEnabled(id, enabled)` | 启用或停用用户 |
| `listRoles()` | 获取角色及权限矩阵 |
| `startUiExecution(input)` | 创建 UI 自动化执行记录 |
| `getUiExecution(executionId)` | 查询 UI 执行进度、用例状态和详情 |
| `stopUiExecution(executionId)` | 中断 UI 自动化执行 |
| `startApiExecution(input)` | 创建接口自动化执行记录 |
| `getApiExecutionReport(executionId)` | 查询接口执行报告和请求分析 |
| `stopApiExecution(executionId)` | 中断接口自动化执行 |

`PlatformServiceContext` 负责向页面注入具体服务。未配置环境变量时使用内存 Mock；设置 `VITE_API_BASE_URL` 后使用 `apiPlatformService` 调用真实后端，页面层不依赖具体传输协议。

自动化执行后端提供以下公共接口：

| 方法与路径 | 职责 |
| --- | --- |
| `POST/PUT /api/v1/api-cases[/{caseId}]` | 创建或更新包含请求、断言和提取规则的接口自动化用例 |
| `POST/PUT /api/v1/ui-cases[/{caseId}]` | 创建或更新包含步骤与运行配置的 UI 自动化用例 |
| `POST /api/v1/api-cases/debug` | 同步调试接口配置并返回响应、断言和提取结果，不写执行历史 |
| `POST /api/v1/executions/start` | 统一创建 UI 或 API 执行批次及用例快照 |
| `POST /api/v1/executions/{executionId}/stop` | 按执行编号统一中止任务 |
| `GET /api/v1/executions/{executionId}/summary` | 查询环境、状态、通过率、平均耗时和进度统计 |
| `GET /api/v1/executions/{executionId}/details` | 查询 UI 或 API 类型化执行明细 |
| `WS /ws/execution/{executionId}` | 推送进度、用例状态与 UI 步骤日志快照事件 |
| `POST /api/v1/ui-test/executions` | 创建 UI 自动化执行及用例明细 |
| `GET /api/v1/ui-test/executions/{executionId}` | 查询 UI 执行状态和结果 |
| `POST /api/v1/ui-test/executions/{executionId}/stop` | 中断 UI 自动化执行 |
| `WS /ws/ui-test/execution/{executionId}` | 推送当前 UI 用例步骤状态快照 |
| `POST /api/v1/api-test/executions` | 创建接口自动化执行及接口明细 |
| `GET /api/v1/api-test/executions/{executionId}/report` | 查询接口自动化报告 |
| `POST /api/v1/api-test/executions/{executionId}/stop` | 中断接口自动化执行 |

当前实现负责执行配置校验、不可变配置快照、持久化任务入队、状态查询、中断和持续 WebSocket 状态流。独立 Worker 可执行批量 HTTP 请求、变量传递、断言与提取，也可通过 Playwright 执行 UI 步骤、失败重试、截图和录屏；产物默认保存在本地 `/uploads/executions`。生产环境可在相同 Worker 边界替换 Redis/RabbitMQ 和 OSS 适配器。后端分层和接入约束见 [`docs/automation-backend-architecture.md`](docs/automation-backend-architecture.md)。

当前核心领域类型包括：

- 用例类型：`functional`、`api`、`ui`。
- 优先级：`P0`、`P1`、`P2`、`P3`。
- 用例状态：`维护中`、`已通过`、`草稿`、`已失败`、`已停用`。
- 用户角色：`测试负责人`、`测试工程师`、`开发人员`。
- 权限项：用例查看、用例编辑、XMind 转换、人员管理和系统设置。

## 6. 目录职责约定

- 页面级业务逻辑放在 `src/pages/<module>/`，只被该页面使用的组件放入其 `components/` 子目录。
- 至少被多个页面复用的展示组件放在 `src/components/`。
- 领域类型和外部数据访问契约放在 `src/services/`，页面不得直接导入 Mock 数据。
- 初始演示数据统一放在 `src/mocks/`，不要在页面组件中散落固定业务数据。
- 全局视觉变量放在 `src/styles/tokens.css`，页面专用样式与页面文件就近存放。
- 单元测试与被测模块同目录，跨页面测试工具放在 `src/tests/`，真实浏览器流程放在 `e2e/`。
- 后端路由放在 `backend/app/routers/`，业务逻辑放在 `backend/app/services/`，数据库模型集中在 `backend/app/models.py`。
- 数据库结构变化必须同时新增 Alembic 迁移；后端行为通过 `backend/tests/` 的公共 HTTP 或数据库边界测试。
- 新增业务表必须配置准确的中文表 `comment`，并同步注释迁移、数据库文档和全表注释测试；缺少注释的表不得合入。

## 7. 本地开发与验证

首次启动后端：

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/alembic upgrade head
./.venv/bin/uvicorn backend.app.main:app --reload --port 8000
```

另开一个终端启动自动化 Worker；首次使用 Playwright 时先安装浏览器：

```bash
./.venv/bin/playwright install chromium firefox webkit
./.venv/bin/python -m backend.app.worker
```

后端 API 文档位于 `http://localhost:8000/docs`。
本地演示平台账号为 `jiangshan`，密码为 `Test1234`。该账号仅限本地演示，部署前必须修改或禁用；它用于应用登录，不是数据库账号。SQLite 数据库不使用用户名或密码，完整的表结构、连接方式和维护命令见 [`DATABASE.md`](DATABASE.md)。

前端复制 `frontend/.env.example` 中的变量到本地 `.env` 后，在 `frontend/` 目录执行：

```bash
npm install          # 安装依赖
npm run dev          # 启动本地开发服务器
npm run typecheck    # TypeScript 类型检查
npm test             # 运行 Vitest 单元与组件测试
npm run build        # 生成生产构建
npm run e2e          # 运行 Playwright 端到端测试
```

当前技术栈为 React 18、TypeScript、Vite、Ant Design、React Router、Recharts、Vitest、Testing Library 和 Playwright。

后端技术栈为 Python 3.12、FastAPI、SQLAlchemy 2、Alembic、SQLite、Pydantic、OpenPyXL 和 Pytest。后端验证命令为 `./.venv/bin/pytest`。
