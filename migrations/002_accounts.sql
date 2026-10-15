CREATE TABLE health.users (
  id uuid PRIMARY KEY,
  login text NOT NULL UNIQUE CHECK (login ~ '^[a-z0-9][a-z0-9_.-]{2,63}$'),
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%' AND length(password_hash) <= 512),
  timezone text NOT NULL CHECK (length(timezone) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE health.sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (last_seen_at >= created_at AND last_seen_at <= expires_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX sessions_user ON health.sessions(user_id);
CREATE INDEX sessions_expiry ON health.sessions(expires_at);

GRANT USAGE ON SCHEMA health TO health_runtime;
GRANT SELECT ON health.users TO health_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON health.sessions TO health_runtime;
REVOKE ALL ON health.users, health.sessions FROM PUBLIC;
