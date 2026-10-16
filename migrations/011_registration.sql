-- Only this fixed operation runs with the migration owner's privileges.
CREATE FUNCTION health.register_account(account_login text, account_hash text, account_timezone text)
RETURNS TABLE(id uuid, login text, timezone text)
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO health.users AS u(id, login, password_hash, timezone)
  VALUES (gen_random_uuid(), account_login, account_hash, account_timezone)
  ON CONFLICT (login) DO NOTHING
  RETURNING u.id, u.login, u.timezone;
$$;
REVOKE ALL ON FUNCTION health.register_account(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION health.register_account(text, text, text) TO health_runtime;
