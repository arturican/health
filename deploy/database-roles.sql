-- Run as cluster administrator. Passwords are provisioned outside this file.
BEGIN;
SELECT pg_advisory_xact_lock(1729, 161);
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['health_runtime', 'health_app', 'health_migrator'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', role_name);
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name AND
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
      RAISE EXCEPTION 'Incompatible health database role';
    END IF;
    IF EXISTS (SELECT FROM pg_auth_members m
      JOIN pg_roles member_role ON member_role.oid = m.member
      JOIN pg_roles parent_role ON parent_role.oid = m.roleid
      WHERE member_role.rolname = role_name AND
        NOT (role_name = 'health_app' AND parent_role.rolname = 'health_runtime')) THEN
      RAISE EXCEPTION 'Unexpected health role membership';
    END IF;
  END LOOP;
END $$;
ALTER ROLE health_runtime NOLOGIN;
ALTER ROLE health_app LOGIN;
ALTER ROLE health_migrator LOGIN;
GRANT health_runtime TO health_app;
COMMIT;
