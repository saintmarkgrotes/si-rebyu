import re

import httpx

from services.ai.base import AIProvider
from services.errors import (
    AIBlockedError,
    AIConfigError,
    AIError,
    AIQuotaError,
    AIRateLimitError,
    AITransientError,
)

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_BLOCKED_FINISH = {"SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"}


class GeminiProvider(AIProvider):
    def __init__(self, api_key: str, model: str, timeout: float = 90.0, temperature: float = 0.4):
        if not api_key:
            raise AIConfigError("AI_API_KEY is not set in backend/.env.")
        if not model:
            raise AIConfigError("AI_MODEL is not set in backend/.env. Run scripts/ai_check.py --list to see options.")
        self.api_key = api_key
        self.model = model.removeprefix("models/")
        self.timeout = timeout
        self.temperature = temperature

    async def generate_json(self, system: str, prompt: str, max_output_tokens: int = 8192) -> str:
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": self.temperature,
                "maxOutputTokens": max_output_tokens,
                "responseMimeType": "application/json",
            },
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{BASE_URL}/models/{self.model}:generateContent",
                    headers={"x-goog-api-key": self.api_key, "Content-Type": "application/json"},
                    json=body,
                )
        except httpx.TimeoutException:
            raise AITransientError("The AI service took too long to respond.")
        except httpx.HTTPError:
            raise AITransientError("Could not reach the AI service.")
        return self._read(resp)

    def _read(self, resp: httpx.Response) -> str:
        code = resp.status_code
        if code == 200:
            return self._extract_text(resp.json())
        detail = self._api_message(resp)
        if code == 429:
            low = resp.text.lower()
            if "perday" in low or "per day" in low or "daily" in low:
                raise AIQuotaError("The AI daily limit has been reached. Try again tomorrow.")
            raise AIRateLimitError("The AI service is busy (rate limit).", self._retry_after(resp))
        if code in (401, 403):
            raise AIConfigError("The AI key is invalid or not allowed to use this model.")
        if code == 404:
            raise AIConfigError(f"The model '{self.model}' was not found. Run scripts/ai_check.py --list.")
        if code == 400:
            raise AIConfigError(f"The AI service rejected the request: {detail}")
        if code >= 500:
            raise AITransientError("The AI service had a temporary problem.")
        raise AIError(f"Unexpected AI service response ({code}).")

    @staticmethod
    def _extract_text(data: dict) -> str:
        block = (data.get("promptFeedback") or {}).get("blockReason")
        if block:
            raise AIBlockedError("The AI service could not process this part of the document.")
        candidates = data.get("candidates") or []
        if not candidates:
            raise AITransientError("The AI service returned an empty reply.")
        cand = candidates[0]
        parts = (cand.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        if not text.strip():
            if cand.get("finishReason") in _BLOCKED_FINISH:
                raise AIBlockedError("The AI service could not process this part of the document.")
            raise AITransientError("The AI service returned an empty reply.")
        return text

    @staticmethod
    def _api_message(resp: httpx.Response) -> str:
        try:
            return str(resp.json()["error"]["message"])[:200]
        except Exception:
            return "unknown error"

    @staticmethod
    def _retry_after(resp: httpx.Response) -> float | None:
        header = resp.headers.get("retry-after")
        if header:
            try:
                return float(header)
            except ValueError:
                pass
        m = re.search(r'"retryDelay":\s*"(\d+(?:\.\d+)?)s"', resp.text)
        return float(m.group(1)) if m else None
