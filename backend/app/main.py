from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import DEFAULT_DATABASE_URL, create_session_factory
from .routers.dashboard import router as dashboard_router
from .routers.personnel import router as personnel_router
from .routers.settings import router as settings_router
from .routers.test_cases import router as test_cases_router
from .routers.xmind import router as xmind_router
from .seed import seed_database


def create_app(
    database_url: str = DEFAULT_DATABASE_URL, upload_dir: Path | None = None
) -> FastAPI:
    session_factory = create_session_factory(database_url)
    resolved_upload_dir = upload_dir or Path(__file__).resolve().parents[1] / "uploads"

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        resolved_upload_dir.mkdir(parents=True, exist_ok=True)
        # 初始化演示数据是幂等操作，测试和首次本地启动共用这一入口。
        with session_factory() as session:
            seed_database(session)
        yield

    app = FastAPI(title="Test Platform API", version="1.0.0", lifespan=lifespan)
    app.state.session_factory = session_factory
    app.state.upload_dir = resolved_upload_dir
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:56789", "http://127.0.0.1:56789"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.mount("/uploads", StaticFiles(directory=resolved_upload_dir, check_dir=False), name="uploads")

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(dashboard_router)
    app.include_router(personnel_router)
    app.include_router(settings_router)
    app.include_router(test_cases_router)
    app.include_router(xmind_router)
    return app


app = create_app()
