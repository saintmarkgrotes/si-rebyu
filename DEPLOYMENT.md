# Deploying si-rebyu

Three pieces, hosted separately: the frontend (static), the backend (FastAPI), and the database
(Supabase, already hosted). This walks through a $0/month setup using Render's free tier for the
backend and Vercel's free tier for the frontend, both deploying automatically from GitHub.

## 1. Backend — Render

1. [render.com](https://render.com) → **New** → **Web Service** → connect your GitHub repo.
2. **Root Directory:** `backend`
3. **Runtime:** Python 3
   Also add the environment variable `PYTHON_VERSION` = `3.12.3` (step 7 below) — the version this
   code was tested on. Render's default Python version changes over time.
4. **Build Command:** `pip install -r requirements.txt`
5. **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1`

   The `--workers 1` is required, not optional — see `backend/README.md` for why.
6. **Instance Type:** Free, to start.
7. Add these environment variables (from `backend/.env.example`):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` — from your Supabase project's API settings.
   - `SUPABASE_SERVICE_KEY` — leave blank. The backend never uses it.
   - `CORS_ORIGINS` — set to `http://localhost:5173` for now; you'll update this in step 3.
   - `AI_PROVIDER=gemini`, `AI_API_KEY`, `AI_MODEL` — your Gemini key and model name.
   - `AI_REQUESTS_PER_MINUTE=12`
   - `PYTHON_VERSION=3.12.3`
8. Deploy. Once live, copy the service URL (`https://your-service.onrender.com`) and check
   `https://your-service.onrender.com/api/health` returns `{"status":"ok",...}`.

A Dockerfile is also included in `backend/` for hosts that want a container (Railway, Fly.io). It
hasn't been verified with an actual build — Render's native Python path above is the tested one.

## 2. Frontend — Vercel

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → import the same GitHub repo.
2. Framework preset: Vite (should auto-detect). Leave the root directory as the repo root, build
   command `npm run build`, and output directory `dist` — all defaults. The `vercel.json` in the repo
   makes every path serve the app, so refreshing on `/dashboard` or opening a bookmarked link works.
3. Add these environment variables (from `.env.example`):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — same values as the backend's.
   - `VITE_API_URL` — the Render URL from step 1 (origin only: no `/api`, trailing slash is ignored).
4. Deploy. Copy the resulting URL (`https://your-app.vercel.app`).

## 3. Connect them

1. Back on Render: update `CORS_ORIGINS` to your real Vercel URL (no trailing slash), and let it
   redeploy.
2. In Supabase: **Authentication → URL Configuration → Site URL**, set to your Vercel URL. This
   doesn't block anything today (there's no password-reset flow yet), but any future email-based
   auth flow will depend on it being correct.
3. Open your Vercel URL and confirm the app loads and `/api/health` behind it responds (check the
   browser's network tab on first load, or just try logging in).

## 4. Confirm the database is current

In the Supabase SQL editor, confirm the migration in `supabase/migrations/` has been applied:

```sql
select count(*) from pg_tables where schemaname = 'public' and tablename = 'study_sets';
```

Should return `1`. If it returns `0`, run `supabase/migrations/0001_study_schema.sql` first.

## 5. Create an account

No public sign-up page exists yet (by design, for now — see below). Create accounts directly:

**Supabase Dashboard → Authentication → Users → Add user.** Enter the email and a password, and
check **Auto Confirm User** so no confirmation email is needed. Share the credentials with them
directly.

## Costs, realistically

Everything above is $0/month: Render free, Vercel free (Hobby), Supabase free, Gemini free.

The one real cost of staying free: Render's free web service spins down after 15 minutes idle and
takes about a minute to wake on the next request. The frontend already shows a "waking up" message
for this (built in Phase 2). For a single person studying occasionally, this is a minor annoyance,
not a dealbreaker. Render's $7/month Starter tier removes it entirely — worth it once you know
everything works and want a smoother experience for someone who'll actually depend on it.

**Supabase's free plan pauses a project after a week with no activity.** Your data is kept, but the
app stops working until you open the Supabase dashboard and click **Restore project**. Worth knowing
before an exam break. Supabase Pro ($25/month) removes the pause.

Gemini's free tier (whichever model you're on) is a shared daily quota across every user of the app,
not per-person. Fine for one or a few people; worth monitoring before opening this up more broadly.

## Before opening this up to more people

- **A public sign-up page.** Right now, accounts only exist if created manually in the Supabase
  dashboard, which doesn't scale past a handful of people. `AuthContext.jsx` already has a `signup`
  function; there's just no page that calls it yet.
- **Reconsider the AI quota.** More users means the shared daily Gemini limit gets reached faster.
  A paid tier or per-user usage limits become worth it at that point.
- **A privacy policy.** Worth having before strangers upload real documents through a third-party
  AI provider, separately from the two people this is built for right now.
