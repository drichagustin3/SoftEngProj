-- Apply to an existing hopedb without reloading the sample-data schema.
BEGIN;
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_status_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_status_check
    CHECK (status IN ('pending', 'active', 'blocked', 'disabled', 'disapproved'));
COMMIT;
