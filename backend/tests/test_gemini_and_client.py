import asyncio
import json

import httpx
import pytest

from services.ai import client as client_module
from services.ai import gemini
from services.ai.client import AIClient
from services.ai.gemini import GeminiProvider
from services.errors import (
    AIBlockedError, AIConfigError, AIError, AIQuotaError, AIRateLimitError, AITransientError,
)
from tests.fakes import FakeProvider


def run(coro):
    return asyncio.run(coro)


REAL_CLIENT = httpx.AsyncClient  # captured once, so patching twice in one test can't stack


def mock_gemini(monkeypatch, handler):
    def factory(*a, **kw):
        kw["transport"] = httpx.MockTransport(handler)
        return REAL_CLIENT(*a, **kw)

    monkeypatch.setattr(gemini.httpx, "AsyncClient", factory)


def ok(text='{"ok": true}'):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}]})


def provider():
    return GeminiProvider("secret-key", "models/gemini-test-lite")


def test_request_shape_and_success(monkeypatch):
    seen = {}

    def handler(req: httpx.Request):
        seen["url"] = str(req.url)
        seen["key"] = req.headers["x-goog-api-key"]
        seen["body"] = json.loads(req.content)
        return ok('{"flashcards": []}')

    mock_gemini(monkeypatch, handler)
    assert run(provider().generate_json("sys", "hello", 500)) == '{"flashcards": []}'
    assert seen["url"].endswith("/models/gemini-test-lite:generateContent")
    assert "secret-key" not in seen["url"] and seen["key"] == "secret-key"
    body = seen["body"]
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert body["generationConfig"]["maxOutputTokens"] == 500
    assert body["systemInstruction"]["parts"][0]["text"] == "sys"
    assert body["contents"][0]["parts"][0]["text"] == "hello"


def test_thought_parts_are_skipped(monkeypatch):
    resp = httpx.Response(200, json={"candidates": [{"content": {"parts": [
        {"text": "thinking...", "thought": True}, {"text": '{"a": 1}'}]}}]})
    mock_gemini(monkeypatch, lambda req: resp)
    assert run(provider().generate_json("s", "p")) == '{"a": 1}'


@pytest.mark.parametrize(
    "response,error",
    [
        (httpx.Response(429, json={"error": {"message": "slow down"}}), AIRateLimitError),
        (httpx.Response(429, text="Quota exceeded: GenerateRequestsPerDayPerProjectPerModel-FreeTier"), AIQuotaError),
        (httpx.Response(403, json={"error": {"message": "nope"}}), AIConfigError),
        (httpx.Response(404, json={"error": {"message": "nope"}}), AIConfigError),
        (httpx.Response(400, json={"error": {"message": "bad field"}}), AIConfigError),
        (httpx.Response(503, text="down"), AITransientError),
        (httpx.Response(418, text="teapot"), AIError),
        (httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}}), AIBlockedError),
        (httpx.Response(200, json={"candidates": []}), AITransientError),
        (httpx.Response(200, json={"candidates": [{"finishReason": "SAFETY"}]}), AIBlockedError),
    ],
)
def test_error_mapping(monkeypatch, response, error):
    mock_gemini(monkeypatch, lambda req: response)
    with pytest.raises(error):
        run(provider().generate_json("s", "p"))


def test_retry_delay_is_read_from_header_or_body(monkeypatch):
    mock_gemini(monkeypatch, lambda req: httpx.Response(429, headers={"retry-after": "7"}, text="x"))
    with pytest.raises(AIRateLimitError) as e:
        run(provider().generate_json("s", "p"))
    assert e.value.retry_after == 7
    body = '{"error": {"details": [{"retryDelay": "12s"}]}}'
    mock_gemini(monkeypatch, lambda req: httpx.Response(429, text=body))
    with pytest.raises(AIRateLimitError) as e:
        run(provider().generate_json("s", "p"))
    assert e.value.retry_after == 12


def test_timeouts_and_network_errors_are_transient(monkeypatch):
    def boom(req):
        raise httpx.ReadTimeout("slow")

    mock_gemini(monkeypatch, boom)
    with pytest.raises(AITransientError):
        run(provider().generate_json("s", "p"))


def test_missing_key_or_model_is_a_config_error():
    with pytest.raises(AIConfigError):
        GeminiProvider("", "m")
    with pytest.raises(AIConfigError):
        GeminiProvider("k", "")


# ---- AIClient: throttling and retries (fake clock and sleep, so the tests are instant) ----

class Clock:
    def __init__(self):
        self.now, self.sleeps = 1000.0, []

    def time(self):
        return self.now

    async def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


def make_client(replies, rpm=12, attempts=4):
    clock = Clock()
    return AIClient(FakeProvider(replies), rpm, attempts, sleep=clock.sleep, clock=clock.time), clock


def test_throttle_spaces_requests():
    client, clock = make_client(["{}", "{}", "{}"], rpm=12)  # one every 5 seconds
    for _ in range(3):
        run(client.generate_json("s", "p"))
    assert clock.sleeps == [5.0, 5.0]


def test_rate_limit_waits_the_advised_time_then_succeeds():
    client, clock = make_client([AIRateLimitError("busy", retry_after=9), "{}"])
    assert run(client.generate_json("s", "p")) == "{}"
    assert 9 in clock.sleeps


def test_transient_errors_back_off_then_give_up():
    client, clock = make_client([AITransientError("x")] * 3, attempts=3)
    with pytest.raises(AITransientError):
        run(client.generate_json("s", "p"))
    assert len(client.provider.prompts) == 3


@pytest.mark.parametrize("error", [AIQuotaError("daily"), AIConfigError("key"), AIBlockedError("safety")])
def test_non_retryable_errors_are_raised_immediately(error):
    client, _ = make_client([error, "{}"])
    with pytest.raises(type(error)):
        run(client.generate_json("s", "p"))
    assert len(client.provider.prompts) == 1


def test_wait_is_capped():
    client, clock = make_client([AIRateLimitError("busy", retry_after=9999), "{}"])
    run(client.generate_json("s", "p"))
    assert max(clock.sleeps) <= client_module.MAX_WAIT_SECONDS
