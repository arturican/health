CREATE TABLE health.commands (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb NOT NULL CHECK (octet_length(response::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE health.commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.commands FORCE ROW LEVEL SECURITY;
CREATE POLICY commands_owner ON health.commands TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
GRANT SELECT, INSERT, DELETE ON health.commands TO health_runtime;
