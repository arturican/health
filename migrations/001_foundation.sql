REVOKE ALL ON SCHEMA health FROM PUBLIC;
REVOKE ALL ON health.schema_migrations FROM PUBLIC;
COMMENT ON SCHEMA health IS 'Health diary: private application data';
