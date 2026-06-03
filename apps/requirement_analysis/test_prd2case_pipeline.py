from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from apps.requirement_analysis.generation_pipeline import build_excel_rows, parse_json_payload
from apps.requirement_analysis.models import AIModelConfig, PromptConfig, TestCaseGenerationTask
from apps.requirement_analysis.serializers import TestCaseGenerationRequestSerializer
from apps.requirement_analysis.views import TestCaseGenerationTaskViewSet
from apps.projects.models import Project
from apps.testcases.models import TestCase as ManagedTestCase


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
        self.assertEqual(rows[0]["需求ID"], "REQ-DEFAULT")
        self.assertEqual(rows[0]["创建人"], "张三")
        self.assertEqual(rows[0]["归属迭代"], "2026.06")
        self.assertIn("1. 输入验证码", rows[0]["用例步骤"])


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


class PRD2CaseReviewGateTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("review_user", password="password123")
        self.project = Project.objects.create(
            name="PRD2Case 项目",
            owner=self.user,
        )
        self.task = TestCaseGenerationTask.objects.create(
            task_id="TASK_GATE001",
            title="登录 PRD",
            requirement_text="手机号登录",
            requirement_ids=["REQ-1"],
            case_type="功能测试",
            case_creator="张三",
            iteration="2026.06",
            test_points=[{"id": "TP-001", "title": "登录主流程", "review_status": "pending"}],
            project=self.project,
            created_by=self.user,
        )

    def test_export_requires_case_review_approval(self):
        factory = APIRequestFactory()
        request = factory.get(f"/api/requirement-analysis/testcase-generation/{self.task.task_id}/export_excel/")
        request.user = self.user

        response = TestCaseGenerationTaskViewSet.as_view({"get": "export_excel"})(request, task_id=self.task.task_id)

        self.assertEqual(response.status_code, 400)
        self.assertIn("审核", response.data["error"])

    def test_save_to_records_uses_approved_structured_cases(self):
        self.task.status = "completed"
        self.task.test_cases_review_status = "approved"
        self.task.test_cases_json = [{
            "title": "手机号验证码登录成功",
            "preconditions": ["用户未登录", "验证码有效"],
            "steps": [
                {"index": 1, "action": "输入手机号", "expected": "展示验证码输入框"},
                {"index": 2, "action": "输入验证码并提交", "expected": "登录成功"},
            ],
            "expected_result": "登录成功并进入首页",
            "priority": "P1",
        }]
        self.task.save()
        factory = APIRequestFactory()
        request = factory.post(
            f"/api/requirement-analysis/testcase-generation/{self.task.task_id}/save_to_records/",
            {},
            format="json",
        )
        request.user = self.user

        response = TestCaseGenerationTaskViewSet.as_view({"post": "save_to_records"})(request, task_id=self.task.task_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["imported_count"], 1)
        managed_case = ManagedTestCase.objects.get(project=self.project)
        self.assertEqual(managed_case.title, "手机号验证码登录成功")
        self.assertIn("输入手机号", managed_case.steps)
        self.assertEqual(managed_case.priority, "high")
