CREATE TABLE health.products (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  source text NOT NULL CHECK (length(source) <= 160),
  kcal numeric NOT NULL CHECK (kcal BETWEEN 0 AND 10000),
  protein numeric CHECK (protein BETWEEN 0 AND 100),
  fat numeric CHECK (fat BETWEEN 0 AND 100),
  carbs numeric CHECK (carbs BETWEEN 0 AND 100),
  archived boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE TABLE health.food_entries (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  date date NOT NULL CHECK (date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  meal text NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  product_id uuid,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  source text NOT NULL CHECK (length(source) <= 160),
  kcal numeric NOT NULL CHECK (kcal BETWEEN 0 AND 10000),
  protein numeric CHECK (protein BETWEEN 0 AND 100),
  fat numeric CHECK (fat BETWEEN 0 AND 100),
  carbs numeric CHECK (carbs BETWEEN 0 AND 100),
  grams numeric NOT NULL CHECK (grams > 0 AND grams <= 100000),
  note text NOT NULL CHECK (length(note) <= 500),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, product_id) REFERENCES health.products(user_id, id) ON DELETE SET NULL (product_id)
);
CREATE INDEX food_entries_day ON health.food_entries(user_id, date, meal, id);
CREATE INDEX food_entries_product ON health.food_entries(user_id, product_id);
CREATE TABLE health.nutrition_days (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  date date NOT NULL CHECK (date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  complete boolean NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE health.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.products FORCE ROW LEVEL SECURITY;
CREATE POLICY products_owner ON health.products TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
ALTER TABLE health.food_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.food_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY food_entries_owner ON health.food_entries TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
ALTER TABLE health.nutrition_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.nutrition_days FORCE ROW LEVEL SECURITY;
CREATE POLICY nutrition_days_owner ON health.nutrition_days TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON health.products, health.food_entries, health.nutrition_days TO health_runtime;
