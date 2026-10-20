"""Deterministic, no-network extraction used only when DEMO_MODE is on.

The pilot normally sends PDFs to Anthropic and maps spreadsheets with the
model. That makes the full flow impossible to exercise without credentials.
Demo mode keeps the same upload -> queue -> worker -> review -> passport
path, but extracts with local text/label heuristics instead:

- spreadsheets: label cell -> adjacent value cell (right, then below)
- PDFs: pypdf text, then "Label: Value" lines mapped onto field definitions
- full transcription: every line / cell, verbatim
- ask: keyword match over the same workspace snapshot the model would see

No value is invented: if a label is absent, the field is simply not proposed.
"""
from __future__ import annotations

import io
import re

from app.services.extraction import TruncatedList

PDF_LINE_RE = re.compile(r"^\s*([^:]{2,80}?)\s*:\s*(.+?)\s*$")
PARTY_RE = re.compile(
    r"^\s*(manufacturer|supplier|vendor|applicant|brand|laboratory|lab)\s*[:–-]\s*(.+?)\s*$",
    re.IGNORECASE,
)
PARTY_ROLES = {"manufacturer": "vendor", "supplier": "supplier", "vendor": "vendor",
               "applicant": "applicant", "brand": "brand", "laboratory": "laboratory",
               "lab": "laboratory"}


def _norm(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _aliases(field_defs: list[dict]) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for d in field_defs or []:
        key = d.get("field_key")
        if not key:
            continue
        out[key] = {
            _norm(key),
            _norm(str(key).replace("_", " ")),
            _norm(d.get("label")),
        } - {""}
    return out


def _match_field(text: object, field_defs: list[dict]) -> str | None:
    value = _norm(text)
    if not value:
        return None
    for key, names in _aliases(field_defs).items():
        if value in names:
            return key
    return None


def map_table(table: list[dict], field_defs: list[dict]) -> TruncatedList:
    """Map label -> adjacent value from parsed XLSX/CSV cells.

    Supports horizontal (label in one column, value in the next) and vertical
    (label above value) layouts. The location always points at the value cell.
    """
    rows: dict[tuple[str, int], list[tuple[int, str, str, str]]] = {}
    for cell in table or []:
        if not isinstance(cell, dict) or not str(cell.get("value", "")).strip():
            continue
        sheet = str(cell.get("sheet") or "Table")
        ref = str(cell.get("cell") or "")
        try:
            if ref.startswith("Row "):
                row_txt, col_txt = ref[4:].split(" / ", 1)
                row_no = int(row_txt.strip())
                order = len(rows.get((sheet, row_no), []))
                col_key = col_txt
                location = f"{sheet} / Row {row_no} / {col_txt}"
            else:
                from openpyxl.utils.cell import column_index_from_string, coordinate_from_string

                col_letter, row_no = coordinate_from_string(ref)
                order = column_index_from_string(col_letter)
                col_key = col_letter
                location = f"{sheet} / {ref}"
        except Exception:
            continue
        rows.setdefault((sheet, row_no), []).append((order, col_key, str(cell["value"]), location))

    found: set[str] = set()
    out = TruncatedList()
    for (sheet, row_no) in sorted(rows, key=lambda x: (x[0], x[1])):
        ordered = sorted(rows[(sheet, row_no)], key=lambda x: x[0])
        for idx, (_order, col_key, value, _loc) in enumerate(ordered):
            field_key = _match_field(value, field_defs)
            if not field_key or field_key in found:
                continue
            target = None
            for _o, _c, v, loc in ordered[idx + 1:]:
                if v.strip():
                    target = (loc, v)
                    break
            if target is None:
                below = sorted(rows.get((sheet, row_no + 1), []), key=lambda x: x[0])
                same = [x for x in below if x[1] == col_key]
                if same:
                    target = (same[0][3], same[0][2])
                elif below:
                    target = (below[0][3], below[0][2])
            if target is None:
                continue
            out.append({
                "field_key": field_key,
                "value": target[1],
                "unit": None,
                "location": target[0],
            })
            found.add(field_key)
    return out


def pdf_pages(body: bytes) -> list[tuple[int, str]]:
    """Text per PDF page. Missing pypdf / unreadable PDF -> [] (never raises)."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(body))
        pages = []
        for i, page in enumerate(reader.pages, start=1):
            try:
                pages.append((i, page.extract_text() or ""))
            except Exception:
                pages.append((i, ""))
        return pages
    except Exception as exc:  # noqa: BLE001 - demo must never fail hard
        print(f"demo pdf text unavailable: {type(exc).__name__}")
        return []


def map_pdf(body: bytes, field_defs: list[dict]) -> TruncatedList:
    found: set[str] = set()
    out = TruncatedList()
    for page_no, text in pdf_pages(body):
        for line in text.splitlines():
            m = PDF_LINE_RE.match(line)
            if not m:
                continue
            field_key = _match_field(m.group(1), field_defs)
            if not field_key or field_key in found:
                continue
            out.append({
                "field_key": field_key,
                "value": m.group(2).strip(),
                "unit": None,
                "location": f"Page {page_no}",
            })
            found.add(field_key)
    return out


def full_pdf(body: bytes) -> TruncatedList:
    """Every non-empty PDF line as one item, label/value split at the first ':'."""
    out = TruncatedList()
    for page_no, text in pdf_pages(body):
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            if len(out) >= 200:
                out.truncated = True
                break
            m = PDF_LINE_RE.match(line)
            if m:
                label, value = m.group(1).strip(), m.group(2).strip()
            else:
                label, value = line[:120], line
            out.append({
                "label": label,
                "value": value[:500],
                "unit": None,
                "location": f"Page {page_no}",
            })
    return out


def parties_pdf(body: bytes) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for _page_no, text in pdf_pages(body):
        for line in text.splitlines():
            m = PARTY_RE.match(line)
            if not m:
                continue
            name = m.group(2).strip()[:120]
            key = name.lower()
            if not name or key in seen:
                continue
            seen.add(key)
            out.append({"name": name, "role": PARTY_ROLES.get(m.group(1).lower(), "other")})
            if len(out) >= 12:
                return out
    return out


def ask(question: str, snapshot: str) -> str:
    """Keyword-ranked answer over the snapshot; no model call."""
    words = [w for w in re.findall(r"[a-z0-9]{3,}", (question or "").lower())]
    lines = [ln for ln in snapshot.splitlines() if ln.strip().startswith("- ")]
    scored = []
    for line in lines:
        low = line.lower()
        score = sum(1 for w in words if w in low)
        if score:
            scored.append((score, line))
    scored.sort(key=lambda x: -x[0])
    picked = [ln for _s, ln in scored[:8]]
    if not picked:
        return ("Demo mode: no AI model is connected. I could not find matching "
                "evidence in the workspace snapshot. Try asking about a product, "
                "SKU, field, supplier, or request.")
    body = "\n".join(f"- {ln.lstrip('- ').strip()}" for ln in picked)
    return ("Demo mode: answers are keyword matches over the workspace snapshot, "
            "not model output.\n\n" + body)
