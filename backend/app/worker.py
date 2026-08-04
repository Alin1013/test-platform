from __future__ import annotations

import logging
import os
from pathlib import Path
from time import sleep

from .database import DEFAULT_DATABASE_URL, create_session_factory
from .services.execution_worker import run_next_execution
from .services.playwright_runner import PlaywrightUiRunner


logger = logging.getLogger(__name__)


def main() -> None:
    database_url = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    session_factory = create_session_factory(database_url)
    upload_dir = Path(__file__).resolve().parents[1] / "uploads"
    ui_runner = PlaywrightUiRunner(upload_dir)
    try:
        while True:
            try:
                execution_code = run_next_execution(
                    session_factory,
                    ui_runner=ui_runner,
                )
            except Exception:
                logger.exception("Execution worker failed while processing a task")
                sleep(1)
                continue
            if execution_code is None:
                sleep(1)
    except KeyboardInterrupt:
        return


if __name__ == "__main__":
    main()
