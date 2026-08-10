from __future__ import annotations

import logging
import os
from pathlib import Path
from collections.abc import Callable
from threading import Event
from time import sleep

from .database import DEFAULT_DATABASE_URL, create_session_factory
from .services.execution_worker import run_next_execution
from .services.xmind_worker import run_next_xmind_task
from .services.playwright_runner import PlaywrightUiRunner


logger = logging.getLogger(__name__)


def _run_worker_cycle(
    session_factory,
    *,
    ui_runner: PlaywrightUiRunner,
    xmind_llm_transport=None,
) -> bool:
    did_work = False
    try:
        execution_code = run_next_execution(
            session_factory,
            ui_runner=ui_runner,
        )
        did_work = execution_code is not None or did_work
    except Exception:
        logger.exception("Execution worker failed while processing a task")
    try:
        xmind_task_id = run_next_xmind_task(
            session_factory,
            upload_dir=ui_runner.artifact_dir.parent,
            llm_transport=xmind_llm_transport,
        )
        did_work = xmind_task_id is not None or did_work
    except Exception:
        logger.exception("XMind worker failed while processing a task")
    return did_work


def run_worker_loop(
    session_factory,
    upload_dir: Path,
    *,
    ui_runner: PlaywrightUiRunner | None = None,
    xmind_llm_transport: object | None = None,
    xmind_llm_transport_getter: Callable[[], object | None] | None = None,
    stop_event: Event | None = None,
    idle_sleep_seconds: float = 1.0,
) -> None:
    runner = ui_runner or PlaywrightUiRunner(upload_dir)
    try:
        while stop_event is None or not stop_event.is_set():
            transport = (
                xmind_llm_transport_getter()
                if xmind_llm_transport_getter is not None
                else xmind_llm_transport
            )
            did_work = _run_worker_cycle(
                session_factory,
                ui_runner=runner,
                xmind_llm_transport=transport,
            )
            if did_work:
                continue
            if stop_event is not None:
                if stop_event.wait(idle_sleep_seconds):
                    break
            else:
                sleep(idle_sleep_seconds)
    except KeyboardInterrupt:
        return


def main() -> None:
    database_url = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    session_factory = create_session_factory(database_url)
    upload_dir = Path(__file__).resolve().parents[1] / "uploads"
    run_worker_loop(session_factory, upload_dir)


if __name__ == "__main__":
    main()
