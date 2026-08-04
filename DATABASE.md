# 数据库结构与连接说明

## 1. 数据库连接信息

项目默认使用 SQLite。SQLite 是本地文件数据库，不提供独立数据库服务，因此没有数据库用户名、密码、主机或端口。

| 配置项 | 当前值 |
| --- | --- |
| 数据库类型 | SQLite |
| 数据库文件 | `backend/test_platform.db` |
| SQLAlchemy 连接串 | `sqlite:///backend/test_platform.db` |
| 数据库用户名 | 无 |
| 数据库密码 | 无 |
| 主机与端口 | 无 |
| ORM | SQLAlchemy 2 |
| 迁移工具 | Alembic |
| 仓库最新迁移版本 | `6e4b9c2a7d15` |

应用演示账号为 `jiangshan`，密码为 `Test1234`。该凭据仅限本地演示，部署前必须修改或禁用。这是测试平台的应用账号，不是数据库登录信息；密码在数据库中以 PBKDF2 哈希保存。

Alembic 会读取 `DATABASE_URL` 来覆盖迁移目标。例如将迁移应用到另一个 SQLite 文件：

```bash
export DATABASE_URL='sqlite:////absolute/path/test-platform.db'
./.venv/bin/alembic upgrade head
```

标准 Uvicorn 启动目前仍使用 `backend/app/database.py` 中的默认 SQLite 路径；测试或自定义启动代码可以通过 `create_app(database_url=...)` 显式传入其他连接串。迁移目标与应用运行时连接必须保持一致。

## 2. 数据表总览

| 表名 | 存储内容 | 主要关联 |
| --- | --- | --- |
| `roles` | 角色名称及各模块读写权限 | 一对多关联 `users` |
| `users` | 用户账号、个人资料、部门、角色、状态和密码哈希 | 关联 `roles`，被用例、XMind 记录和认证会话引用 |
| `auth_sessions` | 登录会话的令牌摘要、过期时间和所属用户 | 多对一关联 `users`，用户删除时级联删除 |
| `modules` | 项目内的模块树及父子层级 | 自关联父模块，被 `test_cases` 引用 |
| `test_cases` | 功能、接口和 UI 用例的公共字段 | 关联模块、维护人及类型扩展表 |
| `api_case_details` | 接口用例的地址、方法、请求、断言与变量提取规则 | 与 `test_cases` 一对一，删除主用例时级联删除 |
| `ui_case_details` | UI 自动化用例的步骤或脚本配置 | 与 `test_cases` 一对一，删除主用例时级联删除 |
| `test_execution` | UI/接口自动化执行配置、状态和创建人 | 关联 `users`，一对多关联 `test_execution_detail` |
| `test_execution_detail` | 单个 UI 用例或接口的执行状态、请求、响应和断言 | 多对一关联 `test_execution`，执行记录删除时级联删除 |
| `execution_tasks` | 可被独立 Worker 领取的持久化异步任务 | 与 `test_execution` 一对一，执行记录删除时级联删除 |
| `xmind_records` | XMind 上传文件、上传人及解析数量 | 多对一关联 `users` |
| `system_configs` | 平台、执行环境、Webhook 和 AI 等全局配置 | 通过唯一配置键读取 |
| `alembic_version` | Alembic 当前迁移版本 | 迁移工具内部使用 |

## 3. 表字段说明

### `roles`

| 字段 | 存储内容 |
| --- | --- |
| `id` | 角色主键 |
| `name` | 唯一角色名称，如测试负责人、测试工程师 |
| `permissions` | JSON 权限矩阵，如用例查看、编辑、人员管理和系统设置权限 |
| `created_at`、`updated_at` | 创建和更新时间 |

### `users`

| 字段 | 存储内容 |
| --- | --- |
| `id` | 用户主键 |
| `account` | 唯一登录账号 |
| `name` | 用户姓名 |
| `avatar` | 可选的栅格图片 Base64 Data URL |
| `email` | 唯一邮箱地址 |
| `department` | 所属部门 |
| `role_id` | 关联的角色 ID |
| `status` | `enabled` 或 `disabled` |
| `password_hash` | PBKDF2 密码哈希，不保存明文密码 |
| `created_at`、`updated_at` | 创建和更新时间 |

### `auth_sessions`

| 字段 | 存储内容 |
| --- | --- |
| `id` | 会话主键 |
| `user_id` | 会话所属用户 ID |
| `token_hash` | 访问令牌的 SHA-256 摘要，不保存明文令牌 |
| `expires_at` | 会话过期时间 |
| `created_at` | 会话创建时间 |

### `modules`

| 字段 | 存储内容 |
| --- | --- |
| `id` | 模块字符串主键，如 `auth`、`payments` |
| `name` | 模块名称 |
| `parent_id` | 可选父模块 ID，用于构建模块树 |
| `project_id` | 所属项目 ID |
| `created_at`、`updated_at` | 创建和更新时间 |

### `test_cases`

| 字段 | 存储内容 |
| --- | --- |
| `id` | 用例主键 |
| `code` | 唯一用例编号，如 `FUN-12583`、`API-253301` |
| `title` | 用例名称 |
| `type` | `functional`、`api` 或 `ui` |
| `module_id` | 所属模块 ID |
| `priority` | `P0`、`P1`、`P2` 或 `P3` |
| `status` | `维护中`、`已通过`、`草稿`、`已失败` 或 `已停用` |
| `author_id` | 创建人或维护人 ID |
| `created_at`、`updated_at` | 创建和更新时间 |

### `api_case_details`

| 字段 | 存储内容 |
| --- | --- |
| `case_id` | 关联的接口用例 ID，同时作为主键 |
| `url` | 接口地址 |
| `method` | `GET`、`POST`、`PUT` 或 `DELETE` |
| `expected_code` | 100 至 599 的预期 HTTP 状态码 |
| `headers` | JSON 请求头 |
| `query_params` | 启用状态、键和值组成的 Query 参数列表 |
| `body_type` | `none`、`json`、`form-data` 或 `x-www-form-urlencoded` |
| `body_content` | JSON 等文本请求体 |
| `body_fields` | 表单请求体的启用状态、键和值列表 |
| `request_body` | 可选 JSON 请求体 |
| `expected_response` | 可选 JSON 预期响应 |
| `assertions` | 状态码、JSONPath 或响应时间断言规则 |
| `extracts` | 变量名与 JSONPath 组成的响应提取规则 |

### `ui_case_details`

| 字段 | 存储内容 |
| --- | --- |
| `case_id` | 关联的 UI 用例 ID，同时作为主键 |
| `description` | 用例说明与前置条件 |
| `dependency_case_id` | 可选的前置 UI 用例 ID |
| `browser`、`environment` | 默认浏览器与执行环境 |
| `timeout_seconds`、`retry_count` | 超时秒数和失败重试次数 |
| `steps` | JSON 测试步骤或脚本配置 |

### `test_execution`

| 字段 | 存储内容 |
| --- | --- |
| `id` | 执行记录主键 |
| `execution_code` | 唯一执行编号，如 `ui_exec_...` 或 `api_exec_...` |
| `type` | `UI` 或 `API` |
| `project_id` | 所属项目 ID |
| `env_name` | 执行环境标识 |
| `status` | `PENDING`、`RUNNING`、`COMPLETED`、`FAILED` 或 `CANCELLED` |
| `config_json` | JSON 执行配置，包括环境、浏览器、并发、迭代和全局请求头等 |
| `total_count`、`passed_count`、`failed_count` | 批次用例总数及结果计数 |
| `duration_ms` | 批次总耗时，单位毫秒 |
| `created_by` | 发起执行的用户 ID |
| `start_time`、`end_time` | 执行开始和结束时间 |
| `created_at`、`updated_at` | 创建和更新时间 |

### `test_execution_detail`

| 字段 | 存储内容 |
| --- | --- |
| `id` | 执行明细主键 |
| `execution_id` | 关联的执行记录 ID |
| `target_id` | UI 用例或接口用例 ID |
| `target_name` | 执行时保存的用例名称 |
| `status` | `PENDING`、`RUNNING`、`PASSED`、`FAILED` 或 `SKIPPED` |
| `duration_ms` | 执行耗时，单位毫秒 |
| `request_payload` | UI 步骤或接口请求方法、地址、请求头和请求体 |
| `response_payload` | 接口的最终渲染请求与响应，或 UI 步骤结果、日志、错误、截图和录屏地址 |
| `assertion_results` | JSON 断言结果列表 |

### `execution_tasks`

| 字段 | 存储内容 |
| --- | --- |
| `id` | 队列任务主键 |
| `execution_id` | 唯一关联的执行批次 ID |
| `status` | `PENDING`、`RUNNING`、`COMPLETED`、`FAILED` 或 `CANCELLED` |
| `attempts` | Worker 领取次数 |
| `available_at`、`locked_at` | 可领取时间和最近领取时间 |
| `completed_at`、`last_error` | 完成时间和任务级错误 |
| `created_at`、`updated_at` | 创建和更新时间 |

### `xmind_records`

| 字段 | 存储内容 |
| --- | --- |
| `id` | 上传记录主键 |
| `file_name` | 原始文件名 |
| `file_url` | 服务端存储文件的访问路径 |
| `uploader_id` | 上传用户 ID |
| `parsed_cases_count` | 解析出的用例数量 |
| `created_at` | 上传时间 |

### `system_configs`

| 字段 | 存储内容 |
| --- | --- |
| `id` | 配置主键 |
| `key` | 唯一配置键 |
| `value` | JSON 配置值，当前包含平台信息、执行环境、通知和 AI 设置 |
| `description` | 配置说明 |

### `alembic_version`

| 字段 | 存储内容 |
| --- | --- |
| `version_num` | 当前已应用的 Alembic 迁移版本号 |

## 4. 常用维护命令

```bash
# 查看当前迁移版本
./.venv/bin/alembic current

# 将数据库升级到最新结构
./.venv/bin/alembic upgrade head

# 检查 ORM 模型与迁移是否存在差异
./.venv/bin/alembic check

# 使用 SQLite 命令行打开本地数据库
sqlite3 backend/test_platform.db
```

进入 SQLite 命令行后可以使用：

```sql
.tables
.schema users
SELECT id, account, name, email, status FROM users;
```

## 5. 数据安全说明

- `backend/test_platform.db` 是本地运行数据，已由 `.gitignore` 排除，不应提交到版本库。
- `users.password_hash` 和 `auth_sessions.token_hash` 分别保存密码哈希与令牌摘要，不包含明文凭据。
- `system_configs.value` 可能包含 AI API Key、Webhook 等敏感配置，备份和迁移数据库时应按敏感数据处理。
- 应通过 Alembic 修改数据库结构，不要直接手工修改生产数据库表结构。

## 6. 表注释与 DataGrip

12 张应用业务表已在 SQLAlchemy 元数据中配置中文 `comment`，迁移也会在支持原生表注释的数据库中写入这些说明。`alembic_version` 由 Alembic 内部管理，不添加应用注释。

SQLite 不支持 `COMMENT ON TABLE`，也不会在数据库文件中持久化表注释。因此 DataGrip 连接当前 `backend/test_platform.db` 时无法从数据库读取原生 Comment；表含义以本文档“数据表总览”和 ORM 元数据为准。切换到 PostgreSQL、MySQL 等支持表注释的数据库并执行迁移后，DataGrip 才能直接显示这些 Comment。

## 7. 新增业务表约定

后续新增任何应用业务表时，必须同时完成以下事项：

1. 在 `backend/app/models.py` 的表定义中配置准确的中文 `comment`。
2. 新增 Alembic 迁移；对于支持原生表注释的数据库，迁移必须写入并可回滚该注释。
3. 在本文档中补充表用途、字段和关联关系，并更新仓库最新迁移版本。
4. 更新 `backend/tests/test_database.py` 的全表注释期望值，确保 ORM 表集合与注释集合完全一致。

`alembic_version` 等第三方工具内部表不属于应用业务表，不受此约定约束。
