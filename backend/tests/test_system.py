import httpx
import pytest
from fastapi.testclient import TestClient

import auth
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_cache():
    auth._cache.clear()


def _mock_supabase(monkeypatch, handler):
    """Route the backend's outgoing Supabase call through a fake."""
    real = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)

    monkeypatch.setattr(auth.httpx, "AsyncClient", factory)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_me_requires_token():
    assert client.get("/api/me").status_code == 401


def test_me_rejects_invalid_token(monkeypatch):
    _mock_supabase(monkeypatch, lambda req: httpx.Response(401, json={"msg": "bad jwt"}))
    r = client.get("/api/me", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_me_returns_verified_user_and_sends_apikey(monkeypatch):
    seen = {}

    def handler(req: httpx.Request):
        seen["auth"] = req.headers["authorization"]
        seen["apikey"] = req.headers["apikey"]
        return httpx.Response(200, json={"id": "user-123", "email": "a@b.co"})

    _mock_supabase(monkeypatch, handler)
    r = client.get("/api/me", headers={"Authorization": "Bearer good"})
    assert r.status_code == 200
    assert r.json() == {"id": "user-123", "email": "a@b.co"}
    assert seen == {"auth": "Bearer good", "apikey": "test-anon-key"}


def test_auth_service_down_is_503(monkeypatch):
    def handler(req):
        raise httpx.ConnectError("boom")

    _mock_supabase(monkeypatch, handler)
    r = client.get("/api/me", headers={"Authorization": "Bearer x"})
    assert r.status_code == 503


def test_cors_allows_configured_origin_only():
    ok = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.options(
        "/api/health",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in bad.headers
