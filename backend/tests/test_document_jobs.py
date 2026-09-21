import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from services import document_jobs
from services.db import DatabaseError
from services.document_jobs import GENERIC_FAILURE, claim_document, is_stale, now_iso, process_document
from tests.fake_db import FakeDB
from tests.helpers import make_blank_pdf, make_docx, make_pdf, make_pptx


def run(coro):
    return asyncio.run(coro)


def doc(id="d1", status="processing", stage=None, file_type="pdf", age_minutes=0, path="u1/file.pdf"):
    stamp = (datetime.now(timezone.utc) - timedelta(minutes=age_minutes)).isoformat()
    return {"id": id, "user_id": "u1", "title": "My notes.pdf", "file_type": file_type, "storage_path": path,
            "status": status, "processing_stage": stage, "error_message": None, "page_count": None,
            "created_at": stamp, "updated_at": stamp}


def pdf_bytes(pages=3):
    line = "A VLAN is a logical network that separates traffic on a switch and this sentence is long enough."
    return make_pdf([[line] for _ in range(pages)])


# ---- claiming: safe against double clicks, retries and races ----

def test_a_fresh_upload_is_claimed_once():
    db = FakeDB({"documents": [doc()]})
    first = run(claim_document(db, "d1"))
    assert first.started and first.document["processing_stage"] == "extracting"
    second = run(claim_document(db, "d1"))
    assert not second.started  # already running


def test_unknown_document_is_not_found():
    assert run(claim_document(FakeDB({"documents": []}), "nope")).document is None


def test_ready_documents_are_not_reprocessed():
    claim = run(claim_document(FakeDB({"documents": [doc(status="ready")]}), "d1"))
    assert not claim.started and claim.document["status"] == "ready"


def test_failed_documents_can_be_retried():
    db = FakeDB({"documents": [doc(status="failed")]})
    claim = run(claim_document(db, "d1"))
    assert claim.started
    assert db.rows("documents")[0]["status"] == "processing" and db.rows("documents")[0]["error_message"] is None


def test_abandoned_jobs_are_taken_over_but_fresh_ones_are_not():
    assert run(claim_document(FakeDB({"documents": [doc(stage="extracting", age_minutes=20)]}), "d1")).started
    assert not run(claim_document(FakeDB({"documents": [doc(stage="extracting", age_minutes=2)]}), "d1")).started


def test_a_lost_race_does_not_start_a_second_job():
    class Racy(FakeDB):
        async def select(self, *a, **kw):
            rows = await super().select(*a, **kw)
            self.rows("documents")[0]["updated_at"] = "changed-by-another-request"  # someone else claimed it first
            return rows

    claim = run(claim_document(Racy({"documents": [doc()]}), "d1"))
    assert not claim.started


def test_is_stale_handles_bad_timestamps():
    assert is_stale({"updated_at": "garbage"}) and is_stale({})
    assert not is_stale({"updated_at": now_iso()})
    assert is_stale({"updated_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")})


# ---- processing ----

def processed(db, d):
    run(process_document(db, d))
    return db.rows("documents")[0], db.rows("document_chunks")


@pytest.mark.parametrize(
    "file_type,data,mime_part",
    [("pdf", pdf_bytes(), "pdf"), ("docx", make_docx(), "wordprocessingml"), ("pptx", make_pptx(), "presentationml")],
)
def test_each_format_ends_ready_with_chunks_and_details(file_type, data, mime_part):
    d = doc(file_type=file_type, path=f"u1/file.{file_type}")
    db = FakeDB({"documents": [d]}, {("documents", f"u1/file.{file_type}"): data})
    row, chunks = processed(db, d)
    assert row["status"] == "ready" and row["processing_stage"] is None and row["error_message"] is None
    assert row["chunk_count"] == len(chunks) >= 1
    assert row["char_count"] == sum(c["char_count"] for c in chunks)
    assert row["size_bytes"] == len(data) and mime_part in row["mime_type"]
    assert [c["chunk_index"] for c in chunks] == list(range(len(chunks)))
    assert all(c["document_id"] == "d1" and c["sources"] for c in chunks)


def test_page_count_is_recorded_for_pdfs_and_slides():
    d = doc()
    row, _ = processed(FakeDB({"documents": [d]}, {("documents", "u1/file.pdf"): pdf_bytes(3)}), d)
    assert row["page_count"] == 3
    d = doc(file_type="pptx", path="u1/file.pptx")
    row, _ = processed(FakeDB({"documents": [d]}, {("documents", "u1/file.pptx"): make_pptx()}), d)
    assert row["page_count"] == 2


def test_large_documents_are_saved_in_batches():
    big = make_pdf([[f"Paragraph about routing and switching number {n} with plenty of extra words here." * 20] for n in range(60)])
    d = doc()
    db = FakeDB({"documents": [d]}, {("documents", "u1/file.pdf"): big})
    row, chunks = processed(db, d)
    assert row["status"] == "ready" and len(chunks) > 1 and row["chunk_count"] == len(chunks)


def test_scanned_pdf_fails_with_a_clear_message_and_saves_nothing():
    d = doc()
    row, chunks = processed(FakeDB({"documents": [d]}, {("documents", "u1/file.pdf"): make_blank_pdf()}), d)
    assert row["status"] == "failed" and "No readable text" in row["error_message"]
    assert row["processing_stage"] is None and chunks == []


def test_missing_file_fails_with_a_clear_message():
    d = doc()
    row, _ = processed(FakeDB({"documents": [d]}), d)
    assert row["status"] == "failed" and "could not be found" in row["error_message"]


def test_disguised_program_is_rejected():
    d = doc()
    row, chunks = processed(FakeDB({"documents": [d]}, {("documents", "u1/file.pdf"): b"MZ\x90" + b"\x00" * 300}), d)
    assert row["status"] == "failed" and "not a valid PDF" in row["error_message"] and chunks == []


def test_database_trouble_ends_failed_without_leaking_details():
    d = doc()
    db = FakeDB({"documents": [d]}, {("documents", "u1/file.pdf"): pdf_bytes()})
    db.fail_on[("insert", "document_chunks")] = DatabaseError("boom: constraint xyz", 500)
    row, _ = processed(db, d)
    assert row["status"] == "failed" and row["error_message"] == GENERIC_FAILURE


def test_unexpected_crashes_still_end_as_failed(monkeypatch):
    def explode(data, file_type):
        raise RuntimeError("bug")

    monkeypatch.setattr(document_jobs, "_extract_and_chunk", explode)
    d = doc()
    row, _ = processed(FakeDB({"documents": [d]}, {("documents", "u1/file.pdf"): pdf_bytes()}), d)
    assert row["status"] == "failed" and row["error_message"] == GENERIC_FAILURE


def test_reprocessing_replaces_old_chunks():
    d = doc(status="failed")
    db = FakeDB({"documents": [d], "document_chunks": [{"id": "old", "document_id": "d1", "chunk_index": 0, "text": "old"}]},
                {("documents", "u1/file.pdf"): pdf_bytes()})
    _, chunks = processed(db, d)
    assert all(c["id"] != "old" for c in chunks)
