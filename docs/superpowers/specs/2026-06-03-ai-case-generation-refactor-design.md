# AI Case Generation Refactor Design

Date: 2026-06-03

## Goal

Refactor the current AI test case generation feature into a file-driven, template-driven, human-reviewed workflow:

1. Upload a PRD/source file.
2. Parse the file into PRD text.
3. Generate test points.
4. Let a human review, edit, and optionally ask AI to revise the test points through natural language.
5. Generate test cases from approved test points and an Excel template.
6. Let a human review, edit, and optionally ask AI to revise the test cases through natural language.
7. After final approval, show a download button and export the Excel file locally.

The refactor may delete existing AI case generation code that no longer fits this workflow.

## Current System Fit

Useful existing pieces to keep:

- `AIModelConfig`, `PromptConfig`, and `GenerationConfig`.
- `TestCaseGenerationTask` task records.
- Project association and authenticated API access.
- The existing `AIModelService` OpenAI-compatible call layer.
- The existing requirement document upload model where it still helps.

Existing code that can be deleted or replaced:

- Old one-shot PRD-to-test-case generation branches.
- Old streaming UI that assumes final Markdown output is the main artifact.
- Frontend local Excel generation/parsing paths.
- Backward-compatibility paths that make the new reviewed workflow harder to reason about.

## Supported Inputs

### PRD/source file upload

The new generation entry point supports:

- Text files: `.txt`
- PDF: `.pdf`
- Word: `.docx`
- HTML: `.html`, `.htm`
- Images: `.png`, `.jpg`, `.jpeg`, `.bmp`

Legacy `.doc` is not included in the first refactor because reliable parsing usually requires platform-specific conversion tooling. Users should upload `.docx`.

### Image parsing

Images are parsed with an OpenAI vision-capable model. The system should:

- Accept PNG/JPG/JPEG directly.
- Convert BMP to PNG with Pillow before calling the vision model.
- Send the image to the configured OpenAI vision model and ask it to extract PRD text, flows, tables, field rules, and acceptance criteria.
- Store the extracted PRD text on the task as the source text used by later AI stages.

The OpenAI API key must be stored in `AIModelConfig`; it must not be passed in the frontend request.

### Excel template upload

Template behavior uses option 3 from the user decision:

- A system-level default Excel template can be configured.
- Each generation task can upload a one-time Excel template override.
- If a task template is provided, it wins.
- Otherwise the active system template is used.
- If no template exists, the system falls back to the current default headers:
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

The template parser should read:

- Header row and column order.
- Optional example rows.
- Optional notes or static columns when present.

The AI case generation prompt should include the template schema. Final export should use the approved test case preview and the selected template schema.

## Main Workflow

### Stage 1: Upload And Parse File

The user uploads a PRD/source file and fills required task metadata:

- 需求ID
- 用例类型
- 创建人
- 归属迭代
- Optional project
- Optional one-time Excel template

The backend validates the file type, stores the file, extracts text, and creates a `TestCaseGenerationTask`.

Document parsing rules:

- TXT: read text with UTF-8 fallback to common Chinese encodings.
- PDF: extract page text with the existing PDF reader.
- DOCX: extract paragraphs and table cells.
- HTML: parse with BeautifulSoup and preserve meaningful headings, tables, and text.
- PNG/JPG/JPEG/BMP: use OpenAI vision extraction.

If extraction fails or the extracted text is empty, the task returns a clear error and does not start generation.

### Stage 2: Generate Test Points

The writer model generates structured test points from extracted PRD text.

Each test point should include:

- `id`
- `requirement_ids`
- `title`
- `test_object`
- `coverage_type`
- `design_technique`
- `priority`
- `preconditions`
- `test_data_hint`
- `expected_focus`
- `source_trace`
- `review_status`
- `review_comment`

The task pauses at `current_stage = test_points_review`.

### Stage 3: Human Review And AI Revision Of Test Points

The frontend shows an editable test point review panel.

The user can:

- Edit fields.
- Add points.
- Delete points.
- Reorder points.
- Enter natural language feedback such as "补充异常登录失败场景" or "这些测试点太偏接口，改成业务验收视角".

When the user asks AI to revise test points:

- The backend sends the current test points, user feedback, original PRD text, and task metadata to the writer model.
- AI must return the full revised test point JSON array.
- The backend replaces the current test point version with the revised version.
- A revision record is appended to `pipeline_artifacts.review_conversations`.

Case generation is disabled until the user clicks test point approval.

### Stage 4: Generate Test Cases From Approved Points And Template

After test points are approved, AI generates test cases from:

- Approved test points.
- Extracted PRD text.
- Task metadata.
- Selected Excel template schema.

The model must output structured JSON, not Markdown.

Each generated case should map to the selected template columns. For the default template, required fields are:

- `catalog`
- `title`
- `requirement_ids`
- `preconditions`
- `steps`
- `expected_result`
- `case_type`
- `priority`
- `creator`
- `iteration`
- `source_trace`
- `review_status`
- `review_comment`

`用例状态` is reserved for the exported Excel and must remain blank.

The task pauses at `current_stage = test_cases_review`.

### Stage 5: Human Review And AI Revision Of Test Cases

The frontend shows an editable preview table based on the selected template.

The user can:

- Edit generated cases.
- Add cases.
- Delete cases.
- Reorder cases.
- Enter natural language feedback for AI revision.

When the user asks AI to revise test cases:

- The backend sends the current cases, user feedback, approved test points, PRD text, and template schema to the writer model.
- AI must return the full revised test case JSON array.
- The backend replaces the preview version with the revised version.
- A revision record is appended to `pipeline_artifacts.review_conversations`.

Excel download remains disabled until the user clicks final case approval.

### Stage 6: Final Approval And Download

After final case approval:

- `test_cases_review_status = approved`.
- Task status becomes `completed`.
- The frontend shows the Excel download button.
- Export uses the approved preview cases and selected template schema.

The downloaded file should be a real `.xlsx` workbook. Add `openpyxl` to `requirements.txt` and use it for template parsing and final export.

## AI Model Configuration

Required model roles:

- `writer`: text generation for test points, point revisions, test cases, and case revisions.
- `reviewer`: kept for existing configuration compatibility. The first refactor does not require automated reviewer calls because the new workflow relies on explicit human review gates.
- `vision`: OpenAI vision model for image PRD extraction.

The current `AIModelConfig.role` choices should be extended to include `vision`.
The current `AIModelConfig.model_type` choices should be extended to include `openai`.

Recommended local OpenAI vision configuration:

- `model_type = openai`.
- `role = vision`.
- `base_url = https://api.openai.com/v1`.
- `model_name = gpt-4.1-mini` or the current project-approved vision-capable model.

All API keys must be stored in `AIModelConfig.api_key`. API keys must not be stored in frontend state, task artifacts, logs, SSE events, or exported files.

## Backend Architecture

The refactor should split behavior out of `apps/requirement_analysis/views.py`.

Create or extend focused services:

- `apps/requirement_analysis/document_parser.py`
  - Extracts PRD text from supported file types.
  - Handles image-to-text extraction through the vision model.

- `apps/requirement_analysis/template_service.py`
  - Stores and parses default/task Excel templates.
  - Produces a normalized template schema.
  - Builds exported Excel files from approved cases.

- `apps/requirement_analysis/generation_pipeline.py`
  - Keeps orchestration and AI prompts.
  - Adds AI revision methods for test points and test cases.
  - Uses `AIModelService` for every model call.

- `apps/requirement_analysis/views.py`
  - Keeps viewset routing and request/response handling.
  - Delegates parsing, generation, revision, approval, and export to services.

## Backend API Shape

Primary endpoints:

- `POST /api/requirement-analysis/testcase-generation/generate/`
  - Multipart form.
  - Fields: PRD file, optional Excel template file, required metadata.
  - Creates task and starts test point generation.

- `GET /api/requirement-analysis/testcase-generation/{task_id}/progress/`
  - Returns current stage, extracted text summary, test points, test cases, review statuses, template schema, errors.

- `PATCH /api/requirement-analysis/testcase-generation/{task_id}/test_points/`
  - Saves manually edited test points.

- `POST /api/requirement-analysis/testcase-generation/{task_id}/revise_test_points/`
  - Body: `{ "message": "自然语言修改要求" }`.
  - Returns the new test point version.

- `POST /api/requirement-analysis/testcase-generation/{task_id}/approve_test_points/`
  - Approves points and starts case generation.

- `PATCH /api/requirement-analysis/testcase-generation/{task_id}/test_cases/`
  - Saves manually edited test cases.

- `POST /api/requirement-analysis/testcase-generation/{task_id}/revise_test_cases/`
  - Body: `{ "message": "自然语言修改要求" }`.
  - Returns the new case preview version.

- `POST /api/requirement-analysis/testcase-generation/{task_id}/approve_test_cases/`
  - Final approval.

- `GET /api/requirement-analysis/testcase-generation/{task_id}/export_excel/`
  - Enabled only after final approval.

Optional template configuration endpoints:

- `GET /api/requirement-analysis/testcase-template/default/`
- `POST /api/requirement-analysis/testcase-template/default/`

## Data Model Changes

Extend `TestCaseGenerationTask` with:

- `source_file`: optional uploaded PRD/source file if not reusing `RequirementDocument`.
- `source_file_type`: normalized file type.
- `source_extract_status`: `pending`, `parsed`, `failed`.
- `source_extract_error`: text.
- `template_file`: optional uploaded task-level Excel template.
- `template_schema`: JSON normalized schema.
- `selected_template_name`: text.
- `review_conversations`: JSON list or store inside `pipeline_artifacts`.

Add a default template model:

- `TestCaseTemplateConfig`
  - `name`
  - `template_file`
  - `template_schema`
  - `is_active`
  - `created_by`
  - timestamps

The implementation should add `TestCaseTemplateConfig`; do not store the default template in `GenerationConfig`.

## Frontend Architecture

The current `RequirementAnalysisView.vue` can be substantially rewritten.

New page sections:

1. Upload panel
   - PRD/source file input.
   - Optional Excel template input.
   - Metadata fields.
   - Project selector.

2. Parse/generation progress
   - Current stage.
   - Error display.

3. Test point review panel
   - Editable list/table.
   - Natural language AI revision input.
   - Save edits.
   - Approve points.

4. Test case preview panel
   - Editable table based on selected template schema.
   - Natural language AI revision input.
   - Save edits.
   - Final approval.

5. Download panel
   - Shows only after final approval.

The frontend should stop doing local Excel generation. Excel export comes from the backend.

## Error Handling

Clear errors are required for:

- Unsupported file type.
- Empty extracted PRD text.
- Missing writer model config or API key.
- Missing vision model config or API key when image input is uploaded.
- Invalid AI JSON output.
- Missing or invalid template file.
- Attempting to generate cases before test point approval.
- Attempting to export before final case approval.

The task should store user-facing error text in `error_message`.

## Testing Strategy

Backend tests:

- TXT/HTML parsing returns expected text.
- BMP converts to PNG before vision extraction.
- Image PRD generation requires active vision config.
- Task template overrides default template.
- AI point revision replaces the full point list and stores revision history.
- AI case revision replaces the full case list and stores revision history.
- Case generation requires approved test points.
- Excel export requires approved cases.
- Export keeps `用例状态` blank.

Frontend verification:

- Build succeeds.
- Upload form shows supported file/template inputs and required metadata.
- Test point AI revision action calls the new endpoint.
- Test case AI revision action calls the new endpoint.
- Download button is disabled until final approval.

## Implementation Notes

- Use TDD for backend behavior changes.
- Prefer deleting old code paths over preserving confusing compatibility.
- Avoid adding a broad new page if the current route can be rewritten cleanly.
- Add `openpyxl` to `requirements.txt` and export true `.xlsx`.
- Keep API key values masked and out of logs.

## Open Questions Resolved

- Template mode: use both system default template and per-task override.
- Image parsing: use OpenAI vision model.
- Existing code deletion: allowed when it simplifies the new workflow.
