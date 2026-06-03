# PRD2Case Pipeline Design

Date: 2026-06-03

## Goal

Upgrade the existing AI test case generation feature from a one-step "PRD to test cases" flow into a usable "PRD to test points to reviewed test cases" workflow.

The first version keeps the current requirement analysis page, task API, SSE progress stream, Excel export, and save-to-records workflow. The main change is adding two required human review gates:

1. AI generates test points from the PRD. The user reviews and edits the test points before case generation starts.
2. AI generates test cases from the approved test points. The user reviews and edits cases on a preview page before Excel export is allowed.

This makes the feature more controllable: QA users can validate "what should be tested" before AI expands those points into detailed executable cases.

## Source Research

The user research document at `/Users/alin/Documents/自动化/prd-testcase-generation-framework.md` recommends avoiding one-shot generation. The adjusted MVP pipeline is:

1. Parse and clean PRD text or uploaded documents.
2. Capture user-provided PRD metadata.
3. Extract structured requirements and source traces.
4. Generate test points.
5. Pause for the first human review and edit step.
6. Generate test cases from approved test points.
7. Pause for the second human review and edit step on the preview page.
8. Export Excel only after the second review is confirmed.

## Current System Fit

The existing backend already has:

- `TestCaseGenerationTask` for asynchronous generation tasks.
- `AIModelConfig`, `PromptConfig`, and `GenerationConfig`.
- OpenAI-compatible model calls in `AIModelService`.
- Streaming and complete output modes.
- SSE progress endpoint at `stream_progress`.
- Progress polling endpoint.
- Save-to-records and batch adoption APIs.

The existing frontend already has:

- Manual text input and document upload entry points.
- Task creation through `/api/requirement-analysis/testcase-generation/generate/`.
- SSE streaming display.
- Final test case display.
- Excel export.
- Save generated cases to the test case management system.

Because of this, the MVP should upgrade the existing page and task flow instead of introducing a separate workspace.

## Scope

### In Scope

- Add required PRD metadata input: `需求ID`, `用例类型`, `创建人`, and `归属迭代`.
- Save those metadata fields on the generation task.
- Generate test points before test cases.
- Add a required human review and edit gate for generated test points.
- Generate test cases only after test points are approved.
- Add a required human review and edit gate for generated test cases.
- Export Excel only after the test case preview is approved.
- Export Excel using the exact header fields from the uploaded image.
- Keep `用例状态` blank in exported Excel. Users modify this column later after export.
- Keep existing model and prompt configuration screens.
- Keep existing task creation endpoint and response shape where possible.
- Return staged artifacts from task progress and detail serializers.
- Extend SSE to emit named pipeline stage and review-gate updates.
- Keep final Markdown output for backward compatibility.
- Add structured JSON output for reliable UI rendering, export, and future imports.
- Keep save-to-records working after the second review is approved.

### Out Of Scope For This Iteration

- Jira, Confluence, Figma, TAPD, ZenTao, or TestRail integrations.
- Historical test case RAG.
- Vector semantic dedupe with embeddings.
- Automated script generation.
- New permission model.
- New standalone PRD2Case page.

## User Workflow

### Step 1: Submit PRD And Metadata

The user enters or uploads PRD content from the existing requirement analysis page.

The submit form must also require:

- `需求ID`: one or more requirement IDs involved in the PRD.
- `用例类型`: default case type for generated rows.
- `创建人`: creator name to fill into Excel.
- `归属迭代`: iteration name/version to fill into Excel.

These fields are saved to the task and reused in generated test cases and Excel output.

### Step 2: AI Generates Test Points

AI analyzes the PRD and outputs editable test points. Test points describe what should be tested, not detailed steps.

Examples:

- 验证手机号验证码登录主流程.
- 验证验证码错误提示.
- 验证验证码过期后的处理.
- 验证连续错误达到上限后的锁定规则.

### Step 3: First Human Review

The task pauses after test points are generated.

The user can:

- Edit generated test points.
- Add missing test points.
- Delete irrelevant test points.
- Adjust priority, source trace, preconditions, test data hints, and expected focus.
- Approve the reviewed test point set.

Case generation cannot start until this review is approved.

### Step 4: AI Generates Test Cases

AI generates detailed test cases from the approved test points. The approved test points are the primary source; raw PRD text remains supporting context.

Each generated case must trace back to:

- One or more user-entered `需求ID` values.
- One approved test point.
- A PRD source quote or extracted acceptance criterion when possible.

### Step 5: Second Human Review

After cases are generated, the frontend shows an editable preview table.

The user can:

- Edit every Excel-bound field except `用例状态`.
- Add missing cases.
- Delete irrelevant cases.
- Reorder cases.
- Confirm the preview is ready for export.

Excel export and save-to-records are disabled until this review is approved.

### Step 6: Excel Export

Excel export uses the approved preview table as the source of truth.

The header row must exactly match the uploaded image:

1. 用例目录
2. 用例名称
3. 需求ID
4. 前置条件
5. 用例步骤
6. 预期结果
7. 用例类型
8. 用例状态
9. 用例等级
10. 创建人
11. 归属迭代

`用例状态` must remain blank in exported Excel. It is reserved for later user-side editing after export.

## Data Model Changes

Add these fields to `TestCaseGenerationTask`:

- `requirement_ids`: JSONField, default list. User-entered requirement IDs.
- `case_type`: CharField. User-entered default value for Excel `用例类型`.
- `case_creator`: CharField. User-entered default value for Excel `创建人`.
- `iteration`: CharField. User-entered default value for Excel `归属迭代`.
- `structured_requirements`: JSONField, default list.
- `testability_report`: JSONField, default object.
- `clarifying_questions`: JSONField, default list.
- `test_points`: JSONField, default list.
- `test_points_review_status`: CharField with values `pending`, `approved`, `revision_requested`.
- `test_points_reviewed_at`: DateTimeField, nullable.
- `test_points_reviewed_by`: ForeignKey to user, nullable.
- `strategy_matrix`: JSONField, default list.
- `scenario_matrix`: JSONField, default list.
- `test_cases_json`: JSONField, default list.
- `test_cases_review_status`: CharField with values `pending`, `approved`, `revision_requested`.
- `test_cases_reviewed_at`: DateTimeField, nullable.
- `test_cases_reviewed_by`: ForeignKey to user, nullable.
- `coverage_report`: JSONField, default object.
- `dedupe_report`: JSONField, default object.
- `pipeline_artifacts`: JSONField, default object.

Existing text fields remain:

- `generated_test_cases`: generated draft Markdown.
- `review_feedback`: AI review Markdown.
- `final_test_cases`: final Markdown consumed by current fallback export/import paths.
- `generation_log`: human-readable task log.

Excel export is allowed only when:

- `test_points_review_status = approved`
- `test_cases_review_status = approved`
- `test_cases_json` or `final_test_cases` is available

## Pipeline Service

Create a focused service, likely `apps/requirement_analysis/generation_pipeline.py`.

The service should expose async methods for separate phases because the flow pauses for human review:

```python
async def generate_test_points(task, callbacks=None) -> PipelineResult:
    ...

async def generate_test_cases_from_approved_points(task, callbacks=None) -> PipelineResult:
    ...
```

`AIModelService` continues to own low-level OpenAI-compatible API calls. The pipeline service owns stage orchestration, artifact normalization, JSON parsing, and Markdown/Excel-ready rendering.

## Pipeline Stages

### Stage 1: Document Normalize

Input:

- `task.requirement_text`

Output:

- Cleaned Markdown-like text.
- Simple document metadata such as length and detected sections.

Behavior:

- Preserve user-provided wording.
- Do basic cleanup without model calls where possible.
- Store normalized content in `pipeline_artifacts.document`.

### Stage 2: Metadata Capture

Input:

- `需求ID`
- `用例类型`
- `创建人`
- `归属迭代`

Behavior:

- Validate all four fields before creating the task.
- Store them on the task.
- Use them as defaults for generated cases and Excel rows.
- If `需求ID` contains multiple IDs, store as a list and render joined text in Excel.

### Stage 3: Structured Requirement Extraction

Output JSON shape:

```json
[
  {
    "id": "REQ-001",
    "title": "需求标题",
    "source": {
      "section": "来源章节",
      "quote": "原文片段"
    },
    "actors": [],
    "preconditions": [],
    "business_rules": [],
    "acceptance_criteria": [],
    "risk_level": "P1",
    "missing_info": []
  }
]
```

Rules:

- Only use information present in the PRD.
- Do not invent business rules.
- Include source quotes when possible.

Stored in:

- `structured_requirements`

### Stage 4: Testability And Clarification

Output JSON shape:

```json
{
  "overall_score": 0.78,
  "dimensions": [
    {
      "name": "验收标准",
      "score": 0.7,
      "issues": ["缺少明确失败提示"]
    }
  ],
  "requirement_scores": [
    {
      "requirement_id": "REQ-001",
      "score": 0.82,
      "missing_info": [],
      "risk_notes": []
    }
  ]
}
```

Clarifying questions shape:

```json
[
  {
    "requirement_id": "REQ-001",
    "question": "验证码错误次数达到上限后的锁定时长是多少？",
    "reason": "影响边界和状态迁移用例"
  }
]
```

Stored in:

- `testability_report`
- `clarifying_questions`

### Stage 5: Test Point Generation

Output JSON shape:

```json
[
  {
    "id": "TP-001",
    "requirement_ids": ["REQ-001"],
    "title": "验证码登录主流程验证",
    "test_object": "手机号验证码登录",
    "coverage_type": "functional",
    "design_technique": "scenario-based",
    "priority": "P1",
    "preconditions": ["用户未登录"],
    "test_data_hint": "已注册手机号、有效验证码",
    "expected_focus": "登录成功并跳转到目标页面",
    "source_trace": [
      {
        "requirement_id": "REQ-001",
        "quote": "输入正确手机号和验证码后登录成功"
      }
    ],
    "review_status": "pending",
    "review_comment": ""
  }
]
```

Rules:

- Test points describe test intent, not detailed steps.
- Every test point must trace back to a requirement ID or PRD source quote.
- Include positive, negative, boundary, permission, data, integration, and non-functional points when applicable.
- Keep the list editable before moving to case generation.

Stored in:

- `test_points`
- `pipeline_artifacts.test_points`

### Stage 6: First Human Review Gate

The task pauses after test point generation.

Allowed user actions:

- Edit test point title, priority, preconditions, data hint, expected focus, source trace, and review comment.
- Add missing test points.
- Delete irrelevant test points.
- Approve or reject individual test points.
- Approve the reviewed test point set and continue to case generation.

Behavior:

- Case generation cannot start until the reviewed test point set is approved.
- The approved test point JSON becomes the source input for test case generation.
- The system persists edited test points before starting the next stage.

Stored in:

- `test_points`
- `test_points_review_status`
- `test_points_reviewed_at`
- `test_points_reviewed_by`

### Stage 7: Test Strategy And Scenario Matrix

The strategy and scenario matrix can be generated from the approved test points. It remains useful for traceability and coverage reporting, but it is not the first human review artifact.

Strategy output example:

```json
[
  {
    "test_point_id": "TP-001",
    "requirement_id": "REQ-001",
    "category": "functional",
    "design_technique": "scenario-based",
    "coverage_target": ["AC-001"],
    "reason": "主流程需要验证用户成功完成目标动作",
    "priority": "P1"
  }
]
```

Scenario output example:

```json
[
  {
    "id": "SCN-001",
    "test_point_id": "TP-001",
    "requirement_id": "REQ-001",
    "title": "验证码登录主流程",
    "type": "functional",
    "design_technique": "scenario-based",
    "coverage_target": ["AC-001"],
    "priority": "P1"
  }
]
```

Stored in:

- `strategy_matrix`
- `scenario_matrix`

### Stage 8: Test Case Generation From Approved Test Points

Output JSON shape:

```json
[
  {
    "id": "TC-001",
    "catalog": "用户登录",
    "title": "验证已注册手机号使用正确验证码登录成功",
    "requirement_ids": ["REQ-001"],
    "test_point_id": "TP-001",
    "scenario_id": "SCN-001",
    "case_type": "功能测试",
    "priority": "P1",
    "creator": "张三",
    "iteration": "2026.06 版本迭代",
    "preconditions": ["用户未登录"],
    "steps": [
      {
        "index": 1,
        "action": "打开登录页，选择手机号验证码登录",
        "expected": "页面展示手机号和验证码输入框"
      }
    ],
    "expected_result": "登录成功并跳转到目标页面",
    "source_trace": [
      {
        "requirement_id": "REQ-001",
        "test_point_id": "TP-001",
        "acceptance_criteria": "输入正确手机号和验证码后登录成功"
      }
    ],
    "review_status": "pending",
    "review_comment": ""
  }
]
```

Rules:

- Every test case must bind to at least one approved test point.
- Every test case must bind to the user-entered requirement ID by default.
- Steps must be executable.
- Expected results must be verifiable.
- AI output must not include or fill case status.
- Cases without source support should not enter the final export unless the user manually approves them during preview review.

Stored in:

- `test_cases_json`
- `pipeline_artifacts.test_cases`
- `generated_test_cases` as Markdown/table fallback text.

### Stage 9: Second Human Review Gate

After case generation, the task enters preview/edit state.

Allowed user actions:

- Edit `用例目录`, `用例名称`, `需求ID`, `前置条件`, `用例步骤`, `预期结果`, `用例类型`, `用例等级`, `创建人`, and `归属迭代`.
- Add missing cases.
- Delete irrelevant cases.
- Reorder cases.
- Approve or reject cases.
- Approve the full preview set for Excel export.

Behavior:

- Excel export is disabled until the user confirms the preview is correct.
- Edited preview data is the source of Excel export.
- `用例状态` is displayed as a blank column for template consistency, but Excel export always writes it as blank.

Stored in:

- `test_cases_json`
- `test_cases_review_status`
- `test_cases_reviewed_at`
- `test_cases_reviewed_by`
- `final_test_cases`

### Stage 10: Coverage And Dedupe Review

Coverage report shape:

```json
{
  "requirement_coverage": 0.92,
  "test_point_coverage": 1.0,
  "matrix": [
    {
      "requirement_id": "REQ-001",
      "test_point_id": "TP-001",
      "scenario_id": "SCN-001",
      "test_case_id": "TC-001",
      "status": "covered"
    }
  ],
  "gaps": []
}
```

Dedupe report shape:

```json
{
  "duplicate_groups": [],
  "warnings": [
    {
      "test_case_id": "TC-010",
      "reason": "与 TC-009 步骤相似，但覆盖不同边界，不自动删除"
    }
  ]
}
```

Stored in:

- `coverage_report`
- `dedupe_report`
- `review_feedback` as a Markdown summary.

The MVP can use model-based and rule-based dedupe hints. It does not need embeddings.

## Excel Export Contract

Excel export must use the approved `test_cases_json` preview data when available.

Header fields, in order:

| Column | Field |
|---|---|
| A | 用例目录 |
| B | 用例名称 |
| C | 需求ID |
| D | 前置条件 |
| E | 用例步骤 |
| F | 预期结果 |
| G | 用例类型 |
| H | 用例状态 |
| I | 用例等级 |
| J | 创建人 |
| K | 归属迭代 |

Field mapping:

- `用例目录`: `case.catalog`
- `用例名称`: `case.title`
- `需求ID`: `case.requirement_ids`, defaulting to task `requirement_ids`
- `前置条件`: `case.preconditions`
- `用例步骤`: rendered numbered steps
- `预期结果`: `case.expected_result` or step-level expected results
- `用例类型`: `case.case_type`, defaulting to task `case_type`
- `用例状态`: always exported as an empty value
- `用例等级`: `case.priority`
- `创建人`: `case.creator`, defaulting to task `case_creator`
- `归属迭代`: `case.iteration`, defaulting to task `iteration`

Important rule:

- AI must not fill `用例状态`.
- The preview/export layer creates the `用例状态` column as an empty value.
- Excel export always writes `用例状态` as a blank cell. Users update this column later outside the AI generation flow.

## API Compatibility

Keep the current endpoint:

- `POST /api/requirement-analysis/testcase-generation/generate/`

Extend request fields:

- `title`
- `requirement_text`
- `requirement_ids`
- `case_type`
- `case_creator`
- `iteration`
- `use_writer_model`
- `use_reviewer_model`
- `output_mode`
- `project`

Extend progress response:

```json
{
  "task_id": "TASK_XXXXXXXX",
  "status": "generating",
  "progress": 45,
  "current_stage": "test_points_review",
  "requirement_ids": ["REQ-001"],
  "case_type": "功能测试",
  "case_creator": "张三",
  "iteration": "2026.06 版本迭代",
  "structured_requirements": [],
  "testability_report": {},
  "clarifying_questions": [],
  "test_points": [],
  "test_points_review_status": "pending",
  "strategy_matrix": [],
  "scenario_matrix": [],
  "test_cases_json": [],
  "test_cases_review_status": "pending",
  "coverage_report": {},
  "dedupe_report": {},
  "pipeline_artifacts": {},
  "generated_test_cases": "",
  "review_feedback": "",
  "final_test_cases": ""
}
```

Add or extend task actions:

- `PATCH /api/requirement-analysis/testcase-generation/{task_id}/test_points/`
  Save user edits to test points.
- `POST /api/requirement-analysis/testcase-generation/{task_id}/approve_test_points/`
  Mark reviewed test points as approved and start case generation.
- `PATCH /api/requirement-analysis/testcase-generation/{task_id}/test_cases/`
  Save user edits to preview test cases.
- `POST /api/requirement-analysis/testcase-generation/{task_id}/approve_test_cases/`
  Mark preview cases as approved and enable Excel export.
- `GET /api/requirement-analysis/testcase-generation/{task_id}/export_excel/`
  Export Excel only after test case review approval.

## SSE Events

Keep current event types:

- `progress`
- `content`
- `review_content`
- `final_content`
- `status`
- `done`

Add:

- `pipeline_stage`
- `review_gate`

Example stage event:

```json
{
  "type": "pipeline_stage",
  "stage": "test_point_generation",
  "title": "测试点生成",
  "progress": 35,
  "artifact": []
}
```

Example review gate event:

```json
{
  "type": "review_gate",
  "stage": "test_points_review",
  "title": "请审核测试点",
  "progress": 40
}
```

When a review gate is emitted, the frontend should stop auto-advancing and show the editable review UI.

## Frontend Changes

Keep `RequirementAnalysisView.vue` as the entry point.

Initial form changes:

- Add required inputs for `需求ID`, `用例类型`, `创建人`, and `归属迭代`.
- Send these fields with task creation.

Add staged panels:

- 需求抽取
- 可测试性与澄清问题
- 测试点审核
- 测试策略与场景矩阵
- 测试用例预览审核
- 覆盖与去重报告

Test point review panel:

- Editable list/table of generated test points.
- Buttons to add, delete, save, and approve.
- "生成测试用例" is disabled until test points are approved.

Case preview panel:

- Editable table with columns matching Excel:
  - 用例目录
  - 用例名称
  - 需求ID
  - 前置条件
  - 用例步骤
  - 预期结果
  - 用例类型
  - 用例状态
  - 用例等级
  - 创建人
  - 归属迭代
- Buttons to add, delete, save, approve, export Excel, and save to records.
- Excel export and save-to-records are disabled until preview is approved.
- The `用例状态` column is shown blank for template consistency and is exported blank.

Display behavior:

- During streaming, update current stage and show partial artifacts when available.
- After test point generation, pause at the editable test point review panel.
- After case generation, pause at the editable case preview table.
- On completion, fetch final task progress and render all artifacts.
- Keep existing Markdown display as a compatibility fallback.

## Prompt Strategy

The active writer prompt remains configurable by the user, but the pipeline service adds stage-specific user instructions.

Prompt principles:

- Ask for strict JSON for structured stages.
- Ask the model to generate test points before test cases.
- Generate test cases only from approved test points.
- Preserve user-entered `需求ID`, `用例类型`, `创建人`, and `归属迭代`.
- Do not fill `用例状态`; Excel export must keep it blank.
- Include a fallback parser that can extract JSON from fenced Markdown.
- If parsing fails, store a readable fallback artifact and continue when possible.
- Final Excel rows should be deterministic in Python from approved preview JSON.

## Error Handling

- If required metadata is missing at task creation, return a validation error before creating the task.
- If test point JSON parsing fails, save raw output and show a clear retry/edit path.
- If the user has not approved test points, case generation must not start.
- If case generation fails, keep approved test points available.
- If the user has not approved case preview, Excel export and save-to-records must return a clear error.
- If coverage/dedupe review fails, complete the task with generated cases and add an error note to `review_feedback`.
- Do not silently hide low testability scores or missing information.

## Testing And Verification

Backend verification:

- Run `python manage.py makemigrations requirement_analysis`.
- Run `python manage.py migrate`.
- Run `python manage.py check`.
- Add or update focused tests if the project has an active test pattern for this module.

Frontend verification:

- Run `npm --prefix frontend run build`.
- Start backend and frontend dev servers.
- Submit a small PRD with `需求ID`, `用例类型`, `创建人`, and `归属迭代`.
- Confirm test points are generated first.
- Edit at least one test point, approve the test point set, and continue generation.
- Confirm cases are generated from approved test points.
- Edit at least one case in the preview table.
- Confirm Excel export is disabled before case preview approval.
- Approve the preview and export Excel.
- Confirm Excel headers exactly match `用例目录`, `用例名称`, `需求ID`, `前置条件`, `用例步骤`, `预期结果`, `用例类型`, `用例状态`, `用例等级`, `创建人`, `归属迭代`.
- Confirm `需求ID`, `用例类型`, `创建人`, and `归属迭代` are filled from initial metadata.
- Confirm `用例状态` is blank in exported Excel.
- Confirm save-to-records still imports approved cases.

Manual sample PRD:

- 手机号验证码登录.
- Include success, wrong code, repeated failures, code expiry, and unregistered phone cases.

## Success Criteria

The feature is considered usable for this iteration when:

- A user can paste or upload PRD text from the existing page and must enter `需求ID`, `用例类型`, `创建人`, and `归属迭代`.
- AI generates test points before test cases.
- The user can review and edit generated test points before case generation.
- AI generates test cases only after the test point review is approved.
- The user can review and edit generated test cases in a preview table before export.
- Excel export is allowed only after the case preview review is approved.
- Excel output uses the required header fields from the uploaded image.
- Excel output fills initial metadata into `需求ID`, `用例类型`, `创建人`, and `归属迭代`.
- Excel output always keeps `用例状态` blank.
- Final test cases can still be saved into the test case management module after approval.
- Generated test cases have traceability back to approved test points and requirements or acceptance criteria.
