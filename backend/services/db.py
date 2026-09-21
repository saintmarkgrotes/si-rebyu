"""A tiny Supabase client (database + storage) that always acts as the signed-in user.

Every request carries the user's own JWT, so Row Level Security applies exactly as it does for the
React app. The service key is deliberately not used anywhere in here.
"""
import logging
from urllib.parse import quote

import httpx

from config import Settings
from services.errors import DocumentError

log = logging.getLogger("si-rebyu.db")

_NOT_FOUND = "The uploaded file could not be found. Please upload it again."


class DatabaseError(Exception):
    """A database or storage problem. The message is safe to show to the user; `status` is the upstream code."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def eq(value) -> str:
    """Build a PostgREST equality filter value: {"id": eq(some_id)}."""
    return f"eq.{value}"


def _message(status: int) -> str:
    if status == 401:
        return "Your session has expired. Please sign in again."
    if status == 403:
        return "You don't have permission to do that."
    if status >= 500:
        return "The database is temporarily unavailable. Please try again."
    return "The database rejected the request."


class UserDB:
    def __init__(self, settings: Settings, token: str, timeout: float = 30.0):
        base = settings.supabase_url.rstrip("/")
        self._rest = f"{base}/rest/v1"
        self._storage = f"{base}/storage/v1"
        self._headers = {"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"}
        self._client = httpx.AsyncClient(timeout=timeout)

    async def __aenter__(self) -> "UserDB":
        return self

    async def __aexit__(self, *exc) -> None:
        await self._client.aclose()

    async def _send(self, method: str, url: str, headers: dict | None = None, **kwargs) -> httpx.Response:
        try:
            resp = await self._client.request(method, url, headers={**self._headers, **(headers or {})}, **kwargs)
        except httpx.TimeoutException:
            log.warning("database request timed out")
            raise DatabaseError("The database took too long to respond. Please try again.", 504)
        except httpx.HTTPError as err:
            log.warning("database request failed: %s", type(err).__name__)
            raise DatabaseError("Could not reach the database.", 503)
        if resp.status_code >= 400:
            # details stay in the server log; the user only ever sees the generic message
            log.warning("database error %s on %s %s: %s", resp.status_code, method, url.split("?")[0], resp.text[:300])
            raise DatabaseError(_message(resp.status_code), resp.status_code)
        return resp

    # Filters use PostgREST syntax, e.g. {"id": eq(x), "status": "neq.ready", "processing_stage": "is.null"}.
    async def select(self, table: str, filters: dict | None = None, columns: str = "*",
                     order: str | None = None, limit: int | None = None) -> list[dict]:
        params = {"select": columns, **(filters or {})}
        if order:
            params["order"] = order
        if limit:
            params["limit"] = str(limit)
        return (await self._send("GET", f"{self._rest}/{table}", params=params)).json()

    async def insert(self, table: str, rows: list[dict], *, on_conflict: str | None = None,
                     ignore_duplicates: bool = False) -> list[dict]:
        if not rows:
            return []
        prefer = ["return=representation"]
        params = {}
        if on_conflict:
            params["on_conflict"] = on_conflict
            prefer.append("resolution=ignore-duplicates" if ignore_duplicates else "resolution=merge-duplicates")
        resp = await self._send("POST", f"{self._rest}/{table}", params=params, json=rows,
                                headers={"Prefer": ",".join(prefer)})
        return resp.json()

    async def update(self, table: str, values: dict, filters: dict) -> list[dict]:
        if not filters:
            raise ValueError("update() needs at least one filter")  # never update a whole table by accident
        resp = await self._send("PATCH", f"{self._rest}/{table}", params=filters, json=values,
                                headers={"Prefer": "return=representation"})
        return resp.json()

    async def delete(self, table: str, filters: dict) -> None:
        if not filters:
            raise ValueError("delete() needs at least one filter")
        await self._send("DELETE", f"{self._rest}/{table}", params=filters)

    async def download(self, bucket: str, path: str, max_bytes: int = 25 * 1024 * 1024) -> bytes:
        url = f"{self._storage}/object/{quote(bucket, safe='')}/{quote(path, safe='/')}"
        try:
            async with self._client.stream("GET", url, headers=self._headers) as resp:
                if resp.status_code in (400, 404):
                    raise DatabaseError(_NOT_FOUND, 404)
                if resp.status_code >= 400:
                    log.warning("storage error %s downloading from bucket %s", resp.status_code, bucket)
                    raise DatabaseError(_message(resp.status_code), resp.status_code)
                data = bytearray()
                async for part in resp.aiter_bytes():
                    data += part
                    if len(data) > max_bytes:  # don't hold an enormous file in memory just to reject it
                        raise DocumentError("The file is too large to process.")
                return bytes(data)
        except httpx.TimeoutException:
            raise DatabaseError("File storage took too long to respond. Please try again.", 504)
        except httpx.HTTPError as err:
            log.warning("storage request failed: %s", type(err).__name__)
            raise DatabaseError("Could not reach file storage.", 503)
