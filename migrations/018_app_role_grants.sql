-- 018: make the app role grants complete and audit_log truly append-only.
--
-- Why this exists: migrations 004/007/008/009/011/012/015 granted privileges
-- on client_requests to CURRENT_USER (a no-op copy-paste bug). When migrations
-- run as `postgres` (Supabase) the app role traceflow_app therefore had no
-- rights on memberships, invites, client_requests, extraction_jobs,
-- document_items, request_items or notifications. Docker hid the bug because
-- POSTGRES_USER == traceflow_app, which owns every table.
--
-- Idempotent: GRANT/REVOKE can be re-run. In Docker the app role owns the
-- tables, so grants are no-ops; the trigger below is what actually enforces
-- append-only audit history there.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'traceflow_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO traceflow_app';
    -- Workspaces are seeded by migrations; keep write grants ready for any
    -- future on-demand provisioning path.
    EXECUTE 'GRANT SELECT, INSERT ON workspaces TO traceflow_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON '
         || 'products, suppliers, documents, field_definitions, field_values, '
         || 'supplier_followups, client_requests, memberships, invites, '
         || 'extraction_jobs, document_items, request_items, notifications '
         || 'TO traceflow_app';
    -- Audit history: read + append only.
    EXECUTE 'REVOKE ALL ON audit_log FROM traceflow_app';
    EXECUTE 'GRANT SELECT, INSERT ON audit_log TO traceflow_app';
  END IF;
END
$$;

-- Grant-level protection is useless when the app role owns the table (docker
-- compose). A trigger fires for the owner too, so history cannot be rewritten
-- even by the application credential.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END
$$;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_log;
CREATE TRIGGER trg_audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- TRUNCATE bypasses row triggers, so block it at statement level too.
CREATE OR REPLACE FUNCTION audit_log_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: TRUNCATE is not allowed';
END
$$;

DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON audit_log;
CREATE TRIGGER trg_audit_log_no_truncate
BEFORE TRUNCATE ON audit_log
FOR EACH STATEMENT EXECUTE FUNCTION audit_log_no_truncate();
