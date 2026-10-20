# TraceFlow — session handoff / agent notes

_Last updated: 2026-10-20._

## Where things are

- **Active repo:** `/home/sassi/Desktop/traceflow-pilot`
  - `origin` = `https://github.com/MindScript-IT/traceflow-pilot.git` (**READ-only** for this account)
  - `fork` = `git@github.com:sassihamdi-CD/traceflow-pilot.git` (**write**; `master` is current)
- **Old repo:** `/home/sassi/Desktop/tracflow` — do not edit; it is an unrelated earlier snapshot.
- **User repo (all work pushed):** https://github.com/sassihamdi-CD/traceflow-pilot
  - `master` = `b752f43` (plus any later commits)
- **Organization PR:** https://github.com/MindScript-IT/traceflow-pilot/pull/2
  - Contains 3 commits: review fixes, gated demo mode, README summary.
  - Direct push to the org repo is blocked (`permissions.push=false`); use the fork + PR.
- **Latest commits:**
  - `b752f43` Document the pilot hardening fixes in the README
  - `3d706e1` Add gated local demo mode for full-flow testing
  - `a0630a6` Fix pilot extraction/passport integrity and deployment health
  - base: `f805160`

## What was delivered

A senior review of passport mode + document upload/extraction, with fixes:

- Removed Next.js direct-DB routes (founder/invites/auth); all writes go through FastAPI.
- Founder page uses server-only `X-Founder-Key`.
- Seat-safe invite redemption; uniqueness races return `409 conflict`.
- Exactly one verified value per product/field, enforced in routes and by
  `migrations/019_one_verified_per_field.sql`.
- Public passport exposes verified evidence only; verified `product_name`/`sku`
  override product columns.
- PDF page refs normalized; CSV encodings (UTF-8/Windows-1252) and delimiters
  (`;`, tab, pipe); integral XLSX floats; dedupe/caps.
- Full per-document transcription for PDFs and spreadsheets.
- Retry failed documents; worker stale-job recovery + partial-proposal cleanup;
  storage/queue errors map to 502/503; orphan upload cleanup.
- Anthropic 429/5xx/network retries; `temperature=0`.
- SSR uses `API_URL_INTERNAL`; localized passport metadata and 404.
- Web/worker healthchecks fixed; app-role grants + append-only audit triggers.
- `.env.example` fixed (seeded workspace UUID, clean values, Company B vars).

Full findings + residual risks: `docs/PILOT_REVIEW.md`.
Local browser testing: `docs/LOCAL_TESTING.md`.
README has a **"Pilot hardening: what was fixed"** section.

## Local runtime (demo mode, currently used for browser testing)

- API `http://localhost:8010`, web `http://localhost:3010`
  (ports 8000/3000 were taken by older stacks).
- Services: `api`, `db`, `web`, `worker`, one-shot `migrate`.
- Start/check:
  ```bash
  docker compose up -d --build
  docker compose ps
  curl -s localhost:8010/ready
  ```
- The local `.env` (git-ignored) has:
  - `DEMO_MODE=true`
  - `DEMO_STORAGE_DIR=/srv/app/uploads`
  - `NEXT_PUBLIC_DEMO_MODE=true`
  - placeholder Supabase/Anthropic/R2 keys
- Demo mode bypasses only the adapters: Supabase auth -> fixed `demo-reviewer`,
  R2 -> shared `uploads` volume, Anthropic -> deterministic label/value
  extraction. The real flow (upload -> queue -> worker -> field_values ->
  review -> publish -> passport) is unchanged.
- **Never enable demo mode in production.** To run with real keys:
  1. Set `DEMO_MODE=false` and `NEXT_PUBLIC_DEMO_MODE=false`.
  2. Fill `SUPABASE_*`, `ANTHROPIC_API_KEY`, `R2_*`, `DB_APP_PASSWORD`,
     `FOUNDER_KEY`.
  3. Rebuild web (`docker compose up -d --build`) — `NEXT_PUBLIC_*` is baked.

### Test data created locally

- `DEMO-001` / "Demo Trail Runner" — verified, unpublished.
- `DEMO-PDF` / "Demo PDF Sandal" — published; passport slug `5sbxdCsURdhO`.
- `DEMO-REVIEW` / "Demo Review Sneaker" — 7 proposed values in the review queue.
- `DEMO-UI` / "Demo UI Boot" — empty, for testing uploads.
- Sample uploads: `samples/demo-shoe.csv`, `.xlsx`, `.pdf`.
- Passport: http://localhost:3010/passport/5sbxdCsURdhO

## Verification

- `pytest -q` -> **127 passed, 2 skipped**.
- `docker compose ps` -> api/db/web healthy, worker up.
- CSV, XLSX and PDF uploads exercised end-to-end through the worker, review,
  publish and public passport.
- Not yet exercised: real Anthropic extraction, real R2 round-trip, real
  Supabase sign-in (local keys are placeholders).

## Next steps

1. Review/merge PR #2 (or grant write access for direct org pushes).
2. Run one real-key pass: Supabase login, R2 upload, Anthropic extraction.
3. Address residual risks listed in `docs/PILOT_REVIEW.md` (invite entropy,
   unpublish, rate limiting, PDF page-count validation, multi-worker leases,
   Supabase bootstrap ordering).

## Conventions / gotchas

- Python venv: `.venv`; tests: `.venv/bin/python -m pytest -q`.
- Do **not** commit `.env` or any secret; `.env.example` has placeholders only.
- Old port-clash stacks may still be running; use 8010/3010 for this project.
- `TRUNCATE audit_log` is blocked by design (append-only triggers).
- `docker compose up` uses the local `.env`; changing `NEXT_PUBLIC_*` requires
  a web rebuild.
