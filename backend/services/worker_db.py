"""Worker-only service access. Never instantiate this client from a public route."""
from services.db import UserDB


class WorkerDB(UserDB):
    def __init__(self, settings):
        if not settings.supabase_service_key:
            raise ValueError("SUPABASE_SERVICE_KEY is required by the worker.")
        super().__init__(settings, settings.supabase_service_key)
        self._headers["apikey"] = settings.supabase_service_key
