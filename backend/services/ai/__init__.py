from functools import lru_cache

from config import Settings, get_settings
from services.ai.base import AIProvider
from services.ai.client import AIClient
from services.ai.gemini import GeminiProvider
from services.errors import AIConfigError


def build_provider(settings: Settings) -> AIProvider:
    """Pick the AI vendor from AI_PROVIDER. To add one (e.g. Groq), add a subclass and a branch here."""
    name = settings.ai_provider.strip().lower()
    if name == "gemini":
        return GeminiProvider(settings.ai_api_key, settings.ai_model)
    raise AIConfigError(f"Unknown AI_PROVIDER '{settings.ai_provider}'. Supported: gemini.")


@lru_cache
def get_ai_client() -> AIClient:
    """One shared client for the whole app, so the rate limit covers every user and job."""
    settings = get_settings()
    return AIClient(build_provider(settings), settings.ai_requests_per_minute)
