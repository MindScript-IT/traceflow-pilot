# TraceFlow API (FastAPI)

Pilot backend for TraceFlow AI. See repo root `migrations/` and `.env.example`.

## Pilot hardening: what was fixed

A senior review of the pilot (passport mode + document upload/extraction) is
recorded in [`docs/PILOT_REVIEW.md`](docs/PILOT_REVIEW.md), with severity,
file references, verification commands and residual risks. Summary:

**Security and access**
- Removed the Next.js routes that talked to Postgres directly (invites,
  founder, auth helpers); all writes now go through the FastAPI backend.
- Founder page uses the server-only `X-Founder-Key`; no key is shipped to
  the browser bundle.
- Invite redemption is seat-safe: re-redeeming as the same user is a no-op
  and never burns another seat.
- Uniqueness races now return `409 conflict` instead of a 500.

**Data integrity**
- Exactly one verified value per product/field is enforced in the routes
  *and* by a partial unique index (`019_one_verified_per_field.sql`).
  Accept/correct/resolve/bulk-accept supersede the previous verified row.
- Public passports expose verified evidence only, and verified
  `product_name`/`sku` override the product columns.
- Extraction normalizes `p. 3` / `pag. 4-5` / `pagina 7` to `Page 3` /
  `Page 4-5`, handles UTF-8/Windows-1252 CSVs, semicolon/tab/pipe
  delimiters, integral XLSX floats, duplicate items and table caps.
- Uploads/transcripts keep every labeled value (PDF and spreadsheets), not
  just the 7 passport fields; empty/failed extractions are retried cleanly.

**Reliability**
- Failed documents have a reviewer-visible **Retry** action
  (`POST /api/documents/{id}/retry`) with a `not_retryable` guard.
- The worker recovers stale `running` jobs, rolls back before writing a
  failure, and only skips a document when it is genuinely `done` with
  values (partial proposals are deleted and re-extracted).
- R2/queue failures map to `502 storage_unavailable` /
  `503 queue_unavailable`; a failed DB write removes the orphan object.
- Anthropic 429/5xx/network errors retry with backoff; extraction is
  deterministic (`temperature=0`).

**Passport and deployment**
- Server-side rendering reaches the API over `API_URL_INTERNAL`, so the
  public passport works inside Docker.
- Localized passport metadata + a branded, localized 404 page.
- Web and worker healthchecks fixed; app-role grants and append-only audit
  triggers added (`018_app_role_grants.sql`).
- `.env.example` now ships the seeded workspace UUID, clean values, and
  documented Company B variables.

**Local demo mode** (off by default, never for production)
- `DEMO_MODE=true` / `NEXT_PUBLIC_DEMO_MODE=true` bypasses Supabase, R2 and
  Anthropic so the full upload -> worker -> review -> publish -> passport
  flow can be tested without credentials. See
  [`docs/LOCAL_TESTING.md`](docs/LOCAL_TESTING.md) and the sample
  declarations in `samples/`.

**Verification**: `pytest -q` -> 127 passed, 2 skipped; `docker compose ps`
all healthy; CSV, XLSX and PDF uploads exercised end-to-end through the
worker, review, publish and public passport.


## Founder clone-and-run on Windows (one command, PowerShell)

```powershell
git clone <repo-url> tracflow; cd tracflow
.\pilot-windows.bat
```

(Or double-click `pilot-windows.bat` in Explorer.) The launcher updates
itself from GitHub, installs Python 3.12 via winget if missing, then runs
`pilot-windows.py` — pure-stdlib Python, so there is no PowerShell parsing
involved at all. If anything fails, run the no-change diagnosis and send
its output: `py pilot-windows.py --check`.

> NOTE: in PowerShell, `&` does NOT chain commands (use `;`) and local
> scripts need the `.\` prefix — that is why bare `pilot-windows.bat`
> fails with "command not found".

The script automates everything: detects x64/ARM64, installs missing
prerequisites (Git, Python 3.12, Docker Desktop via winget), creates `.env`
from `.env.example` with a random local `DB_APP_PASSWORD`, bridges your
backend keys into the frontend build args, kills any stale process on the
pilot ports, runs `docker compose up --build` (**backend API + Postgres +
worker + Next.js console — Docker installs everything, no local Node
needed**), waits for `/health` + `/ready` + the web console, and opens the
pilot console in the browser (`http://localhost:3000`).

Options: `-Port 8001` (use another port), `-NoDocker` (venv + uvicorn,
no containers), `-NoBrowser` (don't auto-open the browser), `-Rebuild`
(force image rebuild), `-EnvFile "C:\Users\you\Downloads\.env"` (import a
`.env` file you received privately). Without Docker it falls back to a local
venv automatically (asks before installing Docker Desktop).

### Real keys (Supabase / Anthropic / R2) — read this

The repo only contains `.env.example` **placeholders** — the real keys live
in your private `.env`, which is git-ignored and must NEVER be committed
(anyone with your `ANTHROPIC_API_KEY` can burn your budget).
To give your friend the full pilot (login + AI extraction + file storage):

1. Send YOUR backend `.env` file privately (WhatsApp / Signal / encrypted mail).
2. Append your `tracflow-web/.env.local` lines (the 4 `NEXT_PUBLIC_*` values)
   to that same file — or let the script bridge `SUPABASE_*` automatically
   (it copies them into `NEXT_PUBLIC_*`; only the invite code then stays
   placeholder unless provided).
3. Friend saves it anywhere, e.g. `Downloads\.env`, then runs:
   `.\pilot-windows.bat -EnvFile "$env:USERPROFILE\Downloads\.env"`
   (or copies it to `.env` in the repo root manually).
4. After ANY key change: re-run with `-Rebuild` (or
   `docker compose up --build`) — `NEXT_PUBLIC_*` values are baked into the
   web image at build time.
5. Without real keys the pilot still runs in the browser (console landing +
   `/passport`, API `/docs`, `/health`, `/ready` all work on local
   Postgres) — only login-gated routes (need `SUPABASE_*`), AI extraction
   (needs `ANTHROPIC_API_KEY`) and uploads (need `R2_*`) stay disabled. The
   script prints exactly which keys are real vs placeholder on every run.

## Founder clone-and-run on Linux/macOS (Docker, recommended)

```bash
git clone <repo-url> tracflow && cd tracflow
cp .env.example .env   # fill SUPABASE_*, ANTHROPIC_API_KEY, DB_APP_PASSWORD
docker compose up --build
curl localhost:8000/health   # expect {"ok": true}
curl localhost:8000/ready    # expect {"ok": true, "db": "up"}
```

Services: `api` (FastAPI), `worker` (extraction queue), `db` (Postgres 16),
`migrate` (one-shot `scripts/migrate.sh`), `web` (Next.js pilot console on
`${WEB_PORT:-3000}`, built from `./web` — needs no local Node).

### Wrong app on localhost? (port clash)

If `http://localhost:3000` shows another app (e.g. Twenty CRM), that port is
taken — TraceFlow never got it. Move the console: set `WEB_PORT=3001` in
`.env`, re-run `docker compose up --build -d`, and open
`http://localhost:3001`. Same for the API: if `:8000` is taken, set
`PORT=8001` in `.env` **and** `NEXT_PUBLIC_API_URL=http://localhost:8001`,
then rebuild (`NEXT_PUBLIC_*` values bake into the web image at build
time). The Windows script (`pilot-windows.bat`) detects and kills stale
processes on both ports automatically.

## Quickstart (no keys needed for unit tests)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

Windows (PowerShell) equivalent:

```powershell
py -3 -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -q
# local run without Docker: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-local.ps1
```

## With keys (Phase 1 auth setup)

Copy `.env.example` to `.env` and fill `DATABASE_URL`, `SUPABASE_*`,
`WORKSPACE_ID`, `R2_*`, `ANTHROPIC_API_KEY`. Then:

```bash
psql $DATABASE_URL -f migrations/001_schema.sql
psql $DATABASE_URL -f migrations/002_seed_footwear.sql
# edit role name in 003_audit_grants.sql, apply, then run the manual
# failed-UPDATE check documented in that file
uvicorn app.main:app --reload
```

## Corrections applied (v2)

1. Extraction branches by file type: PDF native to Claude, XLSX via
   openpyxl (real `Sheet / Cell` coordinates), CSV via pandas, unknown
   types rejected 415 at upload.
2. No pgvector in `001_schema.sql`.
3. `WORKSPACE_ID` env constant in `app/config.py`, used by `app/auth.py`;
   no user->workspace lookup table.
