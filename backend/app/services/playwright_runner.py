from __future__ import annotations

from pathlib import Path
from shutil import copyfile
from time import perf_counter
from typing import Any
from uuid import uuid4


class PlaywrightUiRunner:
    def __init__(self, upload_dir: Path) -> None:
        self.artifact_dir = upload_dir / "executions"
        self.artifact_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _locator(page: Any, step: dict[str, Any]) -> Any:
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
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as error:
            raise RuntimeError(
                "Playwright is not installed; install requirements and run playwright install"
            ) from error

        run_id = uuid4().hex
        screenshot_path = self.artifact_dir / f"{run_id}.png"
        video_path = self.artifact_dir / f"{run_id}.webm"
        logs: list[str] = []
        step_results: list[dict[str, Any]] = []
        error_message: str | None = None
        started_at = perf_counter()
        video = None

        with sync_playwright() as playwright:
            browser_name = config.get("browser", "chrome")
            browser_type = {
                "firefox": playwright.firefox,
                "safari": playwright.webkit,
            }.get(browser_name, playwright.chromium)
            browser = browser_type.launch(headless=config.get("headless", True))
            context = browser.new_context(record_video_dir=str(self.artifact_dir))
            page = context.new_page()
            page.set_default_timeout(config.get("timeoutSeconds", 30) * 1000)
            video = page.video
            try:
                for index, step in enumerate(steps, start=1):
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
                    logs.append(f"步骤 {step_index} 执行成功")
            except Exception as error:
                error_message = str(error)
                page.screenshot(path=str(screenshot_path), full_page=True)
                step_results.append(
                    {
                        "stepIndex": len(step_results) + 1,
                        "status": "FAILED",
                        "durationMs": 0,
                        "errorMessage": error_message,
                    }
                )
                logs.append(error_message)
            finally:
                context.close()
            if video is not None:
                recorded_path = Path(video.path())
                if recorded_path.exists():
                    copyfile(recorded_path, video_path)
            browser.close()
        return {
            "status": "FAILED" if error_message else "PASSED",
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
            "errorMessage": error_message,
        }
