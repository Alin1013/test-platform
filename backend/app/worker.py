from __future__ import annotations

import logging
import os
from pathlib import Path
from time import sleep

from .database import DEFAULT_DATABASE_URL, create_session_factory
from .services.execution_worker import run_next_execution
from .services.xmind_worker import run_next_xmind_task
from .services.playwright_runner import PlaywrightUiRunner


logger = logging.getLogger(__name__)


def main() -> None:
    database_url = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    session_factory = create_session_factory(database_url)
    upload_dir = Path(__file__).resolve().parents[1] / "uploads"
    ui_runner = PlaywrightUiRunner(upload_dir)
    try:
        while True:
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
                    upload_dir=upload_dir,
                )
                did_work = xmind_task_id is not None or did_work
            except Exception:
                logger.exception("XMind worker failed while processing a task")
            if not did_work:
                sleep(1)
    except KeyboardInterrupt:
        return


if __name__ == "__main__":
    main()
