CREATE TABLE health.profiles (
  user_id uuid PRIMARY KEY REFERENCES health.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) <= 80),
  height_cm numeric NOT NULL CHECK (height_cm > 0 AND height_cm <= 300),
  birth_date date CHECK (birth_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  formula_sex text NOT NULL CHECK (formula_sex IN ('none', 'male', 'female')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE health.weights (
  user_id uuid NOT NULL REFERENCES health.profiles(user_id) ON DELETE CASCADE,
  id uuid NOT NULL,
  date date NOT NULL CHECK (date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  kg numeric NOT NULL CHECK (kg > 0 AND kg <= 600),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, date)
);

ALTER TABLE health.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY profiles_owner ON health.profiles TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
ALTER TABLE health.weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.weights FORCE ROW LEVEL SECURITY;
CREATE POLICY weights_owner ON health.weights TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON health.profiles, health.weights TO health_runtime;
