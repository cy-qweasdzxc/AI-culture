from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from alembic import command
from app.core.database import get_db, make_engine
from app.services.seed import seed_database


def pytest_configure() -> None:
    """Keep the test session hermetic: never inherit the developer's repo-root ``.env``.

    A local ``.env`` (for example ``SESSION_COOKIE_SECURE=false`` when the stack is served over
    plain HTTP) must not change test outcomes. Tests that need configuration set it explicitly
    through ``monkeypatch``.
    """
    from app.core.config import Settings, get_settings

    Settings.model_config["env_file"] = None
    get_settings.cache_clear()


@pytest.fixture
def database(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    with Session(engine) as session:
        seed_database(session)
    yield engine
    engine.dispose()


@pytest.fixture
def db(database):
    with Session(database, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def client(database):
    from app.main import app

    def test_db():
        with Session(database, expire_on_commit=False) as session:
            try:
                yield session
            finally:
                session.rollback()

    app.dependency_overrides[get_db] = test_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def started(client):
    assert client.post("/api/session").status_code == 200
    response = client.post("/api/journeys/start", json={"role_id": "scholar", "mode": "virtual"})
    assert response.status_code == 200, response.text
    return response.json()["snapshot"]
