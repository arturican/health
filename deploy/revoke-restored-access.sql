-- Run as the restore administrator, before connecting any API to the restored DB.
-- A single DO statement is atomic, including failure of either DELETE.
DO $$
BEGIN
  IF current_database() !~ '^health_restore_[a-f0-9]{32}$' THEN
    RAISE EXCEPTION 'Expected an isolated health_restore database';
  END IF;
  LOCK TABLE health.account_tokens, health.sessions IN ACCESS EXCLUSIVE MODE;
  DELETE FROM health.account_tokens;
  DELETE FROM health.sessions;
END $$;
