import logging
import math
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import Field

from auth import AuthUser, get_current_user
from config import Settings, get_settings
from models.ai_output import GenerationOptions
from services.ai import get_ai_client
from services.db import UserDB
from services.errors import AIConfigError
from services import study_set_jobs
from services.study_set_jobs import create_study_set, prepare, run_generation

log = logging.getLogger("si-rebyu.routes")
router = APIRouter(prefix="/api/documents", tags=["study sets"])


class GenerateRequest(GenerationOptions):
    title: str | None = Field(default=None, max_length=120)

    def options(self) -> GenerationOptions:
        return GenerationOptions(**self.model_dump(exclude={"title"}))


def _estimate_seconds(planned: int, settings: Settings) -> int:
    return math.ceil(planned * 60 / max(1, settings.ai_requests_per_minute))


async def run_generation_job(settings, token, user_id, job, ai_client) -> None:
    async with UserDB(settings, token) as db:
        await run_generation(db, user_id, job, ai_client)


@router.post("/{document_id}/study-sets/estimate")
async def estimate(
    document_id: UUID,
    body: GenerateRequest,
    user: AuthUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """How many shared AI requests a generation would use, before the user commits to it."""
    async with UserDB(settings, user.token) as db:
        job = await prepare(db, str(document_id), body.options())
    return {
        "planned_requests": job.planned_requests,
        "max_requests": study_set_jobs.MAX_REQUESTS_PER_JOB,
        "chunk_count": len(job.chunks),
        "estimated_seconds": _estimate_seconds(job.planned_requests, settings),
    }


@router.post("/{document_id}/study-sets", status_code=202)
async def create(
    document_id: UUID,
    body: GenerateRequest,
    background: BackgroundTasks,
    user: AuthUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Start generating flashcards and questions. Progress is read from the study_sets row."""
    try:
        ai_client = get_ai_client()
    except AIConfigError as err:
        log.error("AI is not configured: %s", err)
        raise HTTPException(503, "AI generation isn't set up on the server yet.")
    async with UserDB(settings, user.token) as db:
        job = await create_study_set(db, user.id, str(document_id), body.options(), body.title)
    background.add_task(run_generation_job, settings, user.token, user.id, job, ai_client)
    return {
        "study_set_id": job.study_set["id"],
        "planned_requests": job.planned_requests,
        "estimated_seconds": _estimate_seconds(job.planned_requests, settings),
    }
