# PRD2Case Review Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reviewed PRD-to-test-points-to-test-cases workflow described in `docs/superpowers/specs/2026-06-03-prd2case-pipeline-design.md`.

**Architecture:** Keep the existing requirement analysis page and `TestCaseGenerationTask` API as the outer workflow. Add focused backend helpers for structured AI pipeline generation, review gates, Excel export, and structured parsing, while the frontend renders editable test point and case preview panels around the existing SSE/progress flow.

**Tech Stack:** Django 4.2, Django REST Framework, PyMySQL/MySQL, Vue 3, Vite, Element Plus, axios, xlsx, existing OpenAI-compatible `AIModelService`.

---

## File Structure

Backend files:

- Modify `apps/requirement_analysis/models.py`: add PRD metadata, structured artifact fields, and review status fields to `TestCaseGenerationTask`; keep existing AI model config relations.
- Modify `apps/requirement_analysis/serializers.py`: expose new fields and validate required PRD metadata in `TestCaseGenerationRequestSerializer`.
- Create `apps/requirement_analysis/generation_pipeline.py`: orchestrate test point generation, approved-point case generation, JSON parsing, Markdown rendering, and Excel row mapping.
- Modify `apps/requirement_analysis/views.py`: change initial generation to stop after test points, add review actions, add gated case generation, add gated Excel export, extend progress responses and SSE events.
- Add migration `apps/requirement_analysis/migrations/0003_prd2case_review_pipeline.py`.
- Add tests in `apps/requirement_analysis/test_prd2case_pipeline.py`: model defaults, request validation, API key config validation, review gates, Excel status blank rule.

Frontend files:

- Modify `frontend/src/views/requirement-analysis/RequirementAnalysisView.vue`: add required PRD metadata fields, staged panels, editable test point review, editable case preview, approval buttons, gated export.
- Modify `frontend/src/api/requirement-analysis.js`: add typed helpers for test point save/approve, case save/approve, Excel export.
- Modify `frontend/src/locales/lang/zh-cn/requirement.js`: add Chinese labels and messages.
- Modify `frontend/src/locales/lang/en/requirement.js`: add English fallback labels and messages.

Verification files and commands:

- Backend: `.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline`
- Backend check: `.venv/bin/python manage.py check`
- Migration: `.venv/bin/python manage.py makemigrations requirement_analysis`, `.venv/bin/python manage.py migrate`
- Frontend: `npm --prefix frontend run build`

---

### Task 1: Backend Model Fields And Serializer Validation

**Files:**
- Modify: `apps/requirement_analysis/models.py`
- Modify: `apps/requirement_analysis/serializers.py`
- Create: `apps/requirement_analysis/test_prd2case_pipeline.py`
- Generate: `apps/requirement_analysis/migrations/0003_prd2case_review_pipeline.py`

- [ ] **Step 1: Write failing model and serializer tests**

Add this test file:

```python
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.requirement_analysis.models import TestCaseGenerationTask
from apps.requirement_analysis.serializers import TestCaseGenerationRequestSerializer


class PRD2CaseTaskModelTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="prd2case_user",
            password="password123",
        )

    def test_task_defaults_include_review_artifacts(self):
        task = TestCaseGenerationTask.objects.create(
            task_id="TASK_TEST001",
            title="登录 PRD",
            requirement_text="手机号验证码登录需求",
            requirement_ids=["REQ-LOGIN-001"],
            case_type="功能测试",
            case_creator="张三",
            iteration="2026.06",
            created_by=self.user,
        )

        self.assertEqual(task.requirement_ids, ["REQ-LOGIN-001"])
        self.assertEqual(task.case_type, "功能测试")
        self.assertEqual(task.case_creator, "张三")
        self.assertEqual(task.iteration, "2026.06")
        self.assertEqual(task.test_points, [])
        self.assertEqual(task.test_cases_json, [])
        self.assertEqual(task.test_points_review_status, "pending")
        self.assertEqual(task.test_cases_review_status, "pending")


class TestCaseGenerationRequestSerializerTests(TestCase):
    def test_required_prd_metadata_is_validated(self):
        serializer = TestCaseGenerationRequestSerializer(data={
            "title": "登录 PRD",
            "requirement_text": "手机号验证码登录需求",
            "use_writer_model": True,
            "use_reviewer_model": True,
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn("requirement_ids", serializer.errors)
        self.assertIn("case_type", serializer.errors)
        self.assertIn("case_creator", serializer.errors)
        self.assertIn("iteration", serializer.errors)

    def test_requirement_ids_string_is_normalized_to_list(self):
        serializer = TestCaseGenerationRequestSerializer(data={
            "title": "登录 PRD",
            "requirement_text": "手机号验证码登录需求",
            "requirement_ids": "REQ-1, REQ-2",
            "case_type": "功能测试",
            "case_creator": "张三",
            "iteration": "2026.06",
            "use_writer_model": True,
            "use_reviewer_model": False,
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["requirement_ids"], ["REQ-1", "REQ-2"])
```

- [ ] **Step 2: Run the tests to confirm failure**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
```

Expected: FAIL because `TestCaseGenerationTask` has no new fields and the serializer does not validate the metadata.

- [ ] **Step 3: Add model fields**

In `apps/requirement_analysis/models.py`, add these choices and fields inside `TestCaseGenerationTask`:

```python
    REVIEW_STATUS_CHOICES = [
        ("pending", "待审核"),
        ("approved", "已审核"),
        ("revision_requested", "需修改"),
    ]
```

Add fields after `requirement_text`:

```python
    requirement_ids = models.JSONField(default=list, verbose_name="需求ID列表")
    case_type = models.CharField(max_length=100, blank=True, verbose_name="用例类型")
    case_creator = models.CharField(max_length=100, blank=True, verbose_name="创建人")
    iteration = models.CharField(max_length=100, blank=True, verbose_name="归属迭代")
```

Add fields near generation results:

```python
    structured_requirements = models.JSONField(default=list, blank=True, verbose_name="结构化需求")
    testability_report = models.JSONField(default=dict, blank=True, verbose_name="可测试性报告")
    clarifying_questions = models.JSONField(default=list, blank=True, verbose_name="澄清问题")
    test_points = models.JSONField(default=list, blank=True, verbose_name="测试点")
    test_points_review_status = models.CharField(
        max_length=30,
        choices=REVIEW_STATUS_CHOICES,
        default="pending",
        verbose_name="测试点审核状态",
    )
    test_points_reviewed_at = models.DateTimeField(null=True, blank=True, verbose_name="测试点审核时间")
    test_points_reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_test_point_tasks",
        verbose_name="测试点审核人",
    )
    strategy_matrix = models.JSONField(default=list, blank=True, verbose_name="测试策略矩阵")
    scenario_matrix = models.JSONField(default=list, blank=True, verbose_name="场景矩阵")
    test_cases_json = models.JSONField(default=list, blank=True, verbose_name="结构化测试用例")
    test_cases_review_status = models.CharField(
        max_length=30,
        choices=REVIEW_STATUS_CHOICES,
        default="pending",
        verbose_name="测试用例审核状态",
    )
    test_cases_reviewed_at = models.DateTimeField(null=True, blank=True, verbose_name="测试用例审核时间")
    test_cases_reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_test_case_tasks",
        verbose_name="测试用例审核人",
    )
    coverage_report = models.JSONField(default=dict, blank=True, verbose_name="覆盖率报告")
    dedupe_report = models.JSONField(default=dict, blank=True, verbose_name="去重报告")
    pipeline_artifacts = models.JSONField(default=dict, blank=True, verbose_name="流水线产物")
```

- [ ] **Step 4: Update serializers**

In `TestCaseGenerationTaskSerializer.Meta.fields`, include all new task fields:

```python
                 'requirement_ids', 'case_type', 'case_creator', 'iteration',
                 'structured_requirements', 'testability_report', 'clarifying_questions',
                 'test_points', 'test_points_review_status', 'test_points_reviewed_at',
                 'test_points_reviewed_by', 'strategy_matrix', 'scenario_matrix',
                 'test_cases_json', 'test_cases_review_status', 'test_cases_reviewed_at',
                 'test_cases_reviewed_by', 'coverage_report', 'dedupe_report',
                 'pipeline_artifacts',
```

In `read_only_fields`, add generated artifacts and review metadata but leave PRD metadata writable:

```python
                          'structured_requirements', 'testability_report', 'clarifying_questions',
                          'test_points', 'test_points_review_status', 'test_points_reviewed_at',
                          'test_points_reviewed_by', 'strategy_matrix', 'scenario_matrix',
                          'test_cases_json', 'test_cases_review_status', 'test_cases_reviewed_at',
                          'test_cases_reviewed_by', 'coverage_report', 'dedupe_report',
                          'pipeline_artifacts',
```

Replace `TestCaseGenerationRequestSerializer` with:

```python
class TestCaseGenerationRequestSerializer(serializers.Serializer):
    """测试用例生成请求序列化器"""
    title = serializers.CharField(max_length=200, help_text="任务标题")
    requirement_text = serializers.CharField(help_text="需求描述")
    requirement_ids = serializers.JSONField(help_text="需求ID，支持字符串或字符串列表")
    case_type = serializers.CharField(max_length=100, help_text="用例类型")
    case_creator = serializers.CharField(max_length=100, help_text="创建人")
    iteration = serializers.CharField(max_length=100, help_text="归属迭代")
    use_writer_model = serializers.BooleanField(default=True, help_text="是否使用编写模型")
    use_reviewer_model = serializers.BooleanField(default=True, help_text="是否使用评审模型")
    project = serializers.IntegerField(required=False, allow_null=True)

    def validate_requirement_ids(self, value):
        if isinstance(value, str):
            ids = [item.strip() for item in value.replace("；", ",").replace(";", ",").split(",")]
        elif isinstance(value, list):
            ids = [str(item).strip() for item in value]
        else:
            raise serializers.ValidationError("需求ID必须是字符串或字符串列表")

        ids = [item for item in ids if item]
        if not ids:
            raise serializers.ValidationError("请至少填写一个需求ID")
        return ids
```

- [ ] **Step 5: Generate and run migration**

Run:

```bash
.venv/bin/python manage.py makemigrations requirement_analysis
.venv/bin/python manage.py migrate
```

Expected: migration creates the new `TestCaseGenerationTask` fields and applies successfully.

- [ ] **Step 6: Run tests**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
```

Expected: PASS for model defaults and serializer validation.

- [ ] **Step 7: Commit**

```bash
git add apps/requirement_analysis/models.py apps/requirement_analysis/serializers.py apps/requirement_analysis/test_prd2case_pipeline.py apps/requirement_analysis/migrations
git commit -m "feat: add PRD2Case task metadata"
```

---

### Task 2: Pipeline Service For Test Points, Cases, And Excel Rows

**Files:**
- Create: `apps/requirement_analysis/generation_pipeline.py`
- Modify: `apps/requirement_analysis/test_prd2case_pipeline.py`

- [ ] **Step 1: Add failing pipeline tests**

Append tests:

```python
from apps.requirement_analysis.generation_pipeline import (
    PRD2CasePipeline,
    build_excel_rows,
    parse_json_payload,
)


class PRD2CasePipelineUtilityTests(TestCase):
    def test_parse_json_payload_extracts_fenced_json(self):
        payload = '```json\n[{"id":"TP-001","title":"登录主流程"}]\n```'

        self.assertEqual(parse_json_payload(payload), [{"id": "TP-001", "title": "登录主流程"}])

    def test_build_excel_rows_keeps_case_status_blank(self):
        rows = build_excel_rows(
            [{
                "catalog": "登录",
                "title": "验证码登录成功",
                "requirement_ids": ["REQ-1"],
                "preconditions": ["用户未登录"],
                "steps": [{"index": 1, "action": "输入验证码", "expected": "登录成功"}],
                "expected_result": "登录成功",
                "case_type": "功能测试",
                "priority": "P1",
                "creator": "张三",
                "iteration": "2026.06",
            }],
            defaults={
                "requirement_ids": ["REQ-DEFAULT"],
                "case_type": "功能测试",
                "case_creator": "张三",
                "iteration": "2026.06",
            },
        )

        self.assertEqual(rows[0]["用例状态"], "")
        self.assertEqual(rows[0]["需求ID"], "REQ-1")
        self.assertIn("1. 输入验证码", rows[0]["用例步骤"])
```

- [ ] **Step 2: Run tests to confirm failure**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
```

Expected: FAIL because `generation_pipeline.py` does not exist.

- [ ] **Step 3: Implement parsing and Excel helpers**

Create `apps/requirement_analysis/generation_pipeline.py`:

```python
import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional

from asgiref.sync import sync_to_async

from .models import AIModelService, TestCaseGenerationTask

logger = logging.getLogger(__name__)


EXCEL_HEADERS = [
    "用例目录",
    "用例名称",
    "需求ID",
    "前置条件",
    "用例步骤",
    "预期结果",
    "用例类型",
    "用例状态",
    "用例等级",
    "创建人",
    "归属迭代",
]


@dataclass
class PipelineResult:
    content: str
    artifact: Any


def parse_json_payload(content: str) -> Any:
    text = (content or "").strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fenced:
        text = fenced.group(1).strip()
    return json.loads(text)


def _join(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(str(item) for item in value if str(item).strip())
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _render_steps(steps: Any) -> str:
    if not isinstance(steps, list):
        return _join(steps)
    rendered = []
    for index, step in enumerate(steps, 1):
        if isinstance(step, dict):
            action = step.get("action", "")
            expected = step.get("expected", "")
            rendered.append(f"{step.get('index', index)}. {action}")
            if expected:
                rendered.append(f"   预期：{expected}")
        else:
            rendered.append(f"{index}. {step}")
    return "\n".join(rendered)


def build_excel_rows(test_cases: List[Dict[str, Any]], defaults: Dict[str, Any]) -> List[Dict[str, str]]:
    rows = []
    for case in test_cases:
        rows.append({
            "用例目录": _join(case.get("catalog")),
            "用例名称": _join(case.get("title")),
            "需求ID": _join(case.get("requirement_ids") or defaults.get("requirement_ids")),
            "前置条件": _join(case.get("preconditions")),
            "用例步骤": _render_steps(case.get("steps")),
            "预期结果": _join(case.get("expected_result")),
            "用例类型": _join(case.get("case_type") or defaults.get("case_type")),
            "用例状态": "",
            "用例等级": _join(case.get("priority")),
            "创建人": _join(case.get("creator") or defaults.get("case_creator")),
            "归属迭代": _join(case.get("iteration") or defaults.get("iteration")),
        })
    return rows
```

- [ ] **Step 4: Implement AI stage orchestration**

Add to the same file:

```python
class PRD2CasePipeline:
    def __init__(self, task: TestCaseGenerationTask):
        self.task = task

    def _writer_messages(self, stage: str, user_content: str) -> List[Dict[str, str]]:
        return [
            {"role": "system", "content": self.task.writer_prompt_config.content},
            {"role": "user", "content": f"阶段：{stage}\n\n{user_content}"},
        ]

    async def _call_writer(self, stage: str, user_content: str) -> str:
        response = await AIModelService.call_openai_compatible_api(
            self.task.writer_model_config,
            self._writer_messages(stage, user_content),
        )
        return response["choices"][0]["message"]["content"]

    async def generate_test_points(self) -> PipelineResult:
        prompt = f"""
请基于以下 PRD 生成测试点 JSON 数组，不要生成测试用例步骤。
每个测试点字段必须包含 id、requirement_ids、title、test_object、coverage_type、design_technique、priority、preconditions、test_data_hint、expected_focus、source_trace、review_status、review_comment。
review_status 固定为 pending，review_comment 固定为空字符串。
需求ID默认使用：{self.task.requirement_ids}
PRD内容：
{self.task.requirement_text}
"""
        content = await self._call_writer("测试点生成", prompt)
        artifact = parse_json_payload(content)
        return PipelineResult(content=content, artifact=artifact)

    async def generate_cases_from_points(self) -> PipelineResult:
        prompt = f"""
请只基于已审核测试点生成测试用例 JSON 数组。
禁止输出用例状态字段。
每条用例必须包含 id、catalog、title、requirement_ids、test_point_id、scenario_id、case_type、priority、creator、iteration、preconditions、steps、expected_result、source_trace、review_status、review_comment。
默认需求ID：{self.task.requirement_ids}
默认用例类型：{self.task.case_type}
默认创建人：{self.task.case_creator}
默认归属迭代：{self.task.iteration}
已审核测试点：
{json.dumps(self.task.test_points, ensure_ascii=False)}
PRD内容：
{self.task.requirement_text}
"""
        content = await self._call_writer("测试用例生成", prompt)
        artifact = parse_json_payload(content)
        return PipelineResult(content=content, artifact=artifact)

    @staticmethod
    async def save_stage(task: TestCaseGenerationTask, **fields):
        for name, value in fields.items():
            setattr(task, name, value)
        await sync_to_async(task.save)(update_fields=list(fields.keys()) + ["updated_at"])
```

- [ ] **Step 5: Run tests**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
```

Expected: PASS for utility tests.

- [ ] **Step 6: Commit**

```bash
git add apps/requirement_analysis/generation_pipeline.py apps/requirement_analysis/test_prd2case_pipeline.py
git commit -m "feat: add PRD2Case pipeline helpers"
```

---

### Task 3: Initial Generation Stops At Test Point Review

**Files:**
- Modify: `apps/requirement_analysis/views.py`
- Modify: `apps/requirement_analysis/test_prd2case_pipeline.py`

- [ ] **Step 1: Add failing API validation tests**

Append:

```python
from rest_framework.test import APIRequestFactory

from apps.requirement_analysis.models import AIModelConfig, PromptConfig
from apps.requirement_analysis.views import TestCaseGenerationTaskViewSet


class TestCaseGenerationConfigValidationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("api_user", password="password123")
        self.factory = APIRequestFactory()

    def test_generate_requires_writer_api_key(self):
        AIModelConfig.objects.create(
            name="Writer without key",
            model_type="deepseek",
            role="writer",
            api_key="",
            base_url="https://api.example.com",
            model_name="model",
            is_active=True,
            created_by=self.user,
        )
        PromptConfig.objects.create(
            name="Writer prompt",
            prompt_type="writer",
            content="你是测试专家",
            is_active=True,
            created_by=self.user,
        )
        request = self.factory.post("/api/requirement-analysis/testcase-generation/generate/", {
            "title": "登录 PRD",
            "requirement_text": "手机号登录",
            "requirement_ids": ["REQ-1"],
            "case_type": "功能测试",
            "case_creator": "张三",
            "iteration": "2026.06",
            "use_writer_model": True,
            "use_reviewer_model": False,
        }, format="json")
        request.user = self.user

        response = TestCaseGenerationTaskViewSet.as_view({"post": "generate"})(request)

        self.assertEqual(response.status_code, 400)
        self.assertIn("API Key", response.data["error"])
```

- [ ] **Step 2: Run tests to confirm failure**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline.TestCaseGenerationConfigValidationTests
```

Expected: FAIL because `generate` does not reject empty API keys.

- [ ] **Step 3: Add config validation helper**

In `TestCaseGenerationTaskViewSet`, add:

```python
    def _ensure_ai_config_ready(self, config, role_label):
        if not config:
            return f"未找到可用的{role_label}模型配置"
        if not config.api_key:
            return f"{role_label}模型配置缺少 API Key"
        return None
```

Use it after finding `writer_config` and `reviewer_config`:

```python
                config_error = self._ensure_ai_config_ready(writer_config, "测试用例编写")
                if config_error:
                    return Response({"error": config_error}, status=status.HTTP_400_BAD_REQUEST)
```

For reviewer:

```python
                config_error = self._ensure_ai_config_ready(reviewer_config, "测试用例评审")
                if config_error:
                    return Response({"error": config_error}, status=status.HTTP_400_BAD_REQUEST)
```

- [ ] **Step 4: Save PRD metadata on task creation**

In `task_data`, include:

```python
                "requirement_ids": validated_data["requirement_ids"],
                "case_type": validated_data["case_type"],
                "case_creator": validated_data["case_creator"],
                "iteration": validated_data["iteration"],
```

- [ ] **Step 5: Replace initial async work with test point generation**

Inside `execute_task`, in both stream and complete branches, replace direct `AIModelService.generate_test_cases*` usage with:

```python
from .generation_pipeline import PRD2CasePipeline

pipeline = PRD2CasePipeline(task)
task.status = "generating"
task.progress = 20
task.pipeline_artifacts = {"current_stage": "test_point_generation"}
task.save(update_fields=["status", "progress", "pipeline_artifacts"])

result = loop.run_until_complete(pipeline.generate_test_points())
task.test_points = result.artifact
task.pipeline_artifacts = {
    **(task.pipeline_artifacts or {}),
    "current_stage": "test_points_review",
    "raw_test_points": result.content,
}
task.progress = 40
task.status = "reviewing"
task.save(update_fields=["test_points", "pipeline_artifacts", "progress", "status"])
```

Do not set `final_test_cases` in this initial branch.

- [ ] **Step 6: Extend progress response**

In `progress`, add:

```python
                "requirement_ids": task.requirement_ids,
                "case_type": task.case_type,
                "case_creator": task.case_creator,
                "iteration": task.iteration,
                "current_stage": (task.pipeline_artifacts or {}).get("current_stage", ""),
                "structured_requirements": task.structured_requirements,
                "testability_report": task.testability_report,
                "clarifying_questions": task.clarifying_questions,
                "test_points": task.test_points,
                "test_points_review_status": task.test_points_review_status,
                "strategy_matrix": task.strategy_matrix,
                "scenario_matrix": task.scenario_matrix,
                "test_cases_json": task.test_cases_json,
                "test_cases_review_status": task.test_cases_review_status,
                "coverage_report": task.coverage_report,
                "dedupe_report": task.dedupe_report,
                "pipeline_artifacts": task.pipeline_artifacts,
```

- [ ] **Step 7: Run tests and check**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
.venv/bin/python manage.py check
```

Expected: PASS and no Django system check issues.

- [ ] **Step 8: Commit**

```bash
git add apps/requirement_analysis/views.py apps/requirement_analysis/test_prd2case_pipeline.py
git commit -m "feat: generate PRD test points first"
```

---

### Task 4: Review Gate API Actions And Gated Excel Export

**Files:**
- Modify: `apps/requirement_analysis/views.py`
- Modify: `apps/requirement_analysis/test_prd2case_pipeline.py`

- [ ] **Step 1: Add failing review gate tests**

Append:

```python
class PRD2CaseReviewGateTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("review_user", password="password123")
        self.task = TestCaseGenerationTask.objects.create(
            task_id="TASK_GATE001",
            title="登录 PRD",
            requirement_text="手机号登录",
            requirement_ids=["REQ-1"],
            case_type="功能测试",
            case_creator="张三",
            iteration="2026.06",
            test_points=[{"id": "TP-001", "title": "登录主流程", "review_status": "pending"}],
            created_by=self.user,
        )

    def test_export_requires_case_review_approval(self):
        factory = APIRequestFactory()
        request = factory.get(f"/api/requirement-analysis/testcase-generation/{self.task.task_id}/export_excel/")
        request.user = self.user

        response = TestCaseGenerationTaskViewSet.as_view({"get": "export_excel"})(request, task_id=self.task.task_id)

        self.assertEqual(response.status_code, 400)
        self.assertIn("审核", response.data["error"])
```

- [ ] **Step 2: Implement save/approve test point actions**

Add to `TestCaseGenerationTaskViewSet`:

```python
    @action(detail=True, methods=["patch"], url_path="test_points")
    def update_test_points(self, request, task_id=None):
        task = self.get_object()
        points = request.data.get("test_points", [])
        if not isinstance(points, list):
            return Response({"error": "test_points 必须是数组"}, status=status.HTTP_400_BAD_REQUEST)
        task.test_points = points
        task.test_points_review_status = "revision_requested"
        task.save(update_fields=["test_points", "test_points_review_status", "updated_at"])
        return Response({"message": "测试点已保存", "test_points": task.test_points})
```

Add:

```python
    @action(detail=True, methods=["post"], url_path="approve_test_points")
    def approve_test_points(self, request, task_id=None):
        task = self.get_object()
        if not task.test_points:
            return Response({"error": "没有可审核的测试点"}, status=status.HTTP_400_BAD_REQUEST)
        task.test_points_review_status = "approved"
        task.test_points_reviewed_at = timezone.now()
        task.test_points_reviewed_by = request.user if request.user.is_authenticated else task.created_by
        task.save(update_fields=["test_points_review_status", "test_points_reviewed_at", "test_points_reviewed_by", "updated_at"])
        self._start_case_generation_thread(task.task_id)
        return Response({"message": "测试点已审核，已开始生成测试用例", "task_id": task.task_id})
```

- [ ] **Step 3: Extract case generation thread helper**

Add `_start_case_generation_thread` to the viewset:

```python
    def _start_case_generation_thread(self, task_id):
        import threading

        def execute():
            task = TestCaseGenerationTask.objects.get(task_id=task_id)
            try:
                import asyncio
                from .generation_pipeline import PRD2CasePipeline

                task.status = "generating"
                task.progress = 55
                task.pipeline_artifacts = {**(task.pipeline_artifacts or {}), "current_stage": "case_generation"}
                task.save(update_fields=["status", "progress", "pipeline_artifacts"])

                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    result = loop.run_until_complete(PRD2CasePipeline(task).generate_cases_from_points())
                finally:
                    loop.close()

                task.test_cases_json = result.artifact
                task.generated_test_cases = result.content
                task.pipeline_artifacts = {**(task.pipeline_artifacts or {}), "current_stage": "test_cases_review"}
                task.status = "reviewing"
                task.progress = 80
                task.save(update_fields=["test_cases_json", "generated_test_cases", "pipeline_artifacts", "status", "progress", "updated_at"])
            except Exception as exc:
                logger.error(f"测试用例生成失败: {exc}")
                task.status = "failed"
                task.error_message = str(exc)
                task.save(update_fields=["status", "error_message", "updated_at"])

        thread = threading.Thread(target=execute)
        thread.daemon = True
        thread.start()
```

- [ ] **Step 4: Implement save/approve case actions**

Add:

```python
    @action(detail=True, methods=["patch"], url_path="test_cases")
    def update_test_cases_json(self, request, task_id=None):
        task = self.get_object()
        cases = request.data.get("test_cases", [])
        if not isinstance(cases, list):
            return Response({"error": "test_cases 必须是数组"}, status=status.HTTP_400_BAD_REQUEST)
        task.test_cases_json = cases
        task.test_cases_review_status = "revision_requested"
        task.save(update_fields=["test_cases_json", "test_cases_review_status", "updated_at"])
        return Response({"message": "测试用例预览已保存", "test_cases": task.test_cases_json})
```

Add:

```python
    @action(detail=True, methods=["post"], url_path="approve_test_cases")
    def approve_test_cases(self, request, task_id=None):
        task = self.get_object()
        if not task.test_cases_json:
            return Response({"error": "没有可审核的测试用例"}, status=status.HTTP_400_BAD_REQUEST)
        task.test_cases_review_status = "approved"
        task.test_cases_reviewed_at = timezone.now()
        task.test_cases_reviewed_by = request.user if request.user.is_authenticated else task.created_by
        task.status = "completed"
        task.progress = 100
        task.completed_at = timezone.now()
        task.save(update_fields=["test_cases_review_status", "test_cases_reviewed_at", "test_cases_reviewed_by", "status", "progress", "completed_at", "updated_at"])
        return Response({"message": "测试用例已审核，可导出 Excel", "task_id": task.task_id})
```

- [ ] **Step 5: Implement gated Excel export**

Add:

```python
    @action(detail=True, methods=["get"], url_path="export_excel")
    def export_excel(self, request, task_id=None):
        task = self.get_object()
        if task.test_cases_review_status != "approved":
            return Response({"error": "请先完成人工审核后再导出 Excel"}, status=status.HTTP_400_BAD_REQUEST)
        from io import BytesIO
        import openpyxl
        from django.http import HttpResponse
        from .generation_pipeline import EXCEL_HEADERS, build_excel_rows

        rows = build_excel_rows(task.test_cases_json, {
            "requirement_ids": task.requirement_ids,
            "case_type": task.case_type,
            "case_creator": task.case_creator,
            "iteration": task.iteration,
        })
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = "测试用例"
        sheet.append(EXCEL_HEADERS)
        for row in rows:
            sheet.append([row.get(header, "") for header in EXCEL_HEADERS])

        output = BytesIO()
        workbook.save(output)
        output.seek(0)
        response = HttpResponse(
            output.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{task.task_id}_testcases.xlsx"'
        return response
```

- [ ] **Step 6: Gate save-to-records**

At the start of `save_to_records`, after task lookup, add:

```python
            if task.test_cases_review_status != "approved":
                return Response(
                    {"error": "请先完成测试用例预览审核后再保存到记录"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
```

- [ ] **Step 7: Run tests**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
.venv/bin/python manage.py check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/requirement_analysis/views.py apps/requirement_analysis/test_prd2case_pipeline.py
git commit -m "feat: add PRD2Case review gates"
```

---

### Task 5: Frontend Metadata Form And API Helpers

**Files:**
- Modify: `frontend/src/api/requirement-analysis.js`
- Modify: `frontend/src/views/requirement-analysis/RequirementAnalysisView.vue`
- Modify: `frontend/src/locales/lang/zh-cn/requirement.js`
- Modify: `frontend/src/locales/lang/en/requirement.js`

- [ ] **Step 1: Add API helpers**

In `frontend/src/api/requirement-analysis.js`, add:

```javascript
export function updateGeneratedTestPoints(taskId, testPoints) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/test_points/`,
    method: 'patch',
    data: { test_points: testPoints }
  })
}

export function approveGeneratedTestPoints(taskId) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/approve_test_points/`,
    method: 'post'
  })
}

export function updateGeneratedTestCases(taskId, testCases) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/test_cases/`,
    method: 'patch',
    data: { test_cases: testCases }
  })
}

export function approveGeneratedTestCases(taskId) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/approve_test_cases/`,
    method: 'post'
  })
}

export function exportGeneratedTestCasesExcel(taskId) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/export_excel/`,
    method: 'get',
    responseType: 'blob'
  })
}
```

- [ ] **Step 2: Add metadata fields to component data**

In `manualInput`, add:

```javascript
        requirementIds: '',
        caseType: '',
        caseCreator: '',
        iteration: ''
```

Add parallel document metadata data fields:

```javascript
      documentRequirementIds: '',
      documentCaseType: '',
      documentCaseCreator: '',
      documentIteration: '',
```

- [ ] **Step 3: Add form inputs**

In the manual input form, below requirement description, add four form groups:

```vue
<div class="form-group metadata-grid">
  <div>
    <label>需求ID <span class="required">*</span></label>
    <input v-model="manualInput.requirementIds" type="text" class="form-input" placeholder="例如：REQ-LOGIN-001">
  </div>
  <div>
    <label>用例类型 <span class="required">*</span></label>
    <input v-model="manualInput.caseType" type="text" class="form-input" placeholder="例如：功能测试">
  </div>
  <div>
    <label>创建人 <span class="required">*</span></label>
    <input v-model="manualInput.caseCreator" type="text" class="form-input" placeholder="例如：张三">
  </div>
  <div>
    <label>归属迭代 <span class="required">*</span></label>
    <input v-model="manualInput.iteration" type="text" class="form-input" placeholder="例如：2026.06">
  </div>
</div>
```

Add equivalent fields in the document upload info block using `documentRequirementIds`, `documentCaseType`, `documentCaseCreator`, and `documentIteration`.

- [ ] **Step 4: Update generation payload**

Change `startGeneration` signature:

```javascript
async startGeneration(title, requirementText, projectId, outputMode = 'stream', metadata = {}) {
```

Add to `requestData`:

```javascript
          requirement_ids: metadata.requirementIds,
          case_type: metadata.caseType,
          case_creator: metadata.caseCreator,
          iteration: metadata.iteration,
```

Pass metadata from manual and document generation callers.

- [ ] **Step 5: Update generation availability checks**

Update `canGenerateManual` to require:

```javascript
return this.manualInput.title.trim() &&
  this.manualInput.description.trim() &&
  this.manualInput.requirementIds.trim() &&
  this.manualInput.caseType.trim() &&
  this.manualInput.caseCreator.trim() &&
  this.manualInput.iteration.trim()
```

For document generation button, require `documentTitle`, selected file, and the four document metadata fields.

- [ ] **Step 6: Build and commit**

Run:

```bash
npm --prefix frontend run build
```

Expected: build succeeds.

Commit:

```bash
git add frontend/src/api/requirement-analysis.js frontend/src/views/requirement-analysis/RequirementAnalysisView.vue frontend/src/locales/lang/zh-cn/requirement.js frontend/src/locales/lang/en/requirement.js
git commit -m "feat: add PRD2Case metadata input"
```

---

### Task 6: Frontend Test Point Review And Case Preview Panels

**Files:**
- Modify: `frontend/src/views/requirement-analysis/RequirementAnalysisView.vue`

- [ ] **Step 1: Add state**

Add to `data()`:

```javascript
      testPoints: [],
      testCasesJson: [],
      testPointsReviewStatus: 'pending',
      testCasesReviewStatus: 'pending',
      currentPipelineStage: '',
      isSavingReview: false,
```

- [ ] **Step 2: Populate structured artifacts from progress**

In `fetchFinalResult` and polling success branches, after `const task = response.data`, add:

```javascript
        this.currentPipelineStage = task.current_stage || ''
        this.testPoints = Array.isArray(task.test_points) ? task.test_points : []
        this.testCasesJson = Array.isArray(task.test_cases_json) ? task.test_cases_json : []
        this.testPointsReviewStatus = task.test_points_review_status || 'pending'
        this.testCasesReviewStatus = task.test_cases_review_status || 'pending'
```

In SSE `onmessage`, handle:

```javascript
          } else if (data.type === 'review_gate') {
            this.currentPipelineStage = data.stage
            this.progressText = data.title
```

- [ ] **Step 3: Add test point review template**

Below progress steps, add:

```vue
<div v-if="testPoints.length" class="review-panel">
  <div class="review-panel-header">
    <h3>测试点审核</h3>
    <span class="review-status">{{ testPointsReviewStatus }}</span>
  </div>
  <div v-for="(point, index) in testPoints" :key="point.id || index" class="review-item">
    <input v-model="point.title" class="form-input" placeholder="测试点标题">
    <textarea v-model="point.expected_focus" class="form-textarea" rows="2" placeholder="预期关注点"></textarea>
    <input v-model="point.priority" class="form-input" placeholder="优先级">
    <button class="delete-btn" @click="removeTestPoint(index)">删除</button>
  </div>
  <div class="review-actions">
    <button class="generate-manual-btn" @click="addTestPoint">新增测试点</button>
    <button class="save-btn" :disabled="isSavingReview" @click="saveTestPoints">保存测试点</button>
    <button class="generate-btn" :disabled="isSavingReview || !testPoints.length" @click="approveTestPoints">审核通过并生成测试用例</button>
  </div>
</div>
```

- [ ] **Step 4: Add case preview template**

Add:

```vue
<div v-if="testCasesJson.length" class="review-panel case-preview-panel">
  <div class="review-panel-header">
    <h3>测试用例预览审核</h3>
    <span class="review-status">{{ testCasesReviewStatus }}</span>
  </div>
  <div class="case-preview-table">
    <table>
      <thead>
        <tr>
          <th>用例目录</th><th>用例名称</th><th>需求ID</th><th>前置条件</th><th>用例步骤</th><th>预期结果</th><th>用例类型</th><th>用例状态</th><th>用例等级</th><th>创建人</th><th>归属迭代</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(testCase, index) in testCasesJson" :key="testCase.id || index">
          <td><input v-model="testCase.catalog"></td>
          <td><input v-model="testCase.title"></td>
          <td><input :value="formatRequirementIds(testCase.requirement_ids)" @input="testCase.requirement_ids = splitRequirementIds($event.target.value)"></td>
          <td><textarea :value="formatList(testCase.preconditions)" @input="testCase.preconditions = splitLines($event.target.value)"></textarea></td>
          <td><textarea :value="formatSteps(testCase.steps)" @input="testCase.steps_text = $event.target.value"></textarea></td>
          <td><textarea v-model="testCase.expected_result"></textarea></td>
          <td><input v-model="testCase.case_type"></td>
          <td><input value="" disabled></td>
          <td><input v-model="testCase.priority"></td>
          <td><input v-model="testCase.creator"></td>
          <td><input v-model="testCase.iteration"></td>
          <td><button class="delete-btn" @click="removeTestCase(index)">删除</button></td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="review-actions">
    <button class="generate-manual-btn" @click="addTestCase">新增用例</button>
    <button class="save-btn" :disabled="isSavingReview" @click="saveTestCasesJson">保存预览</button>
    <button class="generate-btn" :disabled="isSavingReview || !testCasesJson.length" @click="approveTestCases">审核通过</button>
  </div>
</div>
```

- [ ] **Step 5: Add methods**

Import helpers:

```javascript
import {
  updateGeneratedTestPoints,
  approveGeneratedTestPoints,
  updateGeneratedTestCases,
  approveGeneratedTestCases,
  exportGeneratedTestCasesExcel
} from '@/api/requirement-analysis'
```

Add methods:

```javascript
    addTestPoint() {
      this.testPoints.push({ id: `TP-${String(this.testPoints.length + 1).padStart(3, '0')}`, title: '', expected_focus: '', priority: 'P2', review_status: 'pending', review_comment: '' })
    },
    removeTestPoint(index) {
      this.testPoints.splice(index, 1)
    },
    async saveTestPoints() {
      this.isSavingReview = true
      try {
        await updateGeneratedTestPoints(this.currentTaskId, this.testPoints)
        ElMessage.success('测试点已保存')
      } finally {
        this.isSavingReview = false
      }
    },
    async approveTestPoints() {
      await this.saveTestPoints()
      await approveGeneratedTestPoints(this.currentTaskId)
      ElMessage.success('测试点已审核，开始生成测试用例')
      this.startPolling()
    },
    formatRequirementIds(ids) {
      return Array.isArray(ids) ? ids.join(', ') : (ids || '')
    },
    splitRequirementIds(value) {
      return value.split(/[,，;；]/).map(item => item.trim()).filter(Boolean)
    },
    formatList(value) {
      return Array.isArray(value) ? value.join('\n') : (value || '')
    },
    splitLines(value) {
      return value.split('\n').map(item => item.trim()).filter(Boolean)
    },
    formatSteps(steps) {
      if (!Array.isArray(steps)) return steps || ''
      return steps.map((step, index) => `${step.index || index + 1}. ${step.action || step}`).join('\n')
    },
    addTestCase() {
      this.testCasesJson.push({ catalog: '', title: '', requirement_ids: [], preconditions: [], steps: [], expected_result: '', case_type: '', priority: 'P2', creator: '', iteration: '', review_status: 'pending' })
    },
    removeTestCase(index) {
      this.testCasesJson.splice(index, 1)
    },
    normalizeCasesForSave() {
      return this.testCasesJson.map(testCase => ({
        ...testCase,
        steps: testCase.steps_text ? this.splitLines(testCase.steps_text).map((line, index) => ({ index: index + 1, action: line.replace(/^\d+\.\s*/, ''), expected: '' })) : testCase.steps
      }))
    },
    async saveTestCasesJson() {
      this.isSavingReview = true
      try {
        this.testCasesJson = this.normalizeCasesForSave()
        await updateGeneratedTestCases(this.currentTaskId, this.testCasesJson)
        ElMessage.success('测试用例预览已保存')
      } finally {
        this.isSavingReview = false
      }
    },
    async approveTestCases() {
      await this.saveTestCasesJson()
      await approveGeneratedTestCases(this.currentTaskId)
      this.testCasesReviewStatus = 'approved'
      ElMessage.success('测试用例已审核，可以导出 Excel')
    },
```

- [ ] **Step 6: Replace Excel download**

In `downloadTestCases`, use backend export when approved:

```javascript
      if (this.generationResult?.task_id && this.testCasesReviewStatus === 'approved') {
        const response = await exportGeneratedTestCasesExcel(this.generationResult.task_id)
        const blob = new Blob([response.data], { type: response.headers['content-type'] })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${this.generationResult.task_id}_testcases.xlsx`
        link.click()
        window.URL.revokeObjectURL(url)
        ElMessage.success(this.$t('requirementAnalysis.downloadSuccess'))
        return
      }
      ElMessage.warning('请先审核通过测试用例预览')
```

- [ ] **Step 7: Build and commit**

Run:

```bash
npm --prefix frontend run build
```

Expected: build succeeds.

Commit:

```bash
git add frontend/src/views/requirement-analysis/RequirementAnalysisView.vue frontend/src/api/requirement-analysis.js
git commit -m "feat: add PRD2Case review UI"
```

---

### Task 7: End-To-End Verification

**Files:**
- Read/verify: backend and frontend files changed in Tasks 1-6.
- No planned source edits in this task.

- [ ] **Step 1: Run backend tests**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
.venv/bin/python manage.py check
```

Expected: tests pass and check reports no issues.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: Vite build succeeds.

- [ ] **Step 3: Start backend and frontend**

Run backend:

```bash
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Run frontend in another shell:

```bash
npm --prefix frontend run dev -- --host 127.0.0.1
```

Expected: backend and frontend start without errors.

- [ ] **Step 4: Manual smoke test**

Use the existing requirement analysis page and submit:

```text
标题：手机号验证码登录
需求ID：REQ-LOGIN-001
用例类型：功能测试
创建人：张三
归属迭代：2026.06
需求描述：
用户可以使用已注册手机号和短信验证码登录。验证码 5 分钟内有效。验证码错误时提示错误。连续错误 5 次锁定 30 分钟。未注册手机号提示用户先注册。
```

Expected:

- Task creates successfully.
- AI uses configured writer model API key.
- Test points appear first.
- Test case generation waits for test point approval.
- Case preview appears after approval.
- Excel export is disabled before case preview approval.
- After case preview approval, Excel downloads with headers:
  `用例目录`, `用例名称`, `需求ID`, `前置条件`, `用例步骤`, `预期结果`, `用例类型`, `用例状态`, `用例等级`, `创建人`, `归属迭代`.
- `用例状态` column cells are blank.

- [ ] **Step 5: Confirm repository status**

Run:

```bash
git status --short
```

Expected: no uncommitted changes after Tasks 1-6. If this command shows modified files, inspect those files and either commit the specific reviewed changes with a concrete message or continue fixing until the verification commands pass.

---

## Plan Self-Review

Spec coverage:

- PRD metadata input and persistence: Task 1 and Task 5.
- Test points before test cases: Task 2, Task 3, Task 6.
- First human review gate: Task 4 and Task 6.
- Case generation from approved test points: Task 2 and Task 4.
- Second human review gate: Task 4 and Task 6.
- Excel export after approval only: Task 4 and Task 6.
- Exact Excel headers and blank `用例状态`: Task 2, Task 4, Task 6, Task 7.
- AI API key usage through enabled `AIModelConfig`: Task 3 and Task 7.
- Progress/SSE compatibility: Task 3, Task 4, Task 6.
- Save-to-records gate: Task 4.

Placeholder scan:

- The plan contains Vue `placeholder` attributes in concrete input examples. These are intentional UI attributes, not implementation placeholders.
- No task contains unresolved file names, missing commands, or undefined feature names.

Type consistency:

- Backend uses snake_case fields: `requirement_ids`, `case_type`, `case_creator`, `iteration`, `test_points`, `test_cases_json`.
- Frontend maps camelCase form fields to backend snake_case request fields.
- Review actions use stable endpoint names: `test_points`, `approve_test_points`, `test_cases`, `approve_test_cases`, and `export_excel`.
