"""Public passport: isolated handler, no auth, verified-only SQL (spec section 8).

- Lookup by public_slug, never id.
- Unpublished -> 404 (no existence leak).
- WHERE status IN ('accepted','corrected') in the SQL itself.
- One verified value per field (DISTINCT ON), even if historic data has
  duplicate accepted rows.
- Response: identity (name/sku/manufacturer/date) + label, value, unit.
  No document, reviewer, workspace, or location data ever leaves this route.
"""
from __future__ import annotations

from fastapi import APIRouter

from app import errors

from app.db import get_pool

router = APIRouter()


@router.get("/api/public/passport/{public_slug}")
async def public_passport(public_slug: str):
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id, name, sku, manufacturer_name, category, published_at"
            " FROM products WHERE public_slug = %s AND passport_published = TRUE",
            (public_slug,),
        )
        row = await cur.fetchone()
        if row is None:
            raise errors.not_found("That passport")
        product_id = row[0]
        name, sku, manufacturer_name = row[1], row[2], row[3]
        category, published_at = row[4], row[5]
        # Structurally incapable of returning proposed/rejected: filter is in SQL.
        # DISTINCT ON keeps the newest verified row per field for historic data.
        cur = await conn.execute(
            "SELECT DISTINCT ON (fv.field_key) fd.field_key, fd.label, fv.value,"
            " fv.unit, fd.display_order"
            " FROM field_values fv"
            " JOIN field_definitions fd ON fd.category = %s AND fd.field_key = fv.field_key"
            " WHERE fv.product_id = %s AND fv.status IN ('accepted','corrected')"
            " ORDER BY fv.field_key, fv.reviewed_at DESC NULLS LAST, fv.created_at DESC",
            (category, product_id),
        )
        rows = await cur.fetchall()
    rows.sort(key=lambda r: r[4])
    verified = {r[0]: r[2] for r in rows}
    fields = [
        {"field_key": r[0], "label": r[1], "value": r[2], "unit": r[3]}
        for r in rows
    ]
    return {
        "product_name": verified.get("product_name") or name,
        "sku": verified.get("sku") or sku,
        "manufacturer_name": manufacturer_name,
        "category": category,
        "published_at": published_at.isoformat() if published_at else None,
        "fields": fields,
    }
