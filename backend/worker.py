"""Run with `python worker.py` from backend/. Deploy as a persistent worker, not a function."""
import asyncio
import hashlib
import json
import logging
import signal
from dataclasses import asdict
from uuid import uuid4

from config import get_settings
from models.ai_output import GenerationOptions
from services.ai import build_provider
from services.ai.client import AIClient
from services.db import DatabaseError, eq
from services.document_jobs import _extract_and_chunk, _MIME
from services.errors import AIQuotaError, DocumentError, GenerationError
from services.file_validation import validate_upload
from services.question_generator import generate_study_materials
from services.study_set_jobs import prepare, StudySetError
from services.worker_db import WorkerDB

log = logging.getLogger("si-rebyu.worker")


class CheckpointProvider:
    """Shared DB rate limiter + response checkpoints survive process restarts.

    A crash between the provider response and checkpoint commit can repeat one AI
    call. Results are published exactly once using the current lease in SQL.
    """
    def __init__(self, db, job, provider, model):
        self.db, self.job, self.provider, self.model = db, job, provider, model

    async def generate_json(self, system, prompt, max_output_tokens=8192):
        digest = hashlib.sha256(json.dumps([self.model, system, prompt, max_output_tokens]).encode()).hexdigest()
        params = {"p_job": self.job["id"], "p_lease": self.job["lease_token"], "p_hash": digest}
        while True:
            try:
                step = await self.db.rpc("job_ai_step", params)
            except DatabaseError as err:
                if err.status == 429:
                    raise AIQuotaError(str(err)) from err
                raise
            if "response" in step:
                return step["response"]
            if step.get("allowed"):
                break
            await asyncio.sleep(min(30, max(0.05, step["wait"])))
        response = await self.provider.generate_json(system, prompt, max_output_tokens)
        await self.db.rpc("job_ai_step", {**params, "p_response": response})
        return response


async def execute_job(db, job, settings):
    lease = {"p_job": job["id"], "p_lease": job["lease_token"]}
    docs = await db.select("documents", {"id": eq(job["document_id"]), "user_id": eq(job["user_id"])}, limit=1)
    if not docs:
        raise DocumentError("This document no longer exists.")
    doc = docs[0]
    if job["kind"] == "document":
        # Service storage access bypasses RLS; enforce the persisted owner's prefix.
        if not doc["storage_path"].startswith(job["user_id"] + "/") or ".." in doc["storage_path"].split("/"):
            raise DocumentError("The uploaded file does not belong to this account.")
        data = await db.download("documents", doc["storage_path"], max_bytes=20 * 1024 * 1024)
        kind = validate_upload("file." + doc["file_type"], data)
        extracted, chunks = await asyncio.to_thread(_extract_and_chunk, data, kind)
        if not chunks:
            raise DocumentError("No readable text was found in this document.")
        await db.rpc("finish_document", {**lease, "p_chunks": [asdict(c) for c in chunks],
                     "p_pages": extracted.page_count, "p_size": len(data), "p_mime": _MIME[kind]})
        return
    sets = await db.select("study_sets", {"id": eq(job["study_set_id"]), "user_id": eq(job["user_id"]),
                                         "document_id": eq(doc["id"])}, limit=1)
    if not sets:
        raise DocumentError("This study set no longer exists.")
    prepared = await prepare(db, doc["id"], GenerationOptions(**job["options"]))
    provider = CheckpointProvider(db, job, build_provider(settings), settings.ai_model)
    client = AIClient(provider, settings.ai_requests_per_minute)

    async def progress(done, total):
        await db.rpc("heartbeat_job", {**lease, "p_done": done, "p_total": total})

    result = await generate_study_materials(prepared.chunks, prepared.options, client, progress)
    await db.rpc("finish_generation", {**lease, "p_result": result.model_dump()})


async def run_claimed(db, job, settings):
    async def heartbeat():
        while True:
            await asyncio.sleep(20)
            await db.rpc("heartbeat_job", {"p_job": job["id"], "p_lease": job["lease_token"]})

    work = asyncio.create_task(execute_job(db, job, settings))
    pulse = asyncio.create_task(heartbeat())
    try:
        done, _ = await asyncio.wait({work, pulse}, return_when=asyncio.FIRST_COMPLETED)
        # Prefer a completed publication if a concurrent final heartbeat loses its lease.
        if work in done:
            await work
        else:
            await pulse
    finally:
        for task in (work, pulse):
            if not task.done():
                task.cancel()
        await asyncio.gather(work, pulse, return_exceptions=True)


async def process_next(db, settings):
    job = await db.rpc("claim_job", {})
    if not job:
        return False
    log.info("job started id=%s kind=%s attempt=%s", job["id"], job["kind"], job["attempts"])
    try:
        await run_claimed(db, job, settings)
    except DatabaseError:
        # Keep the lease: a replacement will replay checkpoints once it expires.
        log.exception("job database interruption id=%s; lease recovery will retry", job["id"])
    except (DocumentError, GenerationError, StudySetError) as err:
        await db.rpc("fail_job", {"p_job": job["id"], "p_lease": job["lease_token"], "p_message": str(err)})
        log.warning("job failed id=%s type=%s", job["id"], type(err).__name__)
    except Exception:
        log.exception("job crashed id=%s; lease recovery will retry", job["id"])
    else:
        log.info("job completed id=%s", job["id"])
    return True


async def run_worker(db, settings, stop, *, shutdown_seconds=20):
    worker_id = str(uuid4())

    async def wait_or_stop(seconds):
        try:
            await asyncio.wait_for(stop.wait(), timeout=seconds)
        except TimeoutError:
            pass

    async def report_health():
        while not stop.is_set():
            try:
                await db.rpc("worker_heartbeat", {"p_worker": worker_id})
            except DatabaseError:
                log.exception("could not report worker heartbeat")
            await wait_or_stop(15)

    async def consume():
        while not stop.is_set():
            try:
                if not await process_next(db, settings):
                    await wait_or_stop(3)
            except DatabaseError:
                log.exception("worker database unavailable")
                await wait_or_stop(5)

    health = asyncio.create_task(report_health())
    consumer = asyncio.create_task(consume())
    shutdown = asyncio.create_task(stop.wait())
    try:
        done, _ = await asyncio.wait({consumer, health, shutdown}, return_when=asyncio.FIRST_COMPLETED)
        if shutdown in done:
            log.info("worker stopping; allowing current job up to %s seconds", shutdown_seconds)
            try:
                await asyncio.wait_for(consumer, timeout=shutdown_seconds)
            except TimeoutError:
                log.info("unfinished job cancelled; its lease will be recovered")
        else:
            # Unexpected task exits must reach the process supervisor.
            for task in done:
                await task
    finally:
        for task in (consumer, health, shutdown):
            if not task.done():
                task.cancel()
        await asyncio.gather(consumer, health, shutdown, return_exceptions=True)


async def main():
    settings = get_settings()
    build_provider(settings)  # fail immediately on missing AI configuration
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    installed_signals = []
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, stop.set)
            installed_signals.append(sig)
        except NotImplementedError:
            pass  # Windows console interrupt is handled by asyncio.run.
    try:
        async with WorkerDB(settings) as db:
            await run_worker(db, settings, stop)
    finally:
        for sig in installed_signals:
            loop.remove_signal_handler(sig)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass  # outstanding leases are recovered by the next worker
