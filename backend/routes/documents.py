import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from auth import AuthUser, get_current_user
from config import Settings, get_settings
from services.db import UserDB
from services.document_jobs import claim_document, process_document

log = logging.getLogger("si-rebyu.routes")
router = APIRouter(prefix="/api/documents", tags=["documents"])


async def run_process_job(settings: Settings, token: str, document: dict) -> None:
    async with UserDB(settings, token) as db:
        await process_document(db, document)


@router.post("/{document_id}/process", status_code=202)
async def process(
    document_id: UUID,
    background: BackgroundTasks,
    user: AuthUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Start extracting a document you uploaded. Safe to call twice: only one job ever runs."""
    async with UserDB(settings, user.token) as db:
        claim = await claim_document(db, str(document_id))
    if claim.document is None:
        raise HTTPException(404, "Document not found.")
    if claim.started:
        background.add_task(run_process_job, settings, user.token, claim.document)
    return {"started": claim.started, "status": claim.document["status"]}
