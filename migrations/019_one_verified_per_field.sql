-- 019: enforce "one verified value per field" at the database level.
--
-- Routes already reject the previous verified row when a reviewer accepts or
-- corrects a value. A partial unique index makes that invariant structural:
-- no future route, bulk action, or manual SQL can create a second verified
-- row and leak a duplicate label onto the public passport.
--
-- Historic duplicates are collapsed first (keep the newest decision). The
-- public route already used DISTINCT ON for this reason; this migration makes
-- the underlying data agree with what the passport displays.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY product_id, field_key
           ORDER BY reviewed_at DESC NULLS LAST, created_at DESC, id DESC
         ) AS rn
  FROM field_values
  WHERE status IN ('accepted', 'corrected')
)
UPDATE field_values f
SET status = 'rejected',
    reviewed_at = now(),
    reviewed_by = COALESCE(f.reviewed_by, 'migration:019')
FROM ranked r
WHERE f.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS field_values_one_verified_per_field
ON field_values (product_id, field_key)
WHERE status IN ('accepted', 'corrected');
