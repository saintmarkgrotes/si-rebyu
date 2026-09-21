import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from models.ai_output import GenerationOptions
from services import study_set_jobs
from services.ai.client import AIClient
from services.db import DatabaseError
from services.errors import AIQuotaError, AITransientError
from services.study_set_jobs import (
    GENERIC_FAILURE, NotFound, NotReady, TooLarge, TooManyJobs, create_study_set, ensure_topics, run_generation,
)
from tests.fake_db import FakeDB
from tests.fakes import EchoProvider, FakeProvider, make_chunk


def run(coro):
    return asyncio.run(coro)


async def _no_sleep(_):
    return None


def client(provider=None, attempts=4):
    return AIClient(provider or EchoProvider(), 600, attempts, sleep=_no_sleep)


def ago(minutes):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


def opts(**kw):
    base = dict(flashcards=10, questions=10, question_types=["multiple_choice", "true_false", "identification"])
    base.update(kw)
    return GenerationOptions(**base)


def seeded(status="ready", chunks=3, extra=None, error=None):
    cs = [make_chunk(index=i, pages=(2 * i + 1, 2 * i + 2)) for i in range(chunks)]
    tables = {
        "documents": [{"id": "d1", "user_id": "u1", "title": "Notes.pdf", "status": status, "error_message": error}],
        "document_chunks": [{"id": f"chunk-{c.index}", "document_id": "d1", "chunk_index": c.index, "text": c.text,
                             "sources": c.sources, "heading": c.heading} for c in cs],
    }
    tables.update(extra or {})
    return FakeDB(tables)


def generate(db, options=None, ai=None):
    job = run(create_study_set(db, "u1", "d1", options or opts(), None))
    run(run_generation(db, "u1", job, ai or client()))
    return job, db.rows("study_sets")[0]


# ---- creating a study set ----

def test_creating_a_set_records_settings_and_planned_requests():
    db = seeded()
    job = run(create_study_set(db, "u1", "d1", opts(), None))
    row = db.rows("study_sets")[0]
    assert row["status"] == "generating" and row["stage"] == "analyzing" and row["user_id"] == "u1"
    assert row["title"] == "Notes.pdf" and row["settings"]["flashcards"] == 10
    assert row["progress_total"] >= 1 and job.study_set["id"] == row["id"]
    assert list(job.chunk_ids) == [0, 1, 2]


def test_custom_titles_are_used_and_capped():
    db = seeded()
    run(create_study_set(db, "u1", "d1", opts(), "x" * 500))
    assert len(db.rows("study_sets")[0]["title"]) == 120


def test_unknown_document():
    with pytest.raises(NotFound):
        run(create_study_set(FakeDB({"documents": []}), "u1", "d1", opts(), None))


@pytest.mark.parametrize("status,error,text", [("processing", None, "still being processed"),
                                               ("failed", "This PDF could not be opened.", "could not be opened")])
def test_document_must_be_ready(status, error, text):
    with pytest.raises(NotReady, match=text):
        run(create_study_set(seeded(status=status, error=error), "u1", "d1", opts(), None))


def test_document_without_chunks_is_not_ready():
    with pytest.raises(NotReady):
        run(create_study_set(seeded(chunks=0), "u1", "d1", opts(), None))


def test_oversized_requests_are_refused_before_spending_quota(monkeypatch):
    monkeypatch.setattr(study_set_jobs, "MAX_REQUESTS_PER_JOB", 1)
    db = seeded()
    with pytest.raises(TooLarge, match="AI requests"):
        run(create_study_set(db, "u1", "d1", opts(), None))
    assert db.rows("study_sets") == []


def test_too_many_running_generations_are_refused_but_abandoned_ones_dont_count():
    running = lambda age: {"id": f"s{age}", "user_id": "u1", "status": "generating", "updated_at": ago(age)}
    db = seeded(extra={"study_sets": [running(1), running(2)]})
    with pytest.raises(TooManyJobs):
        run(create_study_set(db, "u1", "d1", opts(), None))
    db = seeded(extra={"study_sets": [running(1), running(90)]})  # one is stale
    run(create_study_set(db, "u1", "d1", opts(), None))
    db = seeded(extra={"study_sets": [{"id": "x", "user_id": "someone-else", "status": "generating", "updated_at": ago(1)},
                                      {"id": "y", "user_id": "someone-else", "status": "generating", "updated_at": ago(1)}]})
    run(create_study_set(db, "u1", "d1", opts(), None))  # other people's jobs don't block you


# ---- generating and saving ----

def test_successful_generation_saves_everything_with_correct_columns():
    db = seeded()
    job, row = generate(db)
    assert row["status"] == "ready" and row["stage"] is None and row["error_message"] is None
    assert row["flashcard_count"] == 10 and row["question_count"] == 10
    assert row["progress_done"] == row["progress_total"] >= 1

    cards, qs = db.rows("flashcards"), db.rows("questions")
    assert len(cards) == 10 and len(qs) == 10
    topic_ids = {t["id"] for t in db.rows("topics")}
    for c in cards:
        assert c["user_id"] == "u1" and c["study_set_id"] == row["id"] and c["document_id"] == "d1"
        assert c["chunk_id"] in {"chunk-0", "chunk-1", "chunk-2"} and c["topic_id"] in topic_ids
        assert c["front"] and c["back"] and c["difficulty"] in ("easy", "medium", "hard") and c["source"]
    for q in qs:
        assert q["document_id"] == "d1" and q["study_set_id"] == row["id"] and q["chunk_id"].startswith("chunk-")
        assert q["question_text"] and q["correct_answer"] and q["explanation"]
        if q["question_type"] == "multiple_choice":
            assert len(q["options"]) == 4 and q["correct_answer"] in q["options"]
        else:
            assert q["options"] is None
    assert {q["question_type"] for q in qs} == {"multiple_choice", "true_false", "identification"}
    assert "user_id" not in qs[0]  # the questions table has no user_id column; ownership is via the document


def test_topics_are_created_once_matched_ignoring_case_and_linked_to_the_document():
    db = seeded(extra={"topics": [{"id": "t-existing", "user_id": "u1", "name": "switching"}]})
    generate(db)
    assert [t["id"] for t in db.rows("topics")] == ["t-existing"]  # "Switching" reused the existing topic
    assert {c["topic_id"] for c in db.rows("flashcards")} == {"t-existing"}
    assert db.rows("document_topics") == [{"document_id": "d1", "topic_id": "t-existing"}]
    generate(db)  # a second study set must not create duplicate links
    assert len(db.rows("document_topics")) == 1


def test_short_answer_items_without_explanations_are_stored_as_null():
    class Reply(EchoProvider):
        async def generate_json(self, system, prompt, max_output_tokens=8192):
            import json
            data = json.loads(await super().generate_json(system, prompt, max_output_tokens))
            for q in data["questions"]:
                q["explanation"] = ""
            return json.dumps(data)

    db = seeded()
    generate(db, opts(flashcards=0, questions=4, question_types=["identification"]), client(Reply()))
    assert all(q["explanation"] is None for q in db.rows("questions"))


def test_ai_failure_marks_the_set_failed_with_a_friendly_message():
    db = seeded()
    _, row = generate(db, ai=client(FakeProvider([AITransientError("down")] * 20), attempts=1))
    assert row["status"] == "failed" and "try again" in row["error_message"] and row["stage"] is None
    assert db.rows("flashcards") == [] and db.rows("questions") == []


def test_daily_quota_is_reported_clearly():
    db = seeded()
    _, row = generate(db, ai=client(FakeProvider([AIQuotaError("The AI daily limit has been reached. Try again tomorrow.")])))
    assert row["status"] == "failed" and "daily limit" in row["error_message"]


def test_a_failed_save_cleans_up_partial_results():
    db = seeded()
    db.fail_on[("insert", "questions")] = DatabaseError("boom", 500)
    _, row = generate(db)
    assert row["status"] == "failed" and row["error_message"] == GENERIC_FAILURE
    assert db.rows("flashcards") == [] and db.rows("questions") == []  # no half-finished study set left behind


def test_unexpected_crashes_are_contained():
    class Broken(EchoProvider):
        async def generate_json(self, *a, **kw):
            raise RuntimeError("bug")

    db = seeded()
    _, row = generate(db, ai=client(Broken()))
    assert row["status"] == "failed" and row["error_message"] == GENERIC_FAILURE


def test_ensure_topics_handles_many_and_repeated_names():
    db = FakeDB({"topics": [{"id": "t1", "user_id": "u1", "name": "VLAN"}, {"id": "tx", "user_id": "u2", "name": "Other"}]})
    ids = run(ensure_topics(db, "u1", ["vlan", "Trunking", "TRUNKING", "Routing"]))
    assert ids["vlan"] == "t1" and set(ids) == {"vlan", "trunking", "routing"}
    assert len([t for t in db.rows("topics") if t["user_id"] == "u1"]) == 3  # no case-variant duplicates
