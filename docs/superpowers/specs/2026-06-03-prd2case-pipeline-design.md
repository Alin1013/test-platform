# PRD2Case Pipeline Design

Date: 2026-06-03

## Goal

Upgrade the existing AI test case generation feature from a one-step "requirement text to test cases" flow into a usable PRD-to-test-assets workflow.

The first version keeps the current requirement analysis page, task API, SSE progress stream, Excel export, and "save to test case records" workflow. The change adds staged AI artifacts so QA users can see how the model moved from PRD content to structured requirements, testability findings, test strategy, scenario matrix, final test cases, and coverage/dedupe review.

## Source Research

The user research document at `/Users/alin/Documents/自动化/prd-testcase-generation-framework.md` recommends avoiding one-shot generation. The project should instead follow a staged pipeline:

1. Parse and clean the document.
2. Extract structured requirements.
3. Score testability.
4. Generate clarification questions.
5. Plan test strategy.
6. Generate a scenario matrix.
7. Generate executable test cases.
8. Validate coverage, remove duplicates, support review and export.

This design implements that direction as an MVP retrofit of the current system.

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

Because of this, the MVP should not introduce a separate PRD2Case workspace. It should upgrade the existing page and task flow.

## Scope

### In Scope

- Add staged pipeline artifacts to `TestCaseGenerationTask`.
- Add a pipeline service that orchestrates the AI generation stages.
- Keep existing model and prompt configuration screens.
- Keep existing task creation endpoint and response shape.
- Return staged artifacts from task progress and detail serializers.
- Extend SSE to emit named pipeline stage updates.
- Show staged results in the existing frontend page.
- Keep final Markdown output for backward compatibility.
- Add structured JSON output for reliable UI rendering, export, and future imports.
- Keep Excel download and save-to-records working.

### Out of Scope For This Iteration

- Jira, Confluence, Figma, TAPD, ZenTao, or TestRail integrations.
- Historical test case RAG.
- Vector semantic dedupe with embeddings.
- Automated script generation.
- New permission model.
- New standalone PRD2Case page.

## Data Model Changes

Add the following fields to `TestCaseGenerationTask`:

- `structured_requirements`: JSONField, default object/list.
- `testability_report`: JSONField, default object.
- `clarifying_questions`: JSONField, default list.
- `strategy_matrix`: JSONField, default list.
- `scenario_matrix`: JSONField, default list.
- `coverage_report`: JSONField, default object.
- `dedupe_report`: JSONField, default object.
- `pipeline_artifacts`: JSONField, default object.

The existing text fields remain:

- `generated_test_cases`: raw/generated draft Markdown.
- `review_feedback`: AI review Markdown.
- `final_test_cases`: final Markdown consumed by current export/import paths.
- `generation_log`: human-readable task log.

The structured fields are the source for improved frontend display and future reliable exports. The Markdown fields preserve compatibility with existing parsing and adoption behavior.

## Pipeline Service

Create a focused service, likely `apps/requirement_analysis/generation_pipeline.py`.

The service should expose one main async method:

```python
async def run_prd2case_pipeline(task, callbacks=None) -> PipelineResult:
    ...
```

The service owns stage orchestration and artifact normalization. `AIModelService` continues to own low-level OpenAI-compatible API calls.

### Stage 1: Document Normalize

Input:

- `task.requirement_text`

Output:

- Cleaned Markdown-like text.
- Simple document metadata such as length and detected sections.

Behavior:

- Do not call the model for basic text cleanup in the MVP.
- Preserve user-provided wording.
- Store result in `pipeline_artifacts.document`.

### Stage 2: Structured Requirement Extraction

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
- Every requirement should include a source quote when possible.

Stored in:

- `structured_requirements`

### Stage 3: Testability And Clarification

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

The MVP should still generate cases when information is incomplete, but low-confidence or missing areas must be visible in the report.

### Stage 4: Test Strategy Matrix

Output JSON shape:

```json
[
  {
    "requirement_id": "REQ-001",
    "category": "functional",
    "design_technique": "scenario-based",
    "coverage_target": ["AC-001"],
    "reason": "主流程需要验证用户成功完成目标动作",
    "priority": "P1"
  }
]
```

Required categories when applicable:

- `functional`
- `negative`
- `boundary`
- `permission`
- `data`
- `integration`
- `non_functional`

Stored in:

- `strategy_matrix`

### Stage 5: Scenario Matrix

Output JSON shape:

```json
[
  {
    "id": "SCN-001",
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

- `scenario_matrix`

### Stage 6: Test Case Generation

Output JSON shape:

```json
[
  {
    "id": "TC-001",
    "title": "验证已注册手机号使用正确验证码登录成功",
    "requirement_ids": ["REQ-001"],
    "scenario_id": "SCN-001",
    "type": "functional",
    "priority": "P1",
    "preconditions": ["用户未登录"],
    "test_data": {
      "phone": "13800000000"
    },
    "steps": [
      {
        "index": 1,
        "action": "打开登录页，选择手机号验证码登录",
        "expected": "页面展示手机号和验证码输入框"
      }
    ],
    "source_trace": [
      {
        "requirement_id": "REQ-001",
        "acceptance_criteria": "输入正确手机号和验证码后登录成功"
      }
    ],
    "automation_candidate": true,
    "review_status": "draft"
  }
]
```

Rules:

- Every test case must bind to at least one requirement.
- Every test case should bind to one scenario.
- Steps must be executable.
- Expected results must be verifiable.
- Cases without source support should be marked as suggestions rather than normal cases.

Stored in:

- `pipeline_artifacts.test_cases`
- `generated_test_cases` as Markdown/table text.

### Stage 7: Coverage And Dedupe Review

Coverage report shape:

```json
{
  "requirement_coverage": 0.92,
  "acceptance_criteria_coverage": 0.88,
  "matrix": [
    {
      "requirement_id": "REQ-001",
      "acceptance_criteria": "AC-001 登录成功",
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

### Stage 8: Final Markdown Rendering

Render final cases into a stable Markdown table compatible with the current frontend parser.

Recommended columns:

- 用例 ID
- 模块
- 标题
- 优先级
- 类型
- 前置条件
- 测试数据
- 操作步骤
- 预期结果
- 来源需求
- 覆盖 AC
- 自动化建议
- 评审状态

Stored in:

- `final_test_cases`

## API Compatibility

Keep the current endpoint:

- `POST /api/requirement-analysis/testcase-generation/generate/`

Keep request fields:

- `title`
- `requirement_text`
- `use_writer_model`
- `use_reviewer_model`
- `output_mode`
- `project`

The endpoint should run the new pipeline internally.

Extend progress response:

```json
{
  "task_id": "TASK_XXXXXXXX",
  "status": "generating",
  "progress": 45,
  "current_stage": "scenario_matrix",
  "structured_requirements": [],
  "testability_report": {},
  "clarifying_questions": [],
  "strategy_matrix": [],
  "scenario_matrix": [],
  "coverage_report": {},
  "dedupe_report": {},
  "pipeline_artifacts": {},
  "generated_test_cases": "",
  "review_feedback": "",
  "final_test_cases": ""
}
```

`current_stage` can be stored inside `pipeline_artifacts` unless a separate model field is preferred.

## SSE Events

Keep current event types:

- `progress`
- `content`
- `review_content`
- `final_content`
- `status`
- `done`

Add a new event type:

- `pipeline_stage`

Example:

```json
{
  "type": "pipeline_stage",
  "stage": "strategy_matrix",
  "title": "测试策略矩阵",
  "progress": 42,
  "artifact": []
}
```

The frontend should tolerate missing `pipeline_stage` events so complete mode and old tasks remain compatible.

## Frontend Changes

Keep `RequirementAnalysisView.vue` as the entry point.

Add a staged result area with tabs or stacked panels:

- 需求抽取
- 可测试性与澄清问题
- 测试策略矩阵
- 场景矩阵
- 最终测试用例
- 覆盖与去重报告

Behavior:

- During streaming, update current stage and show partial artifacts when available.
- On completion, fetch final task progress and render all artifacts.
- Keep the current Markdown display for generated/final content.
- Keep Excel download and save buttons.
- Prefer structured JSON for future export if present; fall back to existing Markdown parsing.

## Prompt Strategy

The active writer prompt should remain configurable by the user, but the pipeline service adds stage-specific user instructions.

Prompt principles:

- Ask for strict JSON for structured stages.
- Include a fallback parser that can extract JSON from fenced Markdown.
- If parsing fails, store a readable fallback artifact and continue when possible.
- Final case rendering should be deterministic in Python from structured cases when JSON is valid.
- Avoid asking the model to output all artifacts in a single response.

## Error Handling

- If one AI stage fails, mark the task as failed only when downstream generation cannot continue.
- If JSON parsing fails for a non-critical artifact, save the raw text in `pipeline_artifacts.raw_outputs`.
- If final case JSON fails but Markdown exists, preserve Markdown and keep existing behavior.
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
- Generate cases from a small PRD.
- Confirm staged artifacts render.
- Confirm Excel export still downloads.
- Confirm save-to-records still imports cases.

Manual sample PRD:

- 手机号验证码登录.
- Include success, wrong code, repeated failures, code expiry, and unregistered phone cases.

## Success Criteria

The feature is considered usable for this iteration when:

- A user can paste or upload PRD text from the existing page.
- The task shows staged AI progress.
- The result includes structured requirements, testability findings, strategy, scenarios, final cases, and coverage/dedupe report.
- Final test cases remain exportable to Excel.
- Final test cases can still be saved into the test case management module.
- Generated test cases have traceability back to requirements or acceptance criteria.

