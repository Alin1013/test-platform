from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.database import Base
from backend.app.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> Generator[TestClient, None, None]:
    app = create_app(f"sqlite:///{tmp_path / 'test.db'}", upload_dir=tmp_path / "uploads")
    engine = app.state.session_factory.kw["bind"]
    Base.metadata.create_all(engine)
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(engine)
