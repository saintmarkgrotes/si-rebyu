"""Create a study set from a processed document: check -> generate (with progress) -> save."""
import logging
from dataclasses import dataclass
from datetime import timedelta

from models.ai_output import GenerationOptions, GenerationResult
from models.documents import Chunk
from services.db import DatabaseError, eq
from services.document_jobs import BATCH_SIZE, is_stale, now_iso
from services.errors import GenerationError
from services.question_generator import generate_study_materials, plan_requests

log = logging.getLogger("si-rebyu.study_sets")

MAX_REQUESTS_PER_JOB = 60  # protects the shared AI quota from one enormous request
MAX_ACTIVE_JOBS = 2  # generations one user may have running at once
ACTIVE_STALE_AFTER = timedelta(minutes=30)  # a "generating" set silent for this long is treated as dead
MAX_TITLE_LENGTH = 120
GENERIC_FAILURE = "Something went wrong while creating your study material. Please try again."


class StudySetError(Exception):
    """A rejected request. The message is safe to show the user; status_code is the HTTP code to use."""

    status_code = 400


class NotFound(StudySetError):
    status_code = 404


class NotReady(StudySetError):
    status_code = 409


class TooLarge(StudySetError):
    status_code = 400


class TooManyJobs(StudySetError):
    status_code = 429


@dataclass
class Job:
    document: dict
    chunks: list[Chunk]
    chunk_ids: dict[int, str]  # chunk_index -> document_chunks.id
    options: GenerationOptions
    planned_requests: int
    study_set: dict | None = None  # set once the study_sets row exists


async def prepare(db, document_id: str, options: GenerationOptions) -> Job:
    """Validate a generation request and size it, without writing anything."""
    docs = await db.select("documents", {"id": eq(document_id)}, limit=1)
    if not docs:
        raise NotFound("Document not found.")
    doc = docs[0]
    if doc["status"] == "failed":
        raise NotReady(doc.get("error_message") or "This document could not be processed.")
    if doc["status"] != "ready":
        raise NotReady("This document is still being processed. Try again in a moment.")

    rows = await db.select("document_chunks", {"document_id": eq(document_id)}, order="chunk_index.asc")
    if not rows:
        raise NotReady("This document has no readable content yet.")
    chunks = [Chunk(index=r["chunk_index"], text=r["text"], sources=r.get("sources") or [], heading=r.get("heading"))
              for r in rows]
    planned = len(plan_requests(chunks, options))
    if planned > MAX_REQUESTS_PER_JOB:
        raise TooLarge(
            f"This selection needs about {planned} AI requests; the limit is {MAX_REQUESTS_PER_JOB}. "
            "Choose fewer items or use a shorter document."
        )
    return Job(doc, chunks, {r["chunk_index"]: r["id"] for r in rows}, options, planned)


async def create_study_set(db, user_id: str, document_id: str, options: GenerationOptions,
                           title: str | None) -> Job:
    job = await prepare(db, document_id, options)
    active = await db.select("study_sets", {"user_id": eq(user_id), "status": eq("generating")},
                             columns="id,updated_at")
    if sum(1 for r in active if not is_stale(r, ACTIVE_STALE_AFTER)) >= MAX_ACTIVE_JOBS:
        raise TooManyJobs("You already have study sets being generated. Wait for them to finish first.")
    name = ((title or "").strip() or job.document["title"])[:MAX_TITLE_LENGTH]
    rows = await db.insert("study_sets", [{
        "user_id": user_id, "document_id": job.document["id"], "title": name,
        "settings": options.model_dump(), "status": "generating", "stage": "analyzing",
        "progress_done": 0, "progress_total": job.planned_requests, "warnings": [],
        "created_at": now_iso(), "updated_at": now_iso(),
    }])
    job.study_set = rows[0]
    return job


async def _update_set(db, set_id: str, values: dict) -> None:
    await db.update("study_sets", {**values, "updated_at": now_iso()}, {"id": eq(set_id)})


async def ensure_topics(db, user_id: str, names: list[str]) -> dict[str, str]:
    """Return {name.casefold(): topic id}, creating topics that don't exist yet (matched ignoring case)."""
    async def load() -> dict[str, str]:
        rows = await db.select("topics", {"user_id": eq(user_id)}, columns="id,name", limit=5000)
        return {r["name"].casefold(): r["id"] for r in rows}

    known = await load()
    missing: list[str] = []
    seen: set[str] = set()
    for name in names:
        key = name.casefold()
        if key not in known and key not in seen:  # "Trunking" and "TRUNKING" are one topic
            seen.add(key)
            missing.append(name)
    if missing:
        await db.insert("topics", [{"user_id": user_id, "name": n} for n in missing],
                        on_conflict="user_id,name", ignore_duplicates=True)
        known = await load()
    return known


async def _link_document_topics(db, document_id: str, topic_ids: set[str]) -> None:
    have = {r["topic_id"] for r in await db.select("document_topics", {"document_id": eq(document_id)},
                                                   columns="topic_id")}
    await db.insert("document_topics", [{"document_id": document_id, "topic_id": t}
                                        for t in sorted(topic_ids - have)])


async def save_results(db, user_id: str, job: Job, result: GenerationResult) -> None:
    doc_id, set_id = job.document["id"], job.study_set["id"]
    names = list(dict.fromkeys([f.topic for f in result.flashcards] + [q.topic for q in result.questions]))
    topics = await ensure_topics(db, user_id, names)

    cards = [
        {"user_id": user_id, "study_set_id": set_id, "document_id": doc_id,
         "chunk_id": job.chunk_ids.get(f.chunk_index), "topic_id": topics.get(f.topic.casefold()),
         "front": f.question, "back": f.answer, "difficulty": f.difficulty, "source": f.source}
        for f in result.flashcards
    ]
    # the questions table has no user_id: ownership comes from the document
    questions = [
        {"document_id": doc_id, "study_set_id": set_id, "chunk_id": job.chunk_ids.get(q.chunk_index),
         "topic_id": topics.get(q.topic.casefold()), "question_text": q.question, "question_type": q.type,
         "options": q.choices, "correct_answer": q.correct_answer, "explanation": q.explanation or None,
         "difficulty": q.difficulty, "source": q.source}
        for q in result.questions
    ]
    for table, rows in (("flashcards", cards), ("questions", questions)):
        for i in range(0, len(rows), BATCH_SIZE):
            await db.insert(table, rows[i : i + BATCH_SIZE])

    await _link_document_topics(db, doc_id, {r["topic_id"] for r in cards + questions if r["topic_id"]})


async def _fail(db, set_id: str, message: str, cleanup: bool = False) -> None:
    try:
        if cleanup:  # a half-saved set would be confusing; remove whatever was written
            await db.delete("flashcards", {"study_set_id": eq(set_id)})
            await db.delete("questions", {"study_set_id": eq(set_id)})
        await _update_set(db, set_id, {"status": "failed", "stage": None, "error_message": message})
    except Exception:
        log.exception("could not record a study set failure")


async def run_generation(db, user_id: str, job: Job, ai_client) -> None:
    """Run a study-set job. Never raises: failures are recorded on the study set."""
    set_id = job.study_set["id"]
    try:
        await _update_set(db, set_id, {"stage": "generating"})

        async def progress(done: int, total: int) -> None:
            await _update_set(db, set_id, {"progress_done": done, "progress_total": total})

        result = await generate_study_materials(job.chunks, job.options, ai_client, progress)
        await _update_set(db, set_id, {"stage": "saving"})
        await save_results(db, user_id, job, result)
        await _update_set(db, set_id, {
            "status": "ready", "stage": None, "error_message": None, "warnings": result.warnings,
            "flashcard_count": len(result.flashcards), "question_count": len(result.questions),
        })
    except GenerationError as err:
        await _fail(db, set_id, str(err))
    except DatabaseError:
        await _fail(db, set_id, GENERIC_FAILURE, cleanup=True)
    except Exception:
        log.exception("study set generation crashed")
        await _fail(db, set_id, GENERIC_FAILURE, cleanup=True)
