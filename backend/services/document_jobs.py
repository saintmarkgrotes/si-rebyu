"""Turn an uploaded file into saved, searchable chunks: download -> validate -> extract -> chunk -> save."""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from models.documents import Chunk
from services.chunker import chunk_document
from services.db import DatabaseError, eq
from services.errors import DocumentError
from services.extractors import extract_document
from services.file_validation import validate_upload

log = logging.getLogger("si-rebyu.documents")

STALE_AFTER = timedelta(minutes=15)  # a job that hasn't reported in this long is considered dead
BATCH_SIZE = 50
GENERIC_FAILURE = "Something went wrong while processing this document. Please try again."
_MIME = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_ts(value) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def is_stale(row: dict, after: timedelta = STALE_AFTER) -> bool:
    updated = parse_ts(row.get("updated_at"))
    return updated is None or datetime.now(timezone.utc) - updated > after


@dataclass
class Claim:
    document: dict | None  # None = no such document (or not yours)
    started: bool  # True = this caller now owns the job and must run it


async def claim_document(db, document_id: str) -> Claim:
    """Atomically take ownership of processing a document, so a double-click can't start two jobs."""
    rows = await db.select("documents", {"id": eq(document_id)}, limit=1)
    if not rows:
        return Claim(None, False)
    doc = rows[0]
    if doc["status"] == "ready":
        return Claim(doc, False)
    running = doc["status"] == "processing" and doc.get("processing_stage") is not None
    if running and not is_stale(doc):
        return Claim(doc, False)
    # Compare-and-swap on updated_at: if anyone else changed the row since we read it, this matches nothing.
    claimed = await db.update(
        "documents",
        {"status": "processing", "processing_stage": "extracting", "error_message": None, "updated_at": now_iso()},
        {"id": eq(document_id), "updated_at": eq(doc["updated_at"])},
    )
    return Claim(claimed[0], True) if claimed else Claim(doc, False)


def _extract_and_chunk(data: bytes, file_type: str):
    extracted = extract_document(data, file_type)
    return extracted, chunk_document(extracted)


async def _fail(db, document_id: str, message: str) -> None:
    try:
        await db.update(
            "documents",
            {"status": "failed", "processing_stage": None, "error_message": message, "updated_at": now_iso()},
            {"id": eq(document_id)},
        )
    except Exception:
        log.exception("could not record a document failure")


async def save_chunks(db, document_id: str, chunks: list[Chunk]) -> None:
    await db.delete("document_chunks", {"document_id": eq(document_id)})  # re-processing replaces old chunks
    rows = [
        {"document_id": document_id, "chunk_index": c.index, "text": c.text, "sources": c.sources,
         "heading": c.heading, "char_count": c.char_count}
        for c in chunks
    ]
    for i in range(0, len(rows), BATCH_SIZE):
        await db.insert("document_chunks", rows[i : i + BATCH_SIZE])


async def process_document(db, doc: dict) -> None:
    """Run the whole pipeline for a claimed document. Never raises: failures are recorded on the document."""
    doc_id = doc["id"]
    try:
        data = await db.download("documents", doc["storage_path"])
        file_type = validate_upload(f"file.{doc['file_type']}", data)
        extracted, chunks = await asyncio.to_thread(_extract_and_chunk, data, file_type)  # CPU-heavy: keep off the event loop
        if not chunks:
            raise DocumentError("No readable text was found in this document.")
        await db.update("documents", {"processing_stage": "saving", "updated_at": now_iso()}, {"id": eq(doc_id)})
        await save_chunks(db, doc_id, chunks)
        await db.update(
            "documents",
            {
                "status": "ready", "processing_stage": None, "error_message": None,
                "page_count": extracted.page_count, "chunk_count": len(chunks),
                "char_count": sum(c.char_count for c in chunks),
                "size_bytes": len(data), "mime_type": _MIME[file_type], "updated_at": now_iso(),
            },
            {"id": eq(doc_id)},
        )
    except DocumentError as err:
        await _fail(db, doc_id, str(err))
    except DatabaseError as err:
        # a missing file is something the user can act on; anything else is our problem, not theirs to parse
        await _fail(db, doc_id, str(err) if err.status == 404 else GENERIC_FAILURE)
    except Exception:
        log.exception("document processing crashed")
        await _fail(db, doc_id, GENERIC_FAILURE)
