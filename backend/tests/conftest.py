import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def make_settings(tmp_path, **kw):
    base = dict(dataforseo_mock=True, database_path=str(tmp_path / "test.db"), daily_spend_cap_usd=5.0,
                dataforseo_login="", dataforseo_password="")
    base.update(kw)
    return Settings(_env_file=None, **base)


@pytest.fixture
def client(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as c:
        yield c
