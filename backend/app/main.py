from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import DEFAULT_DATABASE_URL, create_session_factory
from .routers.dashboard import router as dashboard_router
from .routers.personnel import router as personnel_router
from .routers.settings import router as settings_router
from .routers.test_cases import router as test_cases_router
from .seed import seed_database


def create_app(database_url: str = DEFAULT_DATABASE_URL) -> FastAPI:
    session_factory = create_session_factory(database_url)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        with session_factory() as session:
            seed_database(session)
        yield

    app = FastAPI(title="Test Platform API", version="1.0.0", lifespan=lifespan)
    app.state.session_factory = session_factory
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:56789", "http://127.0.0.1:56789"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(dashboard_router)
    app.include_router(personnel_router)
    app.include_router(settings_router)
    app.include_router(test_cases_router)
    return app


app = create_app()
