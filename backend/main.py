import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from routes import documents, study_sets, system
from services.db import DatabaseError
from services.study_set_jobs import StudySetError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()

app = FastAPI(title="si-rebyu API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # we use bearer tokens, not cookies
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(DatabaseError)
async def database_error_handler(_: Request, err: DatabaseError):
    # pass 401/403 through so the app can ask the user to sign in again; everything else is a bad gateway
    code = err.status if err.status in (401, 403) else 502
    return JSONResponse(status_code=code, content={"detail": str(err)})


@app.exception_handler(StudySetError)
async def study_set_error_handler(_: Request, err: StudySetError):
    return JSONResponse(status_code=err.status_code, content={"detail": str(err)})


app.include_router(system.router)
app.include_router(documents.router)
app.include_router(study_sets.router)
