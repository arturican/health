CREATE DOMAIN health.email_address AS text CHECK (
  VALUE IS NULL OR (
    octet_length(VALUE) <= 254
    AND octet_length(split_part(VALUE, '@', 1)) BETWEEN 1 AND 64
    AND VALUE COLLATE "C" ~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
  )
);
REVOKE ALL ON DOMAIN health.email_address FROM PUBLIC;
GRANT USAGE ON DOMAIN health.email_address TO health_runtime;

ALTER TABLE health.users ADD COLUMN email health.email_address;
ALTER TABLE health.users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE health.users ADD CONSTRAINT users_email_verification CHECK (
  email_verified_at IS NULL OR (
    email IS NOT NULL AND isfinite(email_verified_at) AND email_verified_at >= created_at
  )
);
CREATE UNIQUE INDEX users_email_unique ON health.users(lower(email));

CREATE TABLE health.account_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  email health.email_address NOT NULL,
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at) AND expires_at > created_at),
  consumed_at timestamptz CHECK (consumed_at IS NULL OR (
    isfinite(consumed_at) AND consumed_at >= created_at AND consumed_at < expires_at
  )),
  UNIQUE (user_id, purpose)
);
REVOKE ALL ON health.account_tokens FROM PUBLIC, health_runtime;
