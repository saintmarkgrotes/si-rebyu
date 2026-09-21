import pytest
from fastapi.testclient import TestClient

from auth import AuthUser, get_current_user
from main import app
from routes import documents as documents_routes
from routes import study_sets as study_set_routes
from services.ai.client import AIClient
from services.db import DatabaseError
from services.errors import AIConfigError
from tests.fake_db import FakeDB
from tests.fakes import EchoProvider, make_chunk
from tests.helpers import make_pdf

DOC = "11111111-1111-1111-1111-111111111111"
BODY = {"flashcards": 5, "questions": 5, "question_types": ["multiple_choice", "true_false"], "difficulty": "mixed"}


async def _no_sleep(_):
    return None


def pdf_bytes():
    line = "A VLAN is a logical network that separates traffic on a switch and this sentence is long enough."
    return make_pdf([[line] for _ in range(3)])


def ready_db(status="ready"):
    cs = [make_chunk(index=i, pages=(2 * i + 1, 2 * i + 2)) for i in range(2)]
    return FakeDB({
        "documents": [{"id": DOC, "user_id": "u1", "title": "Notes.pdf", "file_type": "pdf", "status": status,
                       "storage_path": "u1/n.pdf", "processing_stage": None, "updated_at": "2026-01-01T00:00:00+00:00"}],
        "document_chunks": [{"id": f"c{c.index}", "document_id": DOC, "chunk_index": c.index, "text": c.text,
                             "sources": c.sources, "heading": c.heading} for c in cs],
    }, {("documents", "u1/n.pdf"): pdf_bytes()})


@pytest.fixture
def api(monkeypatch):
    holder = {"db": ready_db()}
    factory = lambda settings, token: holder["db"]
    monkeypatch.setattr(documents_routes, "UserDB", factory)
    monkeypatch.setattr(study_set_routes, "UserDB", factory)
    monkeypatch.setattr(study_set_routes, "get_ai_client", lambda: AIClient(EchoProvider(), 600, sleep=_no_sleep))
    app.dependency_overrides[get_current_user] = lambda: AuthUser("u1", "a@b.co", "user-jwt")
    yield TestClient(app), holder
    app.dependency_overrides.clear()


# ---- authentication and input checks ----

def test_everything_requires_a_signed_in_user():
    app.dependency_overrides.clear()
    client = TestClient(app)
    assert client.post(f"/api/documents/{DOC}/process").status_code == 401
    assert client.post(f"/api/documents/{DOC}/study-sets", json=BODY).status_code == 401
    assert client.post(f"/api/documents/{DOC}/study-sets/estimate", json=BODY).status_code == 401


def test_ids_must_be_uuids(api):
    client, _ = api
    assert client.post("/api/documents/not-a-uuid/process").status_code == 422
    assert client.post("/api/documents/1%3Bdrop/study-sets", json=BODY).status_code == 422


@pytest.mark.parametrize("bad", [{"flashcards": 99}, {"flashcards": 0, "questions": 0},
                                 {"question_types": []}, {"difficulty": "impossible"}, {"question_types": ["essay"]}])
def test_bad_generation_options_are_rejected(api, bad):
    client, _ = api
    assert client.post(f"/api/documents/{DOC}/study-sets", json={**BODY, **bad}).status_code == 422


# ---- processing a document ----

def test_processing_starts_once_and_finishes_in_the_background(api):
    client, holder = api
    holder["db"] = ready_db(status="processing")
    r = client.post(f"/api/documents/{DOC}/process")
    assert r.status_code == 202 and r.json() == {"started": True, "status": "processing"}
    doc = holder["db"].rows("documents")[0]
    assert doc["status"] == "ready" and doc["chunk_count"] >= 1  # the background job has run
    again = client.post(f"/api/documents/{DOC}/process")
    assert again.status_code == 202 and again.json() == {"started": False, "status": "ready"}


def test_someone_elses_or_missing_document_is_a_404(api):
    client, holder = api
    holder["db"] = FakeDB({"documents": []})  # RLS returns nothing for other people's rows
    assert client.post(f"/api/documents/{DOC}/process").status_code == 404
    assert client.post(f"/api/documents/{DOC}/study-sets", json=BODY).status_code == 404


def test_a_bad_file_ends_as_failed_with_a_readable_message(api):
    client, holder = api
    holder["db"] = ready_db(status="processing")
    holder["db"].files[("documents", "u1/n.pdf")] = b"not a pdf"
    client.post(f"/api/documents/{DOC}/process")
    doc = holder["db"].rows("documents")[0]
    assert doc["status"] == "failed" and "not a valid PDF" in doc["error_message"]


# ---- estimating and generating ----

def test_estimate_reports_requests_without_creating_anything(api):
    client, holder = api
    r = client.post(f"/api/documents/{DOC}/study-sets/estimate", json=BODY)
    assert r.status_code == 200
    data = r.json()
    assert data["chunk_count"] == 2 and 1 <= data["planned_requests"] <= data["max_requests"]
    assert data["estimated_seconds"] == round(data["planned_requests"] * 60 / 12)
    assert holder["db"].rows("study_sets") == []


def test_generation_creates_and_fills_a_study_set(api):
    client, holder = api
    r = client.post(f"/api/documents/{DOC}/study-sets", json={**BODY, "title": "Week 1"})
    assert r.status_code == 202
    body = r.json()
    db = holder["db"]
    row = db.rows("study_sets")[0]
    assert body["study_set_id"] == row["id"] and body["planned_requests"] == row["progress_total"]
    assert row["status"] == "ready" and row["title"] == "Week 1"
    assert len(db.rows("flashcards")) == 5 and len(db.rows("questions")) == 5


def test_generation_needs_a_ready_document(api):
    client, holder = api
    holder["db"] = ready_db(status="processing")
    r = client.post(f"/api/documents/{DOC}/study-sets", json=BODY)
    assert r.status_code == 409 and holder["db"].rows("study_sets") == []


def test_generation_limits_concurrent_jobs(api):
    client, holder = api
    from tests.test_study_set_jobs import ago
    holder["db"].tables["study_sets"] = [
        {"id": f"s{i}", "user_id": "u1", "status": "generating", "updated_at": ago(1)} for i in range(2)]
    assert client.post(f"/api/documents/{DOC}/study-sets", json=BODY).status_code == 429


def test_missing_ai_configuration_is_a_clear_503_and_creates_nothing(api, monkeypatch):
    client, holder = api

    def unconfigured():
        raise AIConfigError("AI_API_KEY is not set in backend/.env.")

    monkeypatch.setattr(study_set_routes, "get_ai_client", unconfigured)
    r = client.post(f"/api/documents/{DOC}/study-sets", json=BODY)
    assert r.status_code == 503 and "AI_API_KEY" not in r.text  # server config details stay server-side
    assert holder["db"].rows("study_sets") == []


# ---- database errors ----

@pytest.mark.parametrize("status,expected", [(401, 401), (403, 403), (500, 502), (None, 502)])
def test_database_errors_map_to_sensible_http_codes(api, status, expected):
    client, holder = api
    holder["db"].fail_on[("select", "documents")] = DatabaseError("db said no", status)
    r = client.post(f"/api/documents/{DOC}/process")
    assert r.status_code == expected and r.json()["detail"] == "db said no"
