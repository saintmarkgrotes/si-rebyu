"""Check your Gemini key and model. Run from the backend folder:

    .venv\\Scripts\\python.exe scripts\\ai_check.py --list    # models your key can use (copy one into AI_MODEL)
    .venv\\Scripts\\python.exe scripts\\ai_check.py           # send one tiny test request
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from config import get_settings  # noqa: E402
from services.ai import build_provider  # noqa: E402
from services.ai.gemini import BASE_URL  # noqa: E402
from services.errors import AIError  # noqa: E402


def list_models(api_key: str) -> int:
    resp = httpx.get(f"{BASE_URL}/models", params={"pageSize": 200}, headers={"x-goog-api-key": api_key}, timeout=30)
    if resp.status_code != 200:
        print(f"Could not list models (HTTP {resp.status_code}). Check AI_API_KEY in backend/.env.")
        return 1
    rows = [
        m["name"].removeprefix("models/")
        for m in resp.json().get("models", [])
        if "generateContent" in m.get("supportedGenerationMethods", []) and "flash" in m["name"].lower()
    ]
    print("Flash models your key can call (copy one into AI_MODEL in backend/.env):\n")
    for name in sorted(rows):
        print(f"  {name}")
    print("\nPick a *lite* model with a high requests-per-day limit in your AI Studio dashboard.")
    return 0


async def ping() -> int:
    settings = get_settings()
    try:
        provider = build_provider(settings)
        reply = await provider.generate_json(
            "Reply with JSON only.", 'Return exactly {"ok": true, "word": "ready"}', max_output_tokens=200
        )
    except AIError as err:
        print(f"FAILED: {err}")
        return 1
    print(f"OK. Provider {settings.ai_provider}, model {settings.ai_model}.\nReply: {reply.strip()}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="list models available to your key")
    args = parser.parse_args()
    settings = get_settings()
    if args.list:
        if not settings.ai_api_key:
            print("AI_API_KEY is empty in backend/.env.")
            return 1
        return list_models(settings.ai_api_key)
    return asyncio.run(ping())


if __name__ == "__main__":
    raise SystemExit(main())
