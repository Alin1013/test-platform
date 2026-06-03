import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List

from asgiref.sync import sync_to_async

from .models import AIModelService, TestCaseGenerationTask
from .template_service import DEFAULT_HEADERS, TemplateService

logger = logging.getLogger(__name__)


EXCEL_HEADERS = DEFAULT_HEADERS


@dataclass
class PipelineResult:
    content: str
    artifact: Any


def parse_json_payload(content: str) -> Any:
    """Parse raw model JSON, including JSON wrapped in a markdown fence."""
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
    return TemplateService.build_rows(test_cases, defaults, EXCEL_HEADERS)


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
