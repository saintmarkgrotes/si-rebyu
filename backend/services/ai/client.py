"""Rate limiting and retries around any AIProvider.

One shared instance guards the whole app, because free-tier quotas are per project, not per user.
"""
import asyncio
import time
from collections.abc import Awaitable, Callable

from services.ai.base import AIProvider
from services.errors import AIRateLimitError, AITransientError

MAX_WAIT_SECONDS = 60


class AIClient:
    def __init__(
        self,
        provider: AIProvider,
        requests_per_minute: int = 12,
        max_attempts: int = 4,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.provider = provider
        self.min_interval = 60.0 / max(1, requests_per_minute)
        self.max_attempts = max_attempts
        self._sleep = sleep
        self._clock = clock
        self._lock = asyncio.Lock()
        self._last_call: float | None = None

    async def _throttle(self) -> None:
        async with self._lock:  # serialises callers so the spacing holds across users/jobs
            if self._last_call is not None:
                wait = self._last_call + self.min_interval - self._clock()
                if wait > 0:
                    await self._sleep(wait)
            self._last_call = self._clock()

    async def generate_json(self, system: str, prompt: str, max_output_tokens: int = 8192) -> str:
        for attempt in range(1, self.max_attempts + 1):
            await self._throttle()
            try:
                return await self.provider.generate_json(system, prompt, max_output_tokens)
            except AIRateLimitError as err:
                if attempt == self.max_attempts:
                    raise
                await self._sleep(min(err.retry_after or 2**attempt * 2, MAX_WAIT_SECONDS))
            except AITransientError:
                if attempt == self.max_attempts:
                    raise
                await self._sleep(2**attempt)
            # AIQuotaError, AIConfigError and AIBlockedError are not retried: they propagate immediately.
        raise AssertionError("unreachable")
