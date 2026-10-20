# TraceFlow pilot — backend review (passport + extraction)

Date: 2026-10-19
Scope: `app/` (FastAPI backend), `scripts/worker.py`, migrations, and the
Next.js surfaces that touch passport, invites, and document upload.
Environment: local Docker stack (`api :8010`, `web :3010`, Postgres 16).

## Verdict

The core design is sound: PostgreSQL is the source of truth, extraction only
writes `proposed` values, reviewers make every acceptance decision, and the
public passport is a separate unauthenticated route that filters on
`status IN ('accepted','corrected')` in SQL.

The pilot blockers were not architectural. They were **failure-path and
data-fidelity defects**: storage/queue errors that left documents stuck,
a parser that corrupted Italian CSV/XLSX values, page references that were
silently dropped, a passport page that rendered duplicate/stale identity,
and migrations that granted the wrong role. Those are fixed below; the
remaining gaps are listed under **Residual risks**.

## Fixed findings

| ID | Severity | Finding | Fix / evidence |
|----|----------|---------|----------------|
| SEC-01 | High | The web container received `DATABASE_URL`, and deleted Next.js invite/founder/auth routes opened the database directly with it. | Web no longer gets DB credentials; all such routes were deleted. Browser calls go to FastAPI with `X-Founder-Key` or a Bearer token. `docker-compose.yml:71-75` |
| SEC-02 | High | Migrations 004/007/008/009/011/012/015 granted newer tables to `CURRENT_USER`, so on Supabase the app role had no rights (Docker hid it because `POSTGRES_USER == traceflow_app`). | Added `migrations/018_app_role_grants.sql` (idempotent grants for every app table) and corrected the individual migrations. `scripts/migrate.sh` runs 018. |
| SEC-03 | High | `audit_log` append-only was grant-only; the table owner could `UPDATE`, `DELETE`, or `TRUNCATE` history. | `audit_log_append_only` row trigger + `audit_log_no_truncate` statement trigger. Verified locally: both operations raise. `migrations/018_app_role_grants.sql:36-59` |
| DATA-01 | High | Accepting a new value did not reject the previously verified one. Historic duplicates could reach the passport. | `_reject_verified()` rejects prior verified rows and records `supersedes_id` for accept/correct/resolve/accept-all. `app/routes/fields.py:27` |
| DATA-02 | High | The review-queue bulk `accept-all` bypassed that rule (would have duplicated verified rows). | It now calls `_reject_verified()` and audits `superseded`. `app/routes/ops.py:48` |
| DATA-03 | High | Nothing stopped a future route or manual SQL from creating two verified rows. | Partial unique index on `(product_id, field_key)` for accepted/corrected rows, after collapsing historic duplicates. `migrations/019_one_verified_per_field.sql` |
| DATA-04 | High | CSV exports using `;`, Windows-1252, or Latin-1 were accepted by the upload gate and then failed extraction (`UnicodeDecodeError` / one-column frame). | `decode_csv_text()` + delimiter sniffing (`, ; \t |`). `app/services/extraction.py:157` |
| DATA-05 | High | `str()` on openpyxl floats turned SKU-like values (e.g. `12345`) into `12345.0`; dates became midnight datetimes. | `cell_text()` renders integral floats, ISO dates, and booleans without corruption. `app/services/extraction.py:121` |
| DATA-06 | High | PDF page references were only accepted as literal `Page N`; `p. 3` / `pag. 5` were nulled, losing evidence for correct values. | Normalizer accepts `page|p.|pag.|pagina`, ranges, and canonicalizes to `Page N` / `Page N-M`. `app/services/extraction.py:64` |
| DATA-07 | High | XLSX/CSV only produced the 7 passport-mapped fields; every other numeric/labeled detail was invisible. | Full table transcription: model path plus deterministic every-cell fallback. `app/services/document_items.py:150-212` |
| DATA-08 | High | A partial transcription could be committed, leaving a document "done" with only some items. | `store_document_items()` deletes then inserts inside a savepoint; the worker discards partial proposed rows before retrying. `app/services/document_items.py:264`, `scripts/worker.py:119-130` |
| REL-01 | High | A worker killed mid-run left `running`/`extracting` forever. | `recover_stale()` requeues after 15 min (fails after 3 attempts) and resets the document. `scripts/worker.py:221` |
| REL-02 | High | A failed R2 upload or `extraction_jobs` insert returned 500 and could leave an orphan object / a document stuck in `extracting`. | Storage and queue failures map to 502/503; the object is deleted if the DB write fails. `app/routes/products.py:274-310` |
| REL-03 | Medium | No way to retry a failed extraction without re-uploading. | `POST /api/documents/{id}/retry` (reviewer), guarded to `failed` documents, deletes only proposals/transcription, re-queues, audits. `app/routes/documents.py:87` |
| REL-04 | Medium | Anthropic rate limits / transient 5xx failed a whole document permanently. | `_create_with_retry()` (3 attempts, 1s/2s backoff, 429/5xx/network only) for mapping, full transcription, and party detection. `app/services/extraction.py:279` |
| REL-05 | Medium | `temperature` was non-zero: the same document could produce different proposals on retry. | `temperature=0` for every extraction call. |
| REL-06 | Medium | Two reviewers accepting the same field could hit the new unique index and return 500. | Global `UniqueViolation` handler maps uniqueness races to 409 `conflict`. `app/main.py` |
| PASSPORT-01 | High | The public passport page was a thin client; SSR inside Docker called `localhost` and failed, identity was incomplete, and 404/errors were unbranded. | Rewritten server component: `API_URL_INTERNAL` for SSR, localized copy, SKU/manufacturer/published chips, metadata, dedicated localized `not-found.tsx`, friendly unavailable state. `web/app/passport/[slug]/page.tsx` |
| PASSPORT-02 | High | The API returned a partial identity and could emit duplicate accepted rows. | Returns name/sku/manufacturer/category/published_at + `DISTINCT ON` newest verified per field. `app/routes/public.py:23-60` |
| PASSPORT-03 | Medium | The passport page could show the product row's name while a verified field said something else. | Verified `product_name`/`sku` override the product columns; the page hides those fields from the evidence list to avoid duplicate labels. `app/routes/public.py:48-58` |
| INVITE-01 | High | Re-redeeming a code incremented `used_count` again; concurrent redeems could exceed `max_uses`. | Membership `ON CONFLICT DO NOTHING RETURNING` + conditional seat UPDATE; existing members are a no-op. `app/routes/invites.py:79-122` |
| OPS-01 | Medium | The web healthcheck probed `localhost` (IPv6 `::1`) while Next listened on IPv4, so the container was permanently unhealthy; the worker inherited the API healthcheck and had no HTTP server. | Web probes `127.0.0.1:3000`; worker healthcheck is disabled. `web/Dockerfile`, `docker-compose*.yml` |
| CONFIG-01 | Medium | `.env.example` shipped the all-zero workspace UUID (every write → 409) and malformed example values (`R2_BUCKET` included a parenthetical). | Seeded UUID and clean values; `API_URL_INTERNAL` documented. `.env.example` |

## Verification performed

- `pytest -q` → **124 passed, 2 skipped**. New regression coverage:
  semicolon CSV, Windows-1252 CSV, XLSX integral floats, page-abbreviation
  normalization, item dedupe, table-transcription fallback.
- Docker rebuild applied migrations 018 and 019 successfully.
- `GET /ready` → `{"ok":true,"db":"up"}`.
- Passport smoke:
  - published product → 200, EN/IT title and body localized, identity
    (name/SKU/manufacturer/date) rendered.
  - missing slug → **404** with localized `not-found` page (not a 500).
  - duplicate accepted rows for one field → only the newest verified value
    is returned.
- Audit smoke: `UPDATE`, `DELETE`, and `TRUNCATE` on `audit_log` all raise.
- Invite smoke: founder mint → public check returns 2 seats → redeem as
  `alice` succeeds → `alice` again is a no-op → `bob` gets 409
  `invite_used`; `used_count` stays 1, one membership row.
- Retry smoke: failed document → 200 pending, proposals/items cleared,
  verified value kept, job queued; second retry → **409 `not_retryable`**.
- Founder API: wrong/missing key → **403**, correct key → **200**.
- Two accepted rows for the same field now fail at the DB with
  `field_values_one_verified_per_field`.

A local `DEMO_MODE` (see `docs/LOCAL_TESTING.md`) also exercised the complete
path without external accounts: CSV and PDF upload -> `extraction_jobs` ->
worker -> proposed `field_values` -> accept -> publish -> public passport,
including `document_items` transcription and `detected_parties`. Demo
extraction is deterministic (label/value heuristics + pypdf), so this proves
the wiring, not Anthropic output quality.

Not executed: a live Anthropic extraction and a real R2 round-trip. The
local `.env` contains placeholder credentials, so the LLM/table branches
were validated with unit tests and deterministic fixtures, not a live call.

## Residual risks (not fixed)

1. **Invite code entropy.** Codes are 6 characters from a 31-character
   alphabet (~887M) hashed with unsalted SHA-256. A database leak allows
   offline enumeration. For a paid pilot, move to 8-10 characters and/or
   HMAC the code with a server secret.
2. **No unpublish/withdraw endpoint.** Once `passport_published` is true it
   can only be flipped with SQL. Add a reviewer/admin `POST .../unpublish`
   with an audit row before a real compliance incident.
3. **Public/founder rate limiting.** Neither route has throttling. Put a
   proxy/WAF limit in front of `/api/public/passport/*` and
   `/api/founder/*`; the founder key is high-value.
4. **PDF page numbers are not range-checked.** `Page 999` is kept even for a
   3-page PDF. The upload path knows `page_count`; validate against it when
   present.
5. **Multi-worker stale requeue.** `recover_stale()` is safe with the single
   worker Docker service. If you scale workers, a >15-min extraction can be
   requeued while still running; use a heartbeat/`locked_until` column.
6. **Fallback labels.** When the table transcription model is unavailable,
   `table_to_doc_items()` labels each cell by coordinate. It loses no data
   but is less readable than the model's row/column labels.
7. **Supabase one-shot ordering.** `000_pilot_bootstrap.sql` covers only the
   original tables. A fresh Supabase project must run `scripts/migrate.sh`
   after it so 018/019 (grants + invariant) apply.

## How to reproduce locally

```bash
docker compose up -d --build
curl -s localhost:8010/ready
curl -s localhost:8010/api/public/passport/<published-slug>
open http://localhost:3010/passport/<published-slug>
```

Tests run without a database:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q
```
