import asyncio
import json

import httpx
import pytest

from config import Settings
from services import db as db_module
from services.db import DatabaseError, UserDB, eq

REAL_CLIENT = httpx.AsyncClient
SETTINGS = Settings(supabase_url="https://proj.supabase.co", supabase_anon_key="anon-key")


def run(coro):
    return asyncio.run(coro)


def use(monkeypatch, handler):
    monkeypatch.setattr(
        db_module.httpx, "AsyncClient",
        lambda *a, **kw: REAL_CLIENT(*a, **{**kw, "transport": httpx.MockTransport(handler)}),
    )


async def with_db(fn):
    async with UserDB(SETTINGS, "user-jwt") as db:
        return await fn(db)


def test_requests_carry_the_users_own_token(monkeypatch):
    seen = {}

    def handler(req: httpx.Request):
        seen["req"] = req
        return httpx.Response(200, json=[{"id": "1"}])

    use(monkeypatch, handler)
    rows = run(with_db(lambda db: db.select("documents", {"id": eq("abc")}, columns="id,title", order="created_at.desc", limit=5)))
    req = seen["req"]
    assert rows == [{"id": "1"}]
    assert req.url.path == "/rest/v1/documents"
    assert dict(req.url.params) == {"select": "id,title", "id": "eq.abc", "order": "created_at.desc", "limit": "5"}
    assert req.headers["authorization"] == "Bearer user-jwt"
    assert req.headers["apikey"] == "anon-key"


def test_insert_sends_rows_and_conflict_handling(monkeypatch):
    seen = {}

    def handler(req):
        seen["req"], seen["body"] = req, json.loads(req.content)
        return httpx.Response(201, json=[{"id": "n"}])

    use(monkeypatch, handler)
    run(with_db(lambda db: db.insert("topics", [{"name": "A"}], on_conflict="user_id,name", ignore_duplicates=True)))
    assert seen["req"].method == "POST" and seen["body"] == [{"name": "A"}]
    assert seen["req"].url.params["on_conflict"] == "user_id,name"
    prefer = seen["req"].headers["prefer"]
    assert "return=representation" in prefer and "resolution=ignore-duplicates" in prefer


def test_insert_of_nothing_makes_no_request(monkeypatch):
    def handler(req):
        raise AssertionError("no request expected")

    use(monkeypatch, handler)
    assert run(with_db(lambda db: db.insert("flashcards", []))) == []


def test_update_and_delete_use_filters_and_refuse_to_touch_everything(monkeypatch):
    calls = []
    use(monkeypatch, lambda req: (calls.append(req), httpx.Response(200, json=[{"ok": 1}]))[1])
    assert run(with_db(lambda db: db.update("documents", {"status": "ready"}, {"id": eq("d")}))) == [{"ok": 1}]
    run(with_db(lambda db: db.delete("document_chunks", {"document_id": eq("d")})))
    assert [c.method for c in calls] == ["PATCH", "DELETE"]
    assert calls[0].url.params["id"] == "eq.d" and json.loads(calls[0].content) == {"status": "ready"}
    with pytest.raises(ValueError):
        run(with_db(lambda db: db.update("documents", {"status": "x"}, {})))
    with pytest.raises(ValueError):
        run(with_db(lambda db: db.delete("documents", {})))


def test_timestamps_with_plus_signs_are_encoded_in_filters(monkeypatch):
    seen = {}
    use(monkeypatch, lambda req: (seen.update(url=str(req.url)), httpx.Response(200, json=[]))[1])
    run(with_db(lambda db: db.update("documents", {"a": 1}, {"updated_at": eq("2026-09-20T10:00:00.5+00:00")})))
    assert "%2B00%3A00" in seen["url"] or "%2B00:00" in seen["url"]


def test_download_builds_a_safe_storage_url(monkeypatch):
    seen = {}
    use(monkeypatch, lambda req: (seen.update(path=req.url.raw_path.decode()), httpx.Response(200, content=b"PDFDATA"))[1])
    assert run(with_db(lambda db: db.download("documents", "uid/my file (1).pdf"))) == b"PDFDATA"
    assert seen["path"].startswith("/storage/v1/object/documents/uid/my%20file%20")


@pytest.mark.parametrize("status", [400, 404])
def test_missing_file_is_a_404_style_error(monkeypatch, status):
    use(monkeypatch, lambda req: httpx.Response(status, json={"error": "not found"}))
    with pytest.raises(DatabaseError) as e:
        run(with_db(lambda db: db.download("documents", "x.pdf")))
    assert e.value.status == 404 and "could not be found" in str(e.value)


@pytest.mark.parametrize("status,expected", [(401, 401), (403, 403), (500, 500), (409, 409)])
def test_errors_are_safe_and_carry_a_status(monkeypatch, status, expected):
    use(monkeypatch, lambda req: httpx.Response(status, text="secret internal details: row 42"))
    with pytest.raises(DatabaseError) as e:
        run(with_db(lambda db: db.select("documents")))
    assert e.value.status == expected
    assert "secret" not in str(e.value)  # database internals never reach the user


def test_network_failures_become_database_errors(monkeypatch):
    def boom(req):
        raise httpx.ReadTimeout("slow")

    use(monkeypatch, boom)
    with pytest.raises(DatabaseError, match="too long"):
        run(with_db(lambda db: db.select("documents")))


def test_expired_session_and_permission_errors_have_different_messages(monkeypatch):
    use(monkeypatch, lambda req: httpx.Response(401, json={"message": "JWT expired"}))
    with pytest.raises(DatabaseError, match="session has expired"):
        run(with_db(lambda db: db.select("documents")))
    use(monkeypatch, lambda req: httpx.Response(403, json={"message": "new row violates row-level security policy"}))
    with pytest.raises(DatabaseError, match="permission") as e:
        run(with_db(lambda db: db.insert("study_sets", [{"title": "x"}])))
    assert e.value.status == 403 and "row-level" not in str(e.value)
