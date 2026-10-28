# si-rebyu

An AI-powered study platform. Upload a PDF, Word, or PowerPoint document and generate flashcards and
quiz questions from it with Gemini, then study with spaced repetition (SM-2) and track your progress
over time.

## How it's built

- **Frontend:** React + Vite, Supabase for auth/database/storage, Tailwind for styling.
- **Backend:** FastAPI (Python), responsible only for document processing and AI generation — the
  AI key never touches the browser. Everything else (reading data, flashcards, quizzes) talks to
  Supabase directly from the frontend, protected by Row Level Security.
- **Database:** PostgreSQL via Supabase, with migrations in `supabase/migrations/`.

## Run it locally

You'll need a Supabase project and a Gemini API key. See `.env.example` (frontend) and
`backend/.env.example` (backend) for what to set, and `backend/README.md` for backend-specific
setup and testing.

```bash
# frontend
cp .env.example .env.local   # fill in your Supabase project's URL and anon key
npm install
npm run dev

# backend (separate terminal)
cd backend
cp .env.example .env         # fill in Supabase + Gemini values
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn main:app --reload --port 8000
```

Vite proxies `/api` to `localhost:8000` in dev, so both need to be running together.

## Test

```bash
npm run lint
npm test                               # frontend and database tests
npm run build
cd backend && python -m pytest         # backend tests; deprecations fail the suite
```

## Dependency maintenance

Dependabot checks npm, Python, and GitHub Actions dependencies weekly on Monday at 09:00
Asia/Manila once `.github/dependabot.yml` reaches the default branch. It opens reviewable
update PRs; updates are not automatically merged. Compatible npm and Python updates are grouped,
and CI runs lint, tests, builds, and an npm audit before review. Backend CI covers Python 3.12 and 3.14.

Use `npm ci` for reproducible frontend installs. For manual updates, run `npm outdated` and
`npm update --save`, then the checks above. Update the pinned backend requirement versions,
reinstall `backend/requirements-dev.txt`, and run `python -m pip check` plus the backend tests.

The remaining low-severity npm advisory is in development-only shadcn tooling's `deepmerge`
dependency ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4));
as of October 28, 2026, no patched release is available. Keep tracking the upstream fix.
CI fails on moderate or higher advisories, and `npm audit --omit=dev` checks production packages.

## Deploying

See `DEPLOYMENT.md` for the full walkthrough: hosting the backend, hosting the frontend, and
connecting them to a production Supabase project.
