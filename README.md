# 测试管理平台项目结构与功能说明

> 更新日期：2026-08-01  
> 当前阶段：React 前端原型已实现，业务数据由内存 Mock 服务提供；真实后端、数据持久化及真实 XMind 解析尚未实现。

## 1. 项目定位

本项目是一个面向测试团队的测试管理平台，用于统一管理功能用例、接口用例、UI自动化用例、XMind 用例转换、人员和角色权限。

当前采用前后端分离结构：

- `frontend/`：可运行的 React 前端应用。
- `backend/`：预留的后端工程目录，目前为空。
- `docs/`：设计说明和实施计划等项目文档。
- `requirements.txt`：预留的 Python 后端依赖入口，当前没有运行时依赖。

## 2. 根目录层级

```text
test-platform/
├── backend/                       # 后端工程预留目录，当前尚未实现
├── docs/
│   └── superpowers/
│       ├── plans/                 # 分阶段实施计划
│       └── specs/                 # 产品与技术设计说明
├── frontend/                      # React 前端应用
├── requirements.txt              # 后端 Python 依赖预留文件
└── PROJECT_STRUCTURE.md           # 本文档：目录层级与功能定义
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
| 仪表盘 | `/dashboard` | 展示用例总数和类型分布、最近用例、快捷创建入口，并支持将最近用例导出为 CSV/XLSX | 已实现；导入用例文件仅有界面入口 |
| 功能用例 | `/test-cases/functional` | 按模块、关键字、优先级和状态筛选；创建时填写前置条件、测试步骤和预期结果 | 原型已实现；创建结果仅保留当前会话 |
| 接口用例 | `/test-cases/api` | 筛选和展示接口地址、HTTP 方法、预期状态；创建时支持请求头、JSON 请求体校验和断言输入 | 原型已实现；尚未执行真实接口请求 |
| UI自动化 | `/test-cases/ui` | 筛选 UI 用例；创建时配置页面地址、定位方式和执行环境 | 原型已实现；尚未连接自动化执行引擎 |
| 用例生成器 | `/xmind` | 完成文件选择、上传进度、节点预览、模块映射和生成结果的线性流程 | 交互演示已实现；未解析真实 XMind 内容，也未持久化生成结果 |
| 人员管理 | `/personnel` | 查询和筛选用户、新增用户、启用或停用用户；查看角色权限矩阵 | 原型已实现；数据仅保留当前会话，权限矩阵只读 |
| 系统设置 | `/settings` | 预留平台级配置入口 | 占位页面，配置编辑尚未实现 |

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

`PlatformServiceContext` 负责向页面注入具体服务。默认实现为 `mockPlatformService`，数据保存在浏览器内存中，刷新页面后会恢复为 `fixtures.ts` 中的初始数据。后续接入后端时，应新增真实 API 服务实现并保持 `PlatformService` 契约稳定，使页面层不依赖具体传输协议。

当前核心领域类型包括：

- 用例类型：`functional`、`api`、`ui`。
- 优先级：`P0`、`P1`、`P2`、`P3`。
- 用例状态：`维护中`、`已通过`、`草稿`、`已停用`。
- 用户角色：`测试负责人`、`测试工程师`、`开发人员`。
- 权限项：用例查看、用例编辑、XMind 转换、人员管理和系统设置。

## 6. 目录职责约定

- 页面级业务逻辑放在 `src/pages/<module>/`，只被该页面使用的组件放入其 `components/` 子目录。
- 至少被多个页面复用的展示组件放在 `src/components/`。
- 领域类型和外部数据访问契约放在 `src/services/`，页面不得直接导入 Mock 数据。
- 初始演示数据统一放在 `src/mocks/`，不要在页面组件中散落固定业务数据。
- 全局视觉变量放在 `src/styles/tokens.css`，页面专用样式与页面文件就近存放。
- 单元测试与被测模块同目录，跨页面测试工具放在 `src/tests/`，真实浏览器流程放在 `e2e/`。
- 未来后端代码统一放在 `backend/`；后端技术栈确定后，再补充其内部结构和依赖锁定方式。

## 7. 本地开发与验证

在 `frontend/` 目录执行：

```bash
npm install          # 安装依赖
npm run dev          # 启动本地开发服务器
npm run typecheck    # TypeScript 类型检查
npm test             # 运行 Vitest 单元与组件测试
npm run build        # 生成生产构建
npm run e2e          # 运行 Playwright 端到端测试
```

当前技术栈为 React 18、TypeScript、Vite、Ant Design、React Router、Recharts、Vitest、Testing Library 和 Playwright。
