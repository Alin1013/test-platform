from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import DEFAULT_DATABASE_URL, create_session_factory
from .routers.auth import router as auth_router
from .routers.dashboard import router as dashboard_router
from .routers.executions import router as executions_router
from .routers.personnel import router as personnel_router
from .routers.settings import router as settings_router
from .routers.test_cases import router as test_cases_router
from .routers.xmind import router as xmind_router
from .request_logging import LOG_FILE_NAME, RequestLoggingMiddleware, RequestLogWriter
from .services.playwright_runner import PlaywrightUiRunner
from .seed import seed_database


DEFAULT_LOG_DIR = Path(__file__).resolve().parents[1] / "logs"


def create_app(
    database_url: str = DEFAULT_DATABASE_URL,
    upload_dir: Path | None = None,
    log_dir: Path | None = None,
) -> FastAPI:
    session_factory = create_session_factory(database_url)
    resolved_upload_dir = upload_dir or Path(__file__).resolve().parents[1] / "uploads"
    resolved_log_dir = log_dir or DEFAULT_LOG_DIR
    request_log_writer = RequestLogWriter(resolved_log_dir / LOG_FILE_NAME)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        resolved_upload_dir.mkdir(parents=True, exist_ok=True)
        try:
            # 初始化演示数据是幂等操作，测试和首次本地启动共用这一入口。
            with session_factory() as session:
                seed_database(session)
            yield
        finally:
            request_log_writer.close()

    app = FastAPI(title="Test Platform API", version="1.0.0", lifespan=lifespan)
    app.state.session_factory = session_factory
    app.state.upload_dir = resolved_upload_dir
    app.state.request_log_path = resolved_log_dir / LOG_FILE_NAME
    app.state.api_debug_transport = None
    app.state.ui_runner = PlaywrightUiRunner(resolved_upload_dir)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:56789", "http://127.0.0.1:56789"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestLoggingMiddleware, writer=request_log_writer)
    app.mount("/uploads", StaticFiles(directory=resolved_upload_dir, check_dir=False), name="uploads")

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(dashboard_router)
    app.include_router(executions_router)
    app.include_router(auth_router)
    app.include_router(personnel_router)
    app.include_router(settings_router)
    app.include_router(test_cases_router)
    app.include_router(xmind_router)
    return app


app = create_app()
