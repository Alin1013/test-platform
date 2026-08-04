# UI 与接口自动化后端架构

## 1. 目标与边界

后端为 UI 自动化与接口自动化提供统一的用例配置、执行编排、结果查询和事件协议。当前仓库完成控制面、持久化任务队列、接口同步调试、批量 API Runner、Playwright UI Runner 与持续状态流。生产环境可将数据库任务领取和本地产物存储替换成 Redis/RabbitMQ 与 OSS 适配器。

## 2. 模块分层

```text
前端
  | REST / WebSocket
FastAPI 路由层
  |-- test_cases: 用例管理与接口同步调试
  `-- executions: 执行创建、中止、摘要、明细和事件
       |
服务层
  |-- test_cases: 用例领域校验与持久化
  |-- api_runner: 单次 HTTP 调试、断言和变量提取
  `-- executions: 执行快照与生命周期编排
       |
SQLAlchemy / Alembic
  |-- test_cases + api_case_details + ui_case_details
  `-- test_execution + test_execution_detail + execution_tasks
```

API 进程只依赖服务接口和数据库模型。独立 Worker 领取 `execution_tasks` 中的任务并回写明细；路由层不依赖 Celery、Redis 或 Playwright 的具体 API。

## 3. 数据模型映射

现有数据库使用公共主表加类型扩展表，避免 UI/API 公共字段和执行生命周期重复：

| 领域数据 | 表 | 说明 |
| --- | --- | --- |
| 用例公共信息 | `test_cases` | 编号、名称、模块、优先级、状态和维护人 |
| API 用例配置 | `api_case_details` | 请求、Query、Body、断言和变量提取规则 |
| UI 用例配置 | `ui_case_details` | 前置依赖、浏览器、环境、超时、重试和步骤 |
| 执行批次 | `test_execution` | 类型、环境、配置、状态、汇总、耗时和起止时间 |
| 执行明细 | `test_execution_detail` | 用例快照、请求/步骤、响应/媒体和断言结果 |
| 异步任务 | `execution_tasks` | Worker 领取状态、尝试次数、锁定/完成时间和任务错误 |

执行创建时必须把用例配置复制到明细。Worker 只消费执行快照，不重新读取用例定义，因此用户在任务运行期间编辑用例不会改变本次执行。

## 4. 公共接口

| 接口 | 行为 |
| --- | --- |
| `POST /api/v1/api-cases` | 创建接口自动化用例 |
| `POST /api/v1/ui-cases` | 创建 UI 自动化用例 |
| `POST /api/v1/api-cases/debug` | 同步发送一次 HTTP 请求；返回请求、响应、断言和提取结果，不创建执行历史 |
| `POST /api/v1/executions/start` | 创建 UI/API 执行批次和不可变用例快照，返回执行编号 |
| `POST /api/v1/executions/{id}/stop` | 将批次标记为 `CANCELLED`，未开始明细标记为 `SKIPPED` |
| `GET /api/v1/executions/{id}/summary` | 返回进度、通过率、平均耗时和批次时间 |
| `GET /api/v1/executions/{id}/details` | 返回 UI 步骤/媒体或 API 请求/响应/断言明细 |
| `WS /ws/execution/{id}` | 发送 `PROGRESS_UPDATE`、`CASE_STATUS_CHANGE` 和 `STEP_LOG` 快照 |

原有 `/ui-test/executions` 和 `/api-test/executions` 路径作为前端兼容接口继续保留。

## 5. 执行生命周期

```text
RUNNING
  |-- 所有明细结束 ----------------> COMPLETED
  |-- Worker 或系统错误 -----------> FAILED
  `-- 用户中止 --------------------> CANCELLED

明细: PENDING -> RUNNING -> PASSED | FAILED
                       `-> SKIPPED（批次被中止）
```

控制面以 `PENDING` 状态原子创建批次、明细和队列任务。Worker 领取后切换为 `RUNNING`：UI 批次按 `concurrency` 限制并发运行用例，API 批次按用例顺序传播提取变量；结束时统一更新批次计数、耗时和终态。WebSocket 服务轮询持久化状态并只发送发生变化的事件，终态后主动关闭连接。

## 6. Runner 接入约束

- API Worker 从明细的 `request_payload` 读取已合并的全局 Header、Query、Body、断言和提取规则。
- UI Worker 从明细读取步骤快照，每步完成后立即持久化步骤结果与日志，并在用例结束时写入错误、截图和视频 URL。
- 本地适配器将资源保存到 `/uploads/executions`；生产对象存储适配器只向数据库写入 URL，不把视频或截图二进制写入 JSON。
- Worker 必须幂等处理执行编号和明细 ID；终态任务不得再次执行。
- 中止采用协作式检查，发生在领取任务前、每次 API 迭代前后和每个 UI 步骤之间；已取消明细拒绝迟到结果回写。
- 队列投递失败时不得留下无法发现的任务；推荐使用事务 Outbox 或数据库扫描补偿。

## 7. 部署与安全

- 本地可使用 SQLite 持久化队列；多 Worker 生产环境推荐 PostgreSQL 的行锁，或替换为 Redis/RabbitMQ。
- 调试接口能够访问配置环境和绝对 HTTP(S) URL。生产部署应在网关或网络层限制可访问网段，防止 SSRF。
- Header、请求体、响应体和日志可能包含令牌或个人数据；落库和日志输出前应按项目规则脱敏。
- WebSocket 与 Worker 回写接口接入生产前必须补充与 REST API 一致的身份认证和项目权限校验。
- Worker 的最大并发、请求超时、浏览器超时、重试次数和产物保留期必须由系统配置控制。
