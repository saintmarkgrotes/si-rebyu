# si-rebyu backend (FastAPI)

Handles document processing (PDF/DOCX/PPTX extraction and chunking) and AI generation (Gemini).
Everything else in the app talks to Supabase directly from the frontend; this service exists so the
Gemini API key and the document-processing pipeline never run in the browser.

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                                    # fill in SUPABASE_URL, SUPABASE_ANON_KEY, AI_API_KEY, AI_MODEL
uvicorn main:app --reload --port 8000
```

Then run the React app (`npm run dev` in the repo root) in another terminal. Vite proxies `/api` to
port 8000 in dev.

## Test

```bash
python -m pytest
```

190 tests, no live Supabase or Gemini connection needed — everything is mocked or run against a fake
AI provider.

## Important: run with exactly one worker

The AI rate limiter (`services/ai/client.py`) and the auth-token cache (`auth.py`) are both
in-process state, shared across every request within a single Python process. If this service is
ever run with more than one worker process, each worker gets its own independent rate limiter — so
the configured requests-per-minute limit effectively multiplies by the worker count, which can blow
past your AI provider's real rate limit under load.

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1
```

If this ever needs to scale beyond one process, the rate limiter needs to move to a shared store
(Redis, for example) before adding workers — don't just raise the worker count.

## Dependencies

`requirements.txt` is pinned to exact versions, verified against the full test suite. Bump
deliberately (change the file, reinstall, rerun the tests) rather than letting a fresh install pull
whatever is newest at deploy time.

## Deploying

A `Dockerfile` is included for hosts that want a container (Railway, Fly.io, self-hosting). It has
not been verified with an actual `docker build` — review it before relying on it. For Render
specifically, its native Python runtime is simpler and doesn't need Docker at all: see
`../DEPLOYMENT.md` for the exact build and start commands.
