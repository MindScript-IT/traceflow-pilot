# Local browser testing (demo mode)

The checked-in `.env.example` contains placeholders for Supabase, Cloudflare R2
and Anthropic. To exercise the **whole flow** without any of those accounts,
this repo has a `DEMO_MODE` that only changes the adapters, not the workflow:

- auth: every request is the fixed `demo-reviewer` in the seeded workspace
- storage: uploads land on a shared `uploads` Docker volume instead of R2
- extraction: label/value heuristics instead of Anthropic calls
- ask: keyword match over the same workspace snapshot instead of a model

Everything else is the real path: upload -> `extraction_jobs` -> worker ->
`field_values` (proposed) -> review/accept -> passport publish -> public page.

## Start

```bash
cp .env.example .env   # only if .env is missing
# set DB_APP_PASSWORD and FOUNDER_KEY to local values
# set DEMO_MODE=true and NEXT_PUBLIC_DEMO_MODE=true
docker compose up -d --build
docker compose ps
```

Open <http://localhost:3010/login> and click **Open demo workspace**.
(The landing page is <http://localhost:3010/>.)

## Suggested flow

1. **Products** -> create a product (category `footwear`).
2. Open the product -> **upload** `samples/demo-shoe.csv` or
   `samples/demo-shoe.pdf`.
3. Wait for the document to reach `done` (the worker polls every few seconds);
   open the document to see the full transcription and proposed values.
4. **Review** -> accept/correct the 7 proposed fields.
5. On the product, **publish** the passport, then open `/passport/<slug>` in a
   new tab. Switch the language to Italian with the footer control.
6. **Ask** -> ask "What is the sole material?" (keyword answer, no model).
7. **Requests / Suppliers / Activity / Notifications / Account** are all
   backed by the real API and can be exercised the same way.
8. **Founder** (<http://localhost:3010/founder>) still uses the real
   `X-Founder-Key`; use the `FOUNDER_KEY` from `.env` to mint/inspect invites.
   The invite **check** endpoint is public; signup itself needs Supabase.

## What demo mode does not test

- Supabase sign-in / sign-up / password change.
- Real R2 round-trips (local volume only).
- Claude extraction quality, page-reference behavior, retries against 429/5xx.
- Email/intake (no external mail is sent in any mode).

Turn `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` off (and rebuild the web image,
because `NEXT_PUBLIC_*` is baked at build time) before any real deployment.
