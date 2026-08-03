# 注册用户持久化与人员列表一致性设计

## 背景

注册接口已经通过 `POST /api/v1/auth/register` 将账号写入 SQLite `users` 表，
人员接口 `GET /api/v1/users` 也从同一张表查询用户。但是前端认证客户端与平台
服务的默认环境选择不一致：认证客户端在开发环境默认访问后端，
`PlatformServiceProvider` 在未配置 `VITE_API_BASE_URL` 时却使用内存 mock。
因此注册成功的用户存在于数据库和人员接口中，却不会出现在人员管理页面。

## 目标

- 注册成功的用户与存量用户保存在同一张 `users` 表中。
- 每次进入或刷新人员管理页面时，从后端加载全部新增和存量用户。
- 开发和生产环境不因缺少 `VITE_API_BASE_URL` 而静默回退到 mock 数据。
- Vitest 继续使用内存服务，组件测试不依赖运行中的后端。

## 非目标

- 不增加 WebSocket、轮询或跨标签页实时同步。
- 不增加数据库表或迁移。
- 不把后端加载失败掩盖为 mock 数据。
- 不改变人员列表的筛选、分页、添加用户或启停交互。

## 方案

### 统一平台服务环境选择

在平台服务层增加一个配置入口，按运行模式创建默认 `PlatformService`：

- `mode === "test"` 时返回 `createMockPlatformService()`。
- 开发和生产环境返回 `createApiPlatformService()`。
- `VITE_API_BASE_URL` 非空时使用配置值。
- 未配置时使用 `http://127.0.0.1:8000/api/v1`。

`PlatformServiceProvider` 只负责注入服务，页面继续通过 `usePlatformService()`
访问数据。这样数据源选择集中在服务边界，不让人员页面直接依赖 HTTP。

### 数据流

```text
注册弹窗
  -> AuthClient.register
  -> POST /api/v1/auth/register
  -> accounts.create_account
  -> users (SQLite)

进入或刷新人员管理
  -> PersonnelPage.loadUsers
  -> PlatformService.listUsers
  -> GET /api/v1/users?page_size=100
  -> users (SQLite)
  -> 新增用户和存量用户
```

后端已有列表查询按 `created_at DESC, id DESC` 排序，因此新注册用户自然显示在
存量用户之前。前端不再拼接 mock 与 API 结果，避免重复和状态冲突。

## 错误处理

- 注册失败继续由认证客户端和注册弹窗展示现有错误信息。
- 人员列表请求失败时，保留现有“用户列表加载失败”提示并显示空列表。
- 开发和生产环境不回退到 mock；后端不可用必须表现为真实加载错误。

## 测试边界

### 后端公共 HTTP 边界

扩展认证或人员测试：先通过 `POST /api/v1/auth/register` 创建用户，再调用
`GET /api/v1/users`，断言结果同时包含新注册用户和种子存量用户。这验证两个
端点共享 `users` 表，而不直接查询测试数据库实现细节。

### 前端服务配置边界

为平台服务配置入口增加单元测试：

- 开发环境未配置 base URL 时，请求默认后端地址。
- 显式 base URL 覆盖默认地址。
- 测试环境使用内存服务且不会发起网络请求。

人员页面现有测试继续通过注入 mock 服务验证筛选、添加和启停行为。

### 完成验证

- 运行后端完整 pytest。
- 运行前端完整 Vitest、TypeScript 类型检查和生产构建。
- 启动真实后端和前端，注册唯一账号，刷新后进入人员管理，确认列表同时显示
  新注册用户和存量用户，且浏览器控制台无错误。

## 验收标准

- 注册接口返回 201 后，用户存在于 SQLite `users` 表。
- `GET /api/v1/users` 返回该注册用户和已有用户。
- 未设置 `VITE_API_BASE_URL` 的开发环境中，人员管理页面仍从后端加载用户。
- 重新进入或刷新人员管理页面后可看到最新注册用户。
- 后端不可用时显示加载失败，不显示 mock 用户。
- Vitest 组件测试仍可在没有后端服务时运行。
