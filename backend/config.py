from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend configuration, loaded from environment variables / backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str = ""

    cors_origins: str = "http://localhost:5173"

    ai_provider: str = "gemini"
    ai_api_key: str = ""
    ai_model: str = ""
    ai_requests_per_minute: int = 12  # keep below your model's free-tier limit

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
