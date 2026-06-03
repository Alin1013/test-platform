# AI Case Generation Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old AI case generation path with a file-driven, Excel-template-driven, human-reviewed pipeline with AI revision chats for test points and test cases.

**Architecture:** Keep `AIModelConfig`, `PromptConfig`, and `TestCaseGenerationTask`, but move parsing, template handling, and AI orchestration out of `views.py` into focused services. Backend APIs create tasks from multipart uploads, pause at review gates, support natural-language AI revisions, and export true `.xlsx`; the frontend becomes a staged upload/review/download workspace.

**Tech Stack:** Django 4.2, DRF, MySQL/PyMySQL, Pillow, BeautifulSoup, pypdf/PyPDF2, python-docx, openpyxl, Vue 3, Vite, Element Plus, axios.

---

## File Structure

Backend:

- Modify `requirements.txt`: add `openpyxl`.
- Modify `apps/requirement_analysis/models.py`: add `openai` model type, `vision` role, task source/template fields, and `TestCaseTemplateConfig`.
- Add migration `apps/requirement_analysis/migrations/0004_ai_case_generation_refactor.py`.
- Modify `apps/requirement_analysis/serializers.py`: expose new task/template fields and add multipart request validation.
- Create `apps/requirement_analysis/document_parser.py`: parse txt/pdf/docx/html/images into PRD text.
- Create `apps/requirement_analysis/template_service.py`: parse Excel templates and export `.xlsx`.
- Modify `apps/requirement_analysis/generation_pipeline.py`: add template-aware prompts and AI revision methods.
- Modify `apps/requirement_analysis/views.py`: replace old generation internals with service-backed actions.
- Modify `apps/requirement_analysis/urls.py`: register template config viewset.
- Extend `apps/requirement_analysis/test_prd2case_pipeline.py`: focused regression coverage.

Frontend:

- Modify `frontend/src/api/requirement-analysis.js`: multipart create, template config, revise endpoints.
- Rewrite `frontend/src/views/requirement-analysis/RequirementAnalysisView.vue`: staged upload, point review, case preview, AI revision chat, download.
- Modify locale files under `frontend/src/locales/lang/*/requirement.js`.

Verification:

- `.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline`
- `.venv/bin/python manage.py check`
- `npm --prefix frontend run build`

---

### Task 1: Model And Dependency Foundation

**Files:**
- Modify: `requirements.txt`
- Modify: `apps/requirement_analysis/models.py`
- Modify: `apps/requirement_analysis/serializers.py`
- Modify: `apps/requirement_analysis/test_prd2case_pipeline.py`
- Generate: `apps/requirement_analysis/migrations/0004_ai_case_generation_refactor.py`

- [ ] **Step 1: Write failing model tests**

Add tests asserting:

```python
def test_ai_model_choices_include_openai_vision(self):
    field = AIModelConfig._meta.get_field("model_type")
    self.assertIn(("openai", "OpenAI"), field.choices)
    role_field = AIModelConfig._meta.get_field("role")
    self.assertIn(("vision", "视觉解析模型"), role_field.choices)

def test_task_defaults_include_source_and_template_fields(self):
    task = TestCaseGenerationTask.objects.create(
        task_id="TASK_REF001",
        title="上传 PRD",
        requirement_text="",
        requirement_ids=["REQ-1"],
        case_type="功能测试",
        case_creator="张三",
        iteration="2026.06",
        created_by=self.user,
    )
    self.assertEqual(task.source_file_type, "")
    self.assertEqual(task.source_extract_status, "pending")
    self.assertEqual(task.template_schema, {})
```

Add a test for `TestCaseTemplateConfig`:

```python
def test_template_config_model_defaults(self):
    config = TestCaseTemplateConfig.objects.create(
        name="默认模板",
        template_schema={"headers": ["用例名称"]},
        created_by=self.user,
    )
    self.assertTrue(config.is_active)
    self.assertEqual(config.template_schema["headers"], ["用例名称"])
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
```

Expected: FAIL because fields/model choices/template model do not exist.

- [ ] **Step 3: Add model fields and choices**

In `AIModelConfig.MODEL_CHOICES`, add `("openai", "OpenAI")`.

In `AIModelConfig.ROLE_CHOICES`, add `("vision", "视觉解析模型")`.

In `TestCaseGenerationTask`, add:

```python
SOURCE_EXTRACT_STATUS_CHOICES = [
    ("pending", "待解析"),
    ("parsed", "已解析"),
    ("failed", "解析失败"),
]

source_file = models.FileField(upload_to="requirement_sources/%Y/%m/", blank=True, null=True, verbose_name="PRD源文件")
source_file_type = models.CharField(max_length=20, blank=True, verbose_name="源文件类型")
source_extract_status = models.CharField(max_length=20, choices=SOURCE_EXTRACT_STATUS_CHOICES, default="pending", verbose_name="源文件解析状态")
source_extract_error = models.TextField(blank=True, verbose_name="源文件解析错误")
template_file = models.FileField(upload_to="testcase_templates/%Y/%m/", blank=True, null=True, verbose_name="任务用例模板")
template_schema = models.JSONField(default=dict, blank=True, verbose_name="用例模板结构")
selected_template_name = models.CharField(max_length=200, blank=True, verbose_name="选中模板名称")
```

Create `TestCaseTemplateConfig`:

```python
class TestCaseTemplateConfig(models.Model):
    name = models.CharField(max_length=200, verbose_name="模板名称")
    template_file = models.FileField(upload_to="testcase_templates/default/%Y/%m/", blank=True, null=True, verbose_name="模板文件")
    template_schema = models.JSONField(default=dict, blank=True, verbose_name="模板结构")
    is_active = models.BooleanField(default=True, verbose_name="是否启用")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="创建者")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")
```

- [ ] **Step 4: Update serializers**

Import `TestCaseTemplateConfig`.

Add `TestCaseTemplateConfigSerializer`.

Include task fields in `TestCaseGenerationTaskSerializer.Meta.fields` and `read_only_fields`:

```python
"source_file", "source_file_type", "source_extract_status", "source_extract_error",
"template_file", "template_schema", "selected_template_name",
```

Replace `TestCaseGenerationRequestSerializer` with multipart-friendly fields:

```python
title = serializers.CharField(max_length=200)
source_file = serializers.FileField()
template_file = serializers.FileField(required=False, allow_null=True)
requirement_ids = serializers.JSONField()
case_type = serializers.CharField(max_length=100)
case_creator = serializers.CharField(max_length=100)
iteration = serializers.CharField(max_length=100)
project = serializers.IntegerField(required=False, allow_null=True)
```

- [ ] **Step 5: Add `openpyxl`**

Add:

```text
openpyxl==3.1.5
```

to `requirements.txt`.

- [ ] **Step 6: Generate migration**

Run:

```bash
.venv/bin/python manage.py makemigrations requirement_analysis
```

Expected: creates `0004_aimodelconfig_openai_vision_and_templates.py` or the next available `0004_*` migration with fields and template model.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
.venv/bin/python manage.py check
```

Commit:

```bash
git add requirements.txt apps/requirement_analysis/models.py apps/requirement_analysis/serializers.py apps/requirement_analysis/test_prd2case_pipeline.py apps/requirement_analysis/migrations/0004_ai_case_generation_refactor.py
git commit -m "feat: add AI generation upload and template models"
```

---

### Task 2: Document Parser Service

**Files:**
- Create: `apps/requirement_analysis/document_parser.py`
- Modify: `apps/requirement_analysis/test_prd2case_pipeline.py`

- [ ] **Step 1: Write failing parser tests**

Add tests for:

```python
from apps.requirement_analysis.document_parser import DocumentParser, UnsupportedSourceFileError

def test_html_parser_preserves_text_and_tables(self):
    html = b"<h1>登录需求</h1><table><tr><th>字段</th><td>手机号</td></tr></table>"
    result = DocumentParser.extract_from_bytes("prd.html", html)
    self.assertIn("登录需求", result.text)
    self.assertIn("字段", result.text)
    self.assertEqual(result.file_type, "html")

def test_unsupported_file_type_raises_clear_error(self):
    with self.assertRaises(UnsupportedSourceFileError):
        DocumentParser.extract_from_bytes("prd.zip", b"bad")
```

Add BMP conversion test with a fake vision client:

```python
def test_bmp_image_uses_vision_extractor(self):
    image = Image.new("RGB", (4, 4), "white")
    buffer = BytesIO()
    image.save(buffer, format="BMP")
    calls = []
    def fake_vision(filename, content_type, data):
        calls.append((filename, content_type, data[:8]))
        return "图片中的登录 PRD"
    result = DocumentParser.extract_from_bytes("prd.bmp", buffer.getvalue(), vision_extractor=fake_vision)
    self.assertEqual(result.text, "图片中的登录 PRD")
    self.assertEqual(calls[0][1], "image/png")
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
```

Expected: FAIL because `document_parser.py` does not exist.

- [ ] **Step 3: Implement `DocumentParser`**

Create:

```python
@dataclass
class ParsedDocument:
    text: str
    file_type: str
    metadata: dict

class UnsupportedSourceFileError(ValueError):
    pass

class EmptyExtractedTextError(ValueError):
    pass

class DocumentParser:
    SUPPORTED_EXTENSIONS = {".txt", ".pdf", ".docx", ".html", ".htm", ".png", ".jpg", ".jpeg", ".bmp"}
    @classmethod
    def extract_from_bytes(cls, filename, data, vision_extractor=None) -> ParsedDocument:
        suffix = Path(filename).suffix.lower()
        if suffix not in cls.SUPPORTED_EXTENSIONS:
            raise UnsupportedSourceFileError(f"不支持的文件类型: {suffix}")
        # Dispatch to a private extractor, trim text, and raise EmptyExtractedTextError when empty.
```

Use `BeautifulSoup` for HTML, `docx.Document` for DOCX, `PdfReader` for PDF, Pillow for BMP conversion, and text decoding for TXT.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
```

Commit:

```bash
git add apps/requirement_analysis/document_parser.py apps/requirement_analysis/test_prd2case_pipeline.py
git commit -m "feat: add PRD source document parser"
```

---

### Task 3: Template Service And XLSX Export

**Files:**
- Create: `apps/requirement_analysis/template_service.py`
- Modify: `apps/requirement_analysis/generation_pipeline.py`
- Modify: `apps/requirement_analysis/test_prd2case_pipeline.py`

- [ ] **Step 1: Write failing template tests**

Add tests:

```python
from apps.requirement_analysis.template_service import TemplateService

def test_template_schema_reads_headers_and_example_rows(self):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["用例目录", "用例名称", "用例状态"])
    sheet.append(["登录", "登录成功", ""])
    buffer = BytesIO()
    workbook.save(buffer)
    schema = TemplateService.parse_template_bytes(buffer.getvalue(), filename="template.xlsx")
    self.assertEqual(schema["headers"], ["用例目录", "用例名称", "用例状态"])
    self.assertEqual(schema["example_rows"][0]["用例名称"], "登录成功")

def test_export_xlsx_keeps_case_status_blank(self):
    data = TemplateService.build_workbook_bytes(
        schema={"headers": ["用例名称", "用例状态", "创建人"]},
        cases=[{"title": "登录成功", "case_status": "已评审", "creator": "李四"}],
        defaults={"case_creator": "张三"},
    )
    workbook = load_workbook(BytesIO(data))
    row = [cell.value for cell in workbook.active[2]]
    self.assertEqual(row, ["登录成功", None, "张三"])
```

- [ ] **Step 2: Run tests to verify failure**

Run the backend test command. Expected: FAIL because `template_service.py` does not exist.

- [ ] **Step 3: Implement template service**

Implement:

```python
DEFAULT_HEADERS = [
    "用例目录", "用例名称", "需求ID", "前置条件", "用例步骤", "预期结果",
    "用例类型", "用例状态", "用例等级", "创建人", "归属迭代",
]
class TemplateService:
    @staticmethod
    def default_schema(name="默认模板"):
        return {"name": name, "headers": DEFAULT_HEADERS, "example_rows": [], "static_columns": {}}

    @staticmethod
    def parse_template_bytes(data, filename):
        workbook = load_workbook(BytesIO(data), data_only=True)
        return {"name": name, "headers": DEFAULT_HEADERS, "example_rows": [], "static_columns": {}}

    @staticmethod
    def build_workbook_bytes(schema, cases, defaults):
        workbook = load_workbook(BytesIO(data), data_only=True)
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        headers = [str(value).strip() for value in rows[0] if value not in (None, "")]
        example_rows = [
            {headers[index]: row[index] for index in range(min(len(headers), len(row)))}
            for row in rows[1:4]
            if any(value not in (None, "") for value in row)
        ]
        return {"name": filename, "headers": headers or DEFAULT_HEADERS, "example_rows": example_rows, "static_columns": {}}
```

Map default fields from case JSON to Chinese headers. Always blank `用例状态`.

- [ ] **Step 4: Wire `build_excel_rows` to template service**

Keep `build_excel_rows` as compatibility helper but delegate its default mapping to `TemplateService`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
```

Commit:

```bash
git add apps/requirement_analysis/template_service.py apps/requirement_analysis/generation_pipeline.py apps/requirement_analysis/test_prd2case_pipeline.py
git commit -m "feat: add Excel template parsing and xlsx export"
```

---

### Task 4: AI Pipeline Revisions And Vision Extraction

**Files:**
- Modify: `apps/requirement_analysis/generation_pipeline.py`
- Modify: `apps/requirement_analysis/models.py`
- Modify: `apps/requirement_analysis/test_prd2case_pipeline.py`

- [ ] **Step 1: Write failing pipeline tests**

Patch model calls and add tests:

```python
def test_revise_test_points_records_conversation(self):
    task.test_points = [{"id": "TP-1", "title": "旧点"}]
    with mock.patch("apps.requirement_analysis.generation_pipeline.AIModelService.call_openai_compatible_api", new=AsyncMock(return_value={
        "choices": [{"message": {"content": '[{"id":"TP-1","title":"新点"}]'}}]
    })):
        result = async_to_sync(PRD2CasePipeline(task).revise_test_points)("补充异常")
    self.assertEqual(result.artifact[0]["title"], "新点")
```

Add similar `revise_test_cases` test.

- [ ] **Step 2: Run tests to verify failure**

Expected: FAIL because revision methods do not exist.

- [ ] **Step 3: Implement revision methods**

Add:

```python
async def revise_test_points(self, user_message: str) -> PipelineResult:
    prompt = self._build_revision_prompt("测试点修订", self.task.test_points, user_message)
    content = await self._call_writer("测试点修订", prompt)
    return PipelineResult(content=content, artifact=parse_json_payload(content))

async def revise_test_cases(self, user_message: str) -> PipelineResult:
    prompt = self._build_revision_prompt("测试用例修订", self.task.test_cases_json, user_message)
    content = await self._call_writer("测试用例修订", prompt)
    return PipelineResult(content=content, artifact=parse_json_payload(content))
```

Both prompts must require full JSON arrays and include current data, PRD text, metadata, and template schema for cases.

- [ ] **Step 4: Add vision extraction helper**

Add a method that calls OpenAI-compatible vision config with image content. It should be injectable/testable and used by `DocumentParser` callers.

- [ ] **Step 5: Run tests and commit**

Run backend tests, then commit:

```bash
git add apps/requirement_analysis/generation_pipeline.py apps/requirement_analysis/models.py apps/requirement_analysis/test_prd2case_pipeline.py
git commit -m "feat: add AI revision and vision extraction pipeline"
```

---

### Task 5: Backend API Refactor

**Files:**
- Modify: `apps/requirement_analysis/views.py`
- Modify: `apps/requirement_analysis/urls.py`
- Modify: `apps/requirement_analysis/serializers.py`
- Modify: `apps/requirement_analysis/test_prd2case_pipeline.py`

- [ ] **Step 1: Write failing API tests**

Add APIRequestFactory tests:

```python
def test_generate_accepts_uploaded_txt_and_template(self):
    request = factory.post("/api/requirement-analysis/testcase-generation/generate/", {
        "title": "登录 PRD",
        "source_file": SimpleUploadedFile("prd.txt", b"login prd", content_type="text/plain"),
        "requirement_ids": "REQ-1",
        "case_type": "功能测试",
        "case_creator": "张三",
        "iteration": "2026.06",
    }, format="multipart")
    response = view(request)
    self.assertEqual(response.status_code, 201)
```

Add revision endpoint tests:

```python
def test_revise_test_points_requires_message(self):
    response = TestCaseGenerationTaskViewSet.as_view({"post": "revise_test_points"})(request, task_id=task.task_id)
    self.assertEqual(response.status_code, 400)
    self.assertIn("message", response.data["error"])

def test_export_excel_returns_xlsx_after_approval(self):
    response = TestCaseGenerationTaskViewSet.as_view({"get": "export_excel"})(request, task_id=task.task_id)
    self.assertEqual(response.status_code, 200)
    self.assertEqual(response["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
```

- [ ] **Step 2: Run tests to verify failure**

Expected: FAIL because multipart generate and revision endpoints are missing.

- [ ] **Step 3: Replace generation action**

In `generate`, read multipart `source_file` and optional `template_file`; parse source; select template schema; create task; start test point thread.

Delete unreachable old one-shot generation branch inside `generate`.

- [ ] **Step 4: Add revision actions**

Add:

```python
@action(detail=True, methods=["post"], url_path="revise_test_points")
def revise_test_points(self, request, task_id=None):
    task = self.get_object()
    message = (request.data.get("message") or "").strip()
    if not message:
        return Response({"error": "message 不能为空"}, status=status.HTTP_400_BAD_REQUEST)
    result = async_to_sync(PRD2CasePipeline(task).revise_test_points)(message)
    task.test_points = result.artifact
    task.test_points_review_status = "revision_requested"
    task.save(update_fields=["test_points", "test_points_review_status", "pipeline_artifacts", "updated_at"])
    return Response({"test_points": task.test_points})

@action(detail=True, methods=["post"], url_path="revise_test_cases")
def revise_test_cases(self, request, task_id=None):
    task = self.get_object()
    message = (request.data.get("message") or "").strip()
    if not message:
        return Response({"error": "message 不能为空"}, status=status.HTTP_400_BAD_REQUEST)
    result = async_to_sync(PRD2CasePipeline(task).revise_test_cases)(message)
    task.test_cases_json = result.artifact
    task.test_cases_review_status = "revision_requested"
    task.save(update_fields=["test_cases_json", "test_cases_review_status", "pipeline_artifacts", "updated_at"])
    return Response({"test_cases": task.test_cases_json})
```

- [ ] **Step 5: Update export**

Return true `.xlsx` bytes from `TemplateService.build_workbook_bytes`.

- [ ] **Step 6: Add template config viewset**

Register `TestCaseTemplateConfigViewSet` with `testcase-template`.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
.venv/bin/python manage.py check
```

Commit:

```bash
git add apps/requirement_analysis/views.py apps/requirement_analysis/urls.py apps/requirement_analysis/serializers.py apps/requirement_analysis/test_prd2case_pipeline.py
git commit -m "feat: refactor AI generation upload and review APIs"
```

---

### Task 6: Frontend Staged Workspace

**Files:**
- Modify: `frontend/src/api/requirement-analysis.js`
- Modify: `frontend/src/views/requirement-analysis/RequirementAnalysisView.vue`
- Modify: `frontend/src/locales/lang/zh-cn/requirement.js`
- Modify: `frontend/src/locales/lang/en/requirement.js`

- [ ] **Step 1: Update API helpers**

Add multipart create and revision calls:

```javascript
export function createTestCaseGenerationTask(data) {
  return request({ url: '/requirement-analysis/testcase-generation/generate/', method: 'post', data, headers: { 'Content-Type': 'multipart/form-data' } })
}
export function reviseGeneratedTestPoints(taskId, message) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/revise_test_points/`,
    method: 'post',
    data: { message }
  })
}

export function reviseGeneratedTestCases(taskId, message) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/revise_test_cases/`,
    method: 'post',
    data: { message }
  })
}
```

- [ ] **Step 2: Rewrite upload panel**

Replace manual PRD textarea with source file upload, optional template upload, metadata fields, and project selector.

- [ ] **Step 3: Add AI revision controls**

For test points and cases, add a textarea for natural-language feedback and a button that calls the revision endpoint and replaces the current editor state.

- [ ] **Step 4: Template-based preview**

Render case preview using `generationResult.template_schema.headers` when available. Keep default editor mapping for the fallback schema.

- [ ] **Step 5: Download gate**

Keep download disabled until `testCaseReviewStatus === 'approved'`.

- [ ] **Step 6: Build and commit**

Run:

```bash
npm --prefix frontend run build
```

Commit:

```bash
git add frontend/src/api/requirement-analysis.js frontend/src/views/requirement-analysis/RequirementAnalysisView.vue frontend/src/locales/lang/zh-cn/requirement.js frontend/src/locales/lang/en/requirement.js
git commit -m "feat: rebuild AI case generation frontend workflow"
```

---

### Task 7: Final Verification And Cleanup

**Files:**
- Modify only if verification reveals defects.

- [ ] **Step 1: Run backend tests**

```bash
.venv/bin/python manage.py test apps.requirement_analysis.test_prd2case_pipeline
```

Expected: all tests pass.

- [ ] **Step 2: Run Django check**

```bash
.venv/bin/python manage.py check
```

Expected: no system check issues.

- [ ] **Step 3: Run frontend build**

```bash
npm --prefix frontend run build
```

Expected: build succeeds.

- [ ] **Step 4: Smoke local page**

Start dev server:

```bash
npm --prefix frontend run dev -- --host 127.0.0.1 --port 3000
```

Open `/ai-generation/requirement-analysis`, confirm unauthenticated users redirect to login and authenticated users can see the upload form.

- [ ] **Step 5: Final git status**

Run:

```bash
git status --short
```

Expected: clean.
