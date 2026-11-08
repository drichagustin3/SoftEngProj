-- S1-DEV-07: additive migration; does not reload business data.
BEGIN;

-- Some existing hopedb installations have no audit table yet.
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name VARCHAR(30) NOT NULL,
    action VARCHAR(7) NOT NULL CHECK (action IN ('ADD', 'EDIT', 'DELETE', 'RESTORE')),
    record_key VARCHAR(60),
    old_values JSONB,
    new_values JSONB,
    action_by VARCHAR(50) NOT NULL,
    action_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_module_rights (
    user_id INTEGER NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    module VARCHAR(20) NOT NULL CHECK (module IN ('customer', 'product', 'human_resources', 'sales', 'reports')),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    actions TEXT[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (user_id, module),
    CHECK (actions <@ ARRAY['view', 'add', 'edit', 'delete', 'restore']::text[]),
    CHECK (array_position(actions, NULL) IS NULL),
    CHECK (module <> 'reports' OR actions <@ ARRAY['view']::text[]),
    CHECK (enabled OR cardinality(actions) = 0)
);

CREATE OR REPLACE FUNCTION trg_audit_user_module_rights() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_user_id INTEGER;
    v_module TEXT;
    v_action TEXT;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_user_id := OLD.user_id;
        v_module := OLD.module;
        v_action := 'DELETE';
    ELSE
        v_new := to_jsonb(NEW);
        v_user_id := NEW.user_id;
        v_module := NEW.module;
        v_action := CASE WHEN TG_OP = 'INSERT' THEN 'ADD' ELSE 'EDIT' END;
        IF TG_OP = 'UPDATE' THEN v_old := to_jsonb(OLD); END IF;
    END IF;
    INSERT INTO audit_log (table_name, action, record_key, old_values, new_values, action_by)
    VALUES ('user_module_rights', v_action, v_user_id::text || '|' || v_module,
            v_old, v_new,
            COALESCE(NULLIF(current_setting('app.username', true), ''), session_user::text));
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS user_module_rights_audit ON user_module_rights;
CREATE TRIGGER user_module_rights_audit
    AFTER INSERT OR UPDATE OR DELETE ON user_module_rights
    FOR EACH ROW EXECUTE FUNCTION trg_audit_user_module_rights();

CREATE OR REPLACE FUNCTION trg_protect_audit_log() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only.';
END;
$$;

-- Preserve existing protection triggers if the full schema already installed them.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass AND tgname = 'audit_log_protect_row') THEN
        CREATE TRIGGER audit_log_protect_row BEFORE UPDATE OR DELETE ON audit_log
            FOR EACH ROW EXECUTE FUNCTION trg_protect_audit_log();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass AND tgname = 'audit_log_protect_truncate') THEN
        CREATE TRIGGER audit_log_protect_truncate BEFORE TRUNCATE ON audit_log
            FOR EACH STATEMENT EXECUTE FUNCTION trg_protect_audit_log();
    END IF;
END;
$$;

COMMIT;
