"""Standalone DB-backed extraction queue poller (Phase 3).

Polls extraction_jobs for queued rows with SELECT ... FOR UPDATE SKIP LOCKED,
marks running (attempts+1), runs real extraction (document bytes from R2 +
branch by file type), and on exception marks failed with error truncated to
500 chars.

Usage:
    DATABASE_URL=postgresql://... python scripts/worker.py [--once]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time

# Repo-root bootstrap: when run as `python scripts/worker.py` (Docker CMD),
# sys.path[0] is scripts/, so `from app...` imports fail. Same pattern as
# scripts/backfill_parties.py. Without this every job fails with
# ModuleNotFoundError: No module named 'app'.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg

CLAIM_SQL = """
SELECT id, document_id, workspace_id
FROM extraction_jobs
WHERE status = 'queued'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED
"""


def get_conn():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(dsn)


def _fetch_document_bytes(storage_key: str) -> bytes:
    """Download document bytes (R2, or the shared local volume in demo mode)."""
    from app.services.storage import read_from_storage

    return read_from_storage(storage_key)


def _run_real_extraction(conn, job_id, document_id, workspace_id) -> None:
    """Fetch document + product + field defs, download bytes from R2, branch
    by storage_key extension, insert proposed field_values, and mark both the
    document and the job done/failed. Raises on failure (caller records it)."""
    from app.services.extraction import (
        csv_to_table,
        extract_parties_pdf,
        extract_pdf_native,
        extract_table_mapped,
        sanitize_items,
        validate_item_locations,
        xlsx_to_table,
    )

    with conn.cursor() as cur:
        cur.execute(
            "SELECT product_id, storage_key FROM documents WHERE id = %s",
            (document_id,),
        )
        doc = cur.fetchone()
        if doc is None:
            raise RuntimeError("document gone")
        product_id, storage_key = doc

        cur.execute("SELECT category FROM products WHERE id = %s", (product_id,))
        prow = cur.fetchone()
        if prow is None:
            raise RuntimeError("product gone")
        category = prow[0]

        cur.execute(
            "SELECT field_key, label, required, display_order FROM field_definitions"
            " WHERE category = %s ORDER BY display_order",
            (category,),
        )
        defs = [
            {"field_key": r[0], "label": r[1], "required": bool(r[2]), "display_order": r[3]}
            for r in cur.fetchall()
        ]

    with conn.cursor() as cur:
        # Idempotency: a legacy BackgroundTasks double-path or duplicate queue
        # row must not insert a second set of proposals. Only skip when the
        # document actually finished; a crash mid-insert leaves status
        # 'extracting'/'failed', and its partial proposals must be discarded
        # before retrying (otherwise the passport view silently stays partial).
        cur.execute(
            "SELECT extraction_status FROM documents WHERE id = %s",
            (document_id,),
        )
        drow = cur.fetchone()
        doc_status = drow[0] if drow else None
        cur.execute(
            "SELECT COUNT(*) FROM field_values WHERE document_id = %s",
            (document_id,),
        )
        has_values = (cur.fetchone() or [0])[0] > 0
        if doc_status == "done" and has_values:
            cur.execute(
                "UPDATE extraction_jobs SET status = 'done', error = NULL,"
                " updated_at = now() WHERE id = %s",
                (job_id,),
            )
            conn.commit()
            return
        # Remove proposals from a previous failed/partial attempt. Verified
        # (accepted/corrected) rows belong to reviewers and are never deleted.
        cur.execute(
            "DELETE FROM field_values WHERE document_id = %s AND status = 'proposed'",
            (document_id,),
        )

    try:
        body = _fetch_document_bytes(storage_key)
    except Exception as exc:
        raise RuntimeError(f"r2-fetch-failed: {exc}") from exc

    ext = os.path.splitext(storage_key or "")[1].lower()
    table = None
    if ext == ".pdf":
        items = asyncio.run(extract_pdf_native(body, defs))
    elif ext == ".xlsx":
        table = xlsx_to_table(body)
        items = asyncio.run(extract_table_mapped(table, defs))
    elif ext == ".csv":
        table = csv_to_table(body)
        items = asyncio.run(extract_table_mapped(table, defs))
    else:
        raise RuntimeError(f"unsupported-type: {ext or '(none)'}")

    allowed = {d["field_key"] for d in defs}
    clean = validate_item_locations(sanitize_items(items, allowed), ext, table)
    truncated = bool(getattr(table, "truncated", False))

    with conn.cursor() as cur:
        for it in clean:
            cur.execute(
                "INSERT INTO field_values (workspace_id, product_id, field_key, value, unit,"
                " status, document_id, location, extracted_by)"
                " VALUES (%s,%s,%s,%s,%s,'proposed',%s,%s,'ai_system')",
                (
                    workspace_id,
                    product_id,
                    it["field_key"],
                    it["value"],
                    it["unit"],
                    document_id,
                    it["location"],
                ),
            )
        # Track A: full per-document transcription (every labeled value).
        # Passport mapping above stays untouched. PDF and tables both get a
        # full transcription; storage failures are logged, not swallowed
        # silently by the store function.
        try:
            from app.services.document_items import (
                extract_full_items_pdf,
                extract_full_items_table,
                store_document_items,
            )
            if ext == ".pdf":
                full = asyncio.run(extract_full_items_pdf(body))
            elif table is not None:
                full = asyncio.run(extract_full_items_table(table))
            else:
                full = []
            if full:
                stored = asyncio.run(store_document_items(conn, workspace_id, document_id, full))
                if getattr(stored, "truncated", False):
                    truncated = True
        except Exception as exc:  # noqa: BLE001
            print(f"document_items fallback: {type(exc).__name__}: {exc}")
        parties: list = []
        if ext == ".pdf":
            try:
                parties = asyncio.run(extract_parties_pdf(body)) or []
                if getattr(parties, "truncated", False):
                    truncated = True
            except Exception:
                parties = []
            cur.execute(
                "UPDATE documents SET extraction_status = 'done', extracted_count = %s,"
                " extraction_error = NULL, extraction_truncated = %s,"
                " detected_parties = %s::jsonb WHERE id = %s",
                (len(clean), truncated, json.dumps(parties), document_id),
            )
        else:
            cur.execute(
                "UPDATE documents SET extraction_status = 'done', extracted_count = %s,"
                " extraction_error = NULL, extraction_truncated = %s WHERE id = %s",
                (len(clean), truncated, document_id),
            )
        cur.execute(
            "UPDATE extraction_jobs SET status = 'done', error = NULL, "
            "updated_at = now() WHERE id = %s",
            (job_id,),
        )
        conn.commit()


def recover_stale(conn) -> None:
    """Requeue jobs whose worker died mid-run.

    Without this a crash (or a container stop) leaves a job 'running' forever
    and the document stuck in 'extracting', with no reviewer-visible error.
    After three attempts the job is failed instead of retried in a loop.
    """
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE extraction_jobs SET status = 'failed',"
            " error = COALESCE(error, 'worker stopped before finishing'),"
            " updated_at = now()"
            " WHERE status = 'running' AND attempts >= 3"
            " AND updated_at < now() - interval '15 minutes'"
            " RETURNING document_id"
        )
        failed_docs = [r[0] for r in cur.fetchall()]
        for document_id in failed_docs:
            cur.execute(
                "UPDATE documents SET extraction_status = 'failed',"
                " extraction_error = 'worker stopped before finishing' WHERE id = %s",
                (document_id,),
            )
        cur.execute(
            "UPDATE extraction_jobs SET status = 'queued', updated_at = now()"
            " WHERE status = 'running'"
            " AND updated_at < now() - interval '15 minutes'"
            " RETURNING document_id"
        )
        requeued_docs = [r[0] for r in cur.fetchall()]
        for document_id in requeued_docs:
            cur.execute(
                "UPDATE documents SET extraction_status = 'pending', extraction_error = NULL"
                " WHERE id = %s",
                (document_id,),
            )
        conn.commit()
        if failed_docs or requeued_docs:
            print(f"recovered stale jobs: requeued={len(requeued_docs)} failed={len(failed_docs)}")


def process_one(conn) -> bool:
    """Claim a single queued job and transition it. Returns True if a job was handled."""
    recover_stale(conn)
    with conn.cursor() as cur:
        cur.execute(CLAIM_SQL)
        row = cur.fetchone()
        if row is None:
            conn.commit()
            return False
        job_id, document_id, workspace_id = row
        cur.execute(
            "UPDATE extraction_jobs SET status = 'running', attempts = attempts + 1, "
            "updated_at = now() WHERE id = %s",
            (job_id,),
        )
        conn.commit()
        try:
            _run_real_extraction(conn, job_id, document_id, workspace_id)
        except Exception as exc:  # noqa: BLE001
            # The failed statement left the transaction aborted; without this
            # rollback the UPDATE below itself fails (InFailedSqlTransaction)
            # and the job/document stay 'running'/'extracting' forever.
            conn.rollback()
            # Class + message (truncated): class-only errors are low-signal
            # for reviewers (audit C15). The r2-fetch prefix survives inside
            # the message instead of being collapsed to a bare token.
            err = f"{type(exc).__name__}: {exc}"[:500]
            with conn.cursor() as cur2:
                cur2.execute(
                    "UPDATE extraction_jobs SET status = 'failed', error = %s, "
                    "updated_at = now() WHERE id = %s",
                    (err, job_id),
                )
                try:
                    cur2.execute(
                        "UPDATE documents SET extraction_status = 'failed',"
                        " extraction_error = %s WHERE id = %s",
                        (err, document_id),
                    )
                except Exception:
                    pass
            conn.commit()
        return True


def run_loop(once: bool = False, poll_interval: float = 2.0) -> None:
    with get_conn() as conn:
        while True:
            handled = process_one(conn)
            if once:
                return
            if not handled:
                time.sleep(poll_interval)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="TraceFlow extraction queue worker")
    parser.add_argument("--once", action="store_true", help="Process at most one job then exit (tests/CI)")
    args = parser.parse_args(argv)
    run_loop(once=args.once)


if __name__ == "__main__":
    main()
