"""Supabase JWT verification.

The React app sends the user's Supabase access token as `Authorization: Bearer <jwt>`.
We ask Supabase Auth to validate it (GET /auth/v1/user). This works no matter which
signing method the project uses and never requires the JWT secret in this service.
"""
import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)

# token -> (expires_at, user). Avoids a network round trip on every request
# (e.g. while the frontend polls processing status). Kept deliberately short.
_CACHE_TTL_SECONDS = 30
_cache: dict[str, tuple[float, "AuthUser"]] = {}


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None
    token: str  # kept so later phases can make user-scoped (RLS-enforced) Supabase calls


async def verify_token(token: str, settings: Settings) -> AuthUser:
    now = time.monotonic()
    cached = _cache.get(token)
    if cached and cached[0] > now:
        return cached[1]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={"Authorization": f"Bearer {token}", "apikey": settings.supabase_anon_key},
            )
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not reach the auth service.")

    if resp.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.")

    body = resp.json()
    user = AuthUser(id=body["id"], email=body.get("email"), token=token)
    _cache[token] = (now + _CACHE_TTL_SECONDS, user)
    if len(_cache) > 1000:  # simple bound so the cache can't grow forever
        _cache.clear()
    return user


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> AuthUser:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing authentication token.")
    return await verify_token(creds.credentials, settings)
