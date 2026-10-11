"""Cookie transport security must be explicit, not inferred from APP_ENV alone.

Background: the session and admin cookies were marked ``Secure`` whenever ``APP_ENV=production``.
The Compose stack sets ``APP_ENV: production`` while publishing the frontend over plain HTTP, so
browsers silently refused to send the cookie back and every authenticated endpoint answered 401
while ``/api/health`` stayed green. These tests pin the three cases that matter:

* production keeps ``Secure`` by default (no accidental weakening of a real deployment);
* an explicit ``SESSION_COOKIE_SECURE=false`` allows a plain-HTTP deployment;
* an explicit ``SESSION_COOKIE_SECURE=true`` forces ``Secure`` even outside production.
"""
import pytest

from app.core.config import Settings, get_settings


def _settings(**env) -> Settings:
    return Settings(**env)


def test_production_defaults_to_secure_cookies() -> None:
    settings = _settings(app_env="production", session_secret="x" * 40,
                         admin_jwt_secret="y" * 40, admin_password="z" * 16)
    assert settings.cookie_secure is True


def test_development_defaults_to_plain_cookies() -> None:
    assert _settings(app_env="development").cookie_secure is False


def test_explicit_flag_overrides_the_environment_in_both_directions() -> None:
    production = _settings(app_env="production", session_cookie_secure=False,
                           session_secret="x" * 40, admin_jwt_secret="y" * 40, admin_password="z" * 16)
    development = _settings(app_env="development", session_cookie_secure=True)
    assert production.cookie_secure is False
    assert development.cookie_secure is True


@pytest.fixture
def production_http_client(monkeypatch, client):
    """The shipped Compose configuration: production mode served over plain HTTP."""
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret-private-fixture-32-chars")
    monkeypatch.setenv("ADMIN_JWT_SECRET", "test-admin-secret-private-fixture-32-chars")
    monkeypatch.setenv("ADMIN_PASSWORD", "fixture-admin-password")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    get_settings.cache_clear()
    yield client
    get_settings.cache_clear()


def test_plain_http_deployment_can_establish_a_usable_session(production_http_client) -> None:
    """Without the explicit switch the cookie is unusable over HTTP and every call returns 401."""
    created = production_http_client.post("/api/session")
    assert created.status_code == 200
    header = created.headers["set-cookie"].lower()
    assert "secure" not in header, f"cookie would not be returned over HTTP: {header}"

    # 关键回归：会话 cookie 必须真的能用于后续请求。
    current = production_http_client.get("/api/journeys/current")
    assert current.status_code == 200


def test_production_cookies_are_secure_when_the_flag_is_absent(monkeypatch, client) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret-private-fixture-32-chars")
    monkeypatch.setenv("ADMIN_JWT_SECRET", "test-admin-secret-private-fixture-32-chars")
    monkeypatch.setenv("ADMIN_PASSWORD", "fixture-admin-password")
    monkeypatch.delenv("SESSION_COOKIE_SECURE", raising=False)
    get_settings.cache_clear()
    try:
        created = client.post("/api/session")
        assert created.status_code == 200
        assert "secure" in created.headers["set-cookie"].lower()
    finally:
        get_settings.cache_clear()


def test_admin_cookie_follows_the_same_switch(production_http_client) -> None:
    login = production_http_client.post("/api/admin/login",
                                        json={"username": "admin", "password": "fixture-admin-password"})
    assert login.status_code == 200
    header = login.headers["set-cookie"].lower()
    assert "secure" not in header, f"admin cookie would not be returned over HTTP: {header}"
    assert production_http_client.get("/api/admin/me").status_code == 200
