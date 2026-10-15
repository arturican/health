CREATE TABLE health.steps (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  date date NOT NULL CHECK (date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  count integer NOT NULL CHECK (count BETWEEN 0 AND 1000000),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
CREATE TABLE health.workouts (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  date date NOT NULL CHECK (date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  kind text NOT NULL CHECK (length(btrim(kind)) BETWEEN 1 AND 80),
  minutes numeric NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  kcal numeric CHECK (kcal BETWEEN 0 AND 100000),
  source text NOT NULL CHECK (length(source) <= 160),
  note text NOT NULL CHECK (length(note) <= 500),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX workouts_day ON health.workouts(user_id, date, id);
CREATE TABLE health.energy_plans (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  effective_from date NOT NULL CHECK (effective_from BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  created_on date NOT NULL CHECK (created_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  goal_kcal numeric CHECK (goal_kcal BETWEEN 0 AND 100000),
  method text NOT NULL CHECK (method IN ('none', 'manual', 'factor')),
  manual_kcal numeric CHECK (manual_kcal BETWEEN 0 AND 100000),
  factor numeric CHECK (factor > 0 AND factor <= 10),
  source text NOT NULL CHECK (length(source) <= 160),
  resting_formula text NOT NULL CHECK (resting_formula = 'mifflin-st-jeor-1990'),
  snapshot_kg numeric CHECK (snapshot_kg > 0 AND snapshot_kg <= 600),
  snapshot_weight_date date CHECK (snapshot_weight_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  snapshot_height_cm numeric CHECK (snapshot_height_cm > 0 AND snapshot_height_cm <= 300),
  snapshot_age smallint CHECK (snapshot_age BETWEEN 0 AND 9998),
  snapshot_formula_sex text NOT NULL CHECK (snapshot_formula_sex IN ('none', 'male', 'female')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, revision),
  CHECK (effective_from >= created_on),
  CHECK ((snapshot_kg IS NULL) = (snapshot_weight_date IS NULL)),
  CHECK (snapshot_weight_date <= created_on),
  CHECK ((method = 'none' AND manual_kcal IS NULL AND factor IS NULL)
    OR (method = 'manual' AND manual_kcal IS NOT NULL AND factor IS NULL)
    OR (method = 'factor' AND manual_kcal IS NULL AND factor IS NOT NULL))
);
CREATE INDEX energy_plans_effective ON health.energy_plans(user_id, effective_from DESC, revision DESC);

ALTER TABLE health.steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.steps FORCE ROW LEVEL SECURITY;
CREATE POLICY steps_owner ON health.steps TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
ALTER TABLE health.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.workouts FORCE ROW LEVEL SECURITY;
CREATE POLICY workouts_owner ON health.workouts TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
ALTER TABLE health.energy_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.energy_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY energy_plans_owner ON health.energy_plans TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON health.steps, health.workouts TO health_runtime;
GRANT SELECT, INSERT, DELETE ON health.energy_plans TO health_runtime;
