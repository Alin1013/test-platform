"""Playwright UI 执行器：在真实浏览器中按步骤运行用例并收集截图/视频/Trace。"""

from __future__ import annotations

import logging
from pathlib import Path
from shutil import copyfile
from time import perf_counter
from typing import Any
from uuid import uuid4


logger = logging.getLogger(__name__)


class PlaywrightUiRunner:
    """封装 Playwright 同步 API：步骤执行、失败截图、视频与 Trace 归档。"""

    def __init__(self, upload_dir: Path) -> None:
        """初始化执行产物目录（截图/视频/Trace 统一存放）。"""
        self.artifact_dir = upload_dir / "executions"
        self.artifact_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _locator(page: Any, step: dict[str, Any]) -> Any:
        """按定位器类型把目标字符串转换为 Playwright Locator。"""
        target = step.get("target", "")
        locator_type = step.get("locatorType", "css")
        if locator_type == "xpath":
            return page.locator(f"xpath={target}")
        if locator_type == "id":
            return page.locator(f"#{target}")
        if locator_type == "text":
            return page.get_by_text(target, exact=True)
        return page.locator(target)

    def _run_step(self, page: Any, step: dict[str, Any]) -> None:
        """执行单个步骤：导航/等待/点击/输入/悬停/断言。"""
        action = step["action"]
        value = step.get("value", "")
        if action == "navigate":
            page.goto(value)
            return
        if action == "wait":
            page.wait_for_timeout(int(value or "1000"))
            return
        if action == "assert" and step.get("assertion") == "urlEquals":
            expected = step.get("expected", "")
            if page.url != expected:
                raise AssertionError(f"Expected URL {expected!r}, got {page.url!r}")
            return

        locator = self._locator(page, step)
        if action == "click":
            locator.click()
        elif action == "input":
            locator.fill(value)
        elif action == "hover":
            locator.hover()
        elif action == "assert":
            assertion = step.get("assertion")
            expected = step.get("expected", "")
            if assertion == "textEquals":
                actual = locator.inner_text()
                if actual != expected:
                    raise AssertionError(f"Expected text {expected!r}, got {actual!r}")
            elif assertion == "isVisible":
                if not locator.is_visible():
                    raise AssertionError("Expected element to be visible")

    def run(
        self, *, steps: list[dict[str, Any]], config: dict[str, Any]
    ) -> dict[str, Any]:
        """运行整组步骤，返回状态、耗时、步骤结果与产物 URL；可被 shouldCancel 中断。"""
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as error:
            raise RuntimeError(
                "Playwright is not installed; install requirements and run playwright install"
            ) from error

        run_id = uuid4().hex
        screenshot_path = self.artifact_dir / f"{run_id}.png"
        video_path = self.artifact_dir / f"{run_id}.webm"
        trace_path = self.artifact_dir / f"trace_{run_id}.zip"
        logs: list[str] = []
        step_results: list[dict[str, Any]] = []
        error_message: str | None = None
        cancelled = False
        started_at = perf_counter()
        video = None
        trace_started = False
        should_cancel = config.get("shouldCancel")
        on_step = config.get("onStep")

        with sync_playwright() as playwright:
            browser_name = config.get("browser", "chrome")
            browser_type = {
                "firefox": playwright.firefox,
                "safari": playwright.webkit,
            }.get(browser_name, playwright.chromium)
            browser = browser_type.launch(headless=config.get("headless", True))
            context = browser.new_context(record_video_dir=str(self.artifact_dir))
            try:
                # Trace 失败不阻断执行，只记录异常后继续。
                context.tracing.start(screenshots=True, snapshots=True, sources=True)
                trace_started = True
            except Exception:
                logger.exception("Failed to start Playwright tracing")
            page = context.new_page()
            page.set_default_timeout(config.get("timeoutSeconds", 30) * 1000)
            video = page.video
            try:
                for index, step in enumerate(steps, start=1):
                    if callable(should_cancel) and should_cancel():
                        cancelled = True
                        break
                    step_started_at = perf_counter()
                    self._run_step(page, step)
                    duration_ms = round((perf_counter() - step_started_at) * 1000)
                    step_index = step.get("stepIndex") or index
                    step_results.append(
                        {
                            "stepIndex": step_index,
                            "action": step["action"],
                            "status": "PASSED",
                            "durationMs": duration_ms,
                        }
                    )
                    log = f"步骤 {step_index} 执行成功"
                    logs.append(log)
                    if callable(on_step):
                        on_step(step_results[-1], log)
            except Exception as error:
                error_message = str(error)
                step_results.append(
                    {
                        "stepIndex": len(step_results) + 1,
                        "status": "FAILED",
                        "durationMs": 0,
                        "errorMessage": error_message,
                    }
                )
                logs.append(error_message)
                if callable(on_step):
                    on_step(step_results[-1], error_message)
            finally:
                # 成功与失败都保留一张整页截图：截图是 UI 自动化产物的一部分，
                # 仅失败截图会导致通过用例缺少可回看的画面，不符合“保留截图”的要求。
                try:
                    page.screenshot(path=str(screenshot_path), full_page=True)
                except Exception:
                    logger.exception("Failed to capture final screenshot")
                if trace_started:
                    try:
                        context.tracing.stop(path=str(trace_path))
                    except Exception:
                        logger.exception("Failed to stop Playwright tracing")
                context.close()
            if video is not None:
                # Playwright 的视频按内部路径生成，执行后复制到统一命名。
                recorded_path = Path(video.path())
                if recorded_path.exists():
                    copyfile(recorded_path, video_path)
            browser.close()
        return {
            "status": "SKIPPED" if cancelled else "FAILED" if error_message else "PASSED",
            "durationMs": round((perf_counter() - started_at) * 1000),
            "stepResults": step_results,
            "logs": logs,
            "screenshotUrl": (
                f"/uploads/executions/{screenshot_path.name}"
                if screenshot_path.exists()
                else None
            ),
            "videoUrl": (
                f"/uploads/executions/{video_path.name}" if video_path.exists() else None
            ),
            "traceUrl": (
                f"/uploads/executions/{trace_path.name}" if trace_path.exists() else None
            ),
            "errorMessage": error_message,
        }
