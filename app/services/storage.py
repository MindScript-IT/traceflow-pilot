"""File-type gate + R2 upload. Correction 1: reject unknown types at upload.

Allowed: .pdf, .xlsx, .csv (by extension AND content sniff where cheap).
Everything else -> 415 before any DB row or extraction work happens.
"""
from __future__ import annotations

import os
import uuid

import boto3

from app import errors
from app.config import settings

ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".csv"}

PDF_MAGIC = b"%PDF"
XLSX_MAGIC = b"PK\x03\x04"  # zip container

# Absolute ceiling: matches the upload endpoint's first-line guard.
ABSOLUTE_MAX_BYTES = 25 * 1024 * 1024

# Per-type caps. PDF goes DIRECTLY to Claude as native document input, so its
# cap must stay well under the API payload limit after base64 inflation
# (~+33%) plus prompt overhead. Tables are parsed locally, but anything past
# the 500-row extraction cap is dead weight, so cap them tight too.
MAX_BYTES_BY_EXT = {
    ".pdf": 10 * 1024 * 1024,
    ".xlsx": 5 * 1024 * 1024,
    ".csv": 5 * 1024 * 1024,
}


def check_size(ext: str, nbytes: int) -> str:
    """Per-type size gate. Raises 413 when the body exceeds the type's cap."""
    cap = MAX_BYTES_BY_EXT.get(ext, ABSOLUTE_MAX_BYTES)
    if nbytes > cap:
        raise errors.file_too_large(cap // (1024 * 1024))
    return ext


def verify_file_content(filename: str, ext: str, body: bytes) -> str:
    """Deep content check on the FULL body (runs after the size gate).

    classify_file only sees the first 8 bytes, so a binary blob (or a renamed
    foreign file) with an innocent-looking head slips through. This validates
    the whole payload: CSV is scanned for NULs + decodability + table shape,
    XLSX must actually open as a workbook (not just zip magic).
    Raises 415 on mismatch. Returns ext unchanged.
    """
    if ext == ".csv":
        if b"\x00" in body:
            raise errors.file_content_problem("csv_binary")
        try:
            text = body.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                text = body.decode("windows-1252")
            except UnicodeDecodeError:
                raise errors.file_content_problem("csv_unreadable")
        if not any(tok in text for tok in (",", ";", "\t", "|", "\n", "\r")):
            raise errors.file_content_problem("csv_no_table")
    elif ext == ".xlsx":
        try:
            import io as _io

            from openpyxl import load_workbook as _load
        except ImportError:
            return ext  # openpyxl unavailable: magic check in classify_file stands
        try:
            wb = _load(filename=_io.BytesIO(body), data_only=True, read_only=True)
            try:
                _ = wb.sheetnames  # force workbook.xml parse, not just zip open
            finally:
                wb.close()
        except Exception:
            raise errors.file_content_problem("not_a_workbook")
    return ext


def classify_file(filename: str, head: bytes) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise errors.unsupported_type(filename or "that file")
    if ext == ".pdf" and not head.startswith(PDF_MAGIC):
        raise errors.file_content_problem("not_a_pdf")
    if ext == ".xlsx" and not head.startswith(XLSX_MAGIC):
        raise errors.file_content_problem("not_a_workbook")
    if ext == ".csv" and (b"\x00" in head):
        raise errors.file_content_problem("csv_binary")
    return ext


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint or None,
        aws_access_key_id=settings.r2_access_key_id or None,
        aws_secret_access_key=settings.r2_secret_access_key or None,
    )


def _local_path(key: str) -> str:
    """Resolve a storage key inside DEMO_STORAGE_DIR (no traversal)."""
    root = os.path.abspath(settings.demo_storage_dir or "/srv/app/uploads")
    path = os.path.abspath(os.path.join(root, key))
    if path != root and not path.startswith(root + os.sep):
        raise ValueError("storage key escapes the demo storage directory")
    return path


def upload_to_storage(key: str, body: bytes, content_type: str) -> None:
    """R2 in production; a shared local directory in demo mode.

    Demo mode runs the same upload -> queue -> worker path, only the bytes
    live on an api/worker shared volume instead of Cloudflare. This is what
    lets the full flow be tested with placeholder R2 credentials.
    """
    if settings.demo_mode:
        path = _local_path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(body)
        return
    client = _r2_client()
    client.put_object(Bucket=settings.r2_bucket, Key=key, Body=body, ContentType=content_type)


def read_from_storage(key: str) -> bytes:
    """Read document bytes back (demo local volume or R2)."""
    if settings.demo_mode:
        with open(_local_path(key), "rb") as fh:
            return fh.read()
    client = _r2_client()
    obj = client.get_object(Bucket=settings.r2_bucket, Key=key)
    return obj["Body"].read()


def delete_from_storage(key: str) -> None:
    """Compensating delete when a DB write after upload fails.

    Without this, a failed documents/extraction_jobs insert leaves an orphan
    object in the bucket (and the reviewer cannot see or retry it).
    """
    if settings.demo_mode:
        try:
            os.unlink(_local_path(key))
        except FileNotFoundError:
            pass
        return
    client = _r2_client()
    client.delete_object(Bucket=settings.r2_bucket, Key=key)


def new_storage_key(workspace_id: str, product_id: str, filename: str) -> str:
    """Per-company R2 layout: {workspace}/{product}/{uuid}-{basename}.

    Workspace prefix isolates companies sharing one bucket and makes
    per-company lifecycle/prefix deletes safe. basename() blocks "../" escapes.
    """
    safe = os.path.basename(filename or "upload")
    return f"{workspace_id}/{product_id}/{uuid.uuid4()}-{safe}"
