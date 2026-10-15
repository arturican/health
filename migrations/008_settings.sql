CREATE TABLE health.settings (
  user_id uuid PRIMARY KEY REFERENCES health.users(id) ON DELETE CASCADE,
  generation uuid NOT NULL DEFAULT gen_random_uuid(),
  show_photos boolean NOT NULL DEFAULT true,
  show_documents boolean NOT NULL DEFAULT true,
  catalog_seeded boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE health.legacy_metadata (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 80 AND id NOT IN ('section-visibility','catalog-seeded','diary-generation')),
  value text NOT NULL CHECK (length(value) <= 20480),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE health.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.settings FORCE ROW LEVEL SECURITY;
CREATE POLICY settings_owner ON health.settings TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
ALTER TABLE health.legacy_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.legacy_metadata FORCE ROW LEVEL SECURITY;
CREATE POLICY legacy_metadata_owner ON health.legacy_metadata TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON health.settings, health.legacy_metadata TO health_runtime;
