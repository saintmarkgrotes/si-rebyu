from fastapi import APIRouter, Depends

from auth import AuthUser, get_current_user

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
async def health():
    return {"status": "ok", "service": "si-rebyu-api"}


@router.get("/me")
async def me(user: AuthUser = Depends(get_current_user)):
    """Auth smoke test: returns the verified user. Handy for checking the frontend token flow."""
    return {"id": user.id, "email": user.email}
