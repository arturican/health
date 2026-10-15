CREATE TABLE health.files (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('photo','document')),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
  size integer NOT NULL CHECK (size > 0 AND size <= 20971520),
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, id, purpose),
  CHECK (size = octet_length(bytes)),
  CHECK (purpose <> 'photo' OR (mime <> 'application/pdf' AND size <= 10485760))
);
CREATE TABLE health.photos (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  file_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'photo' CHECK (purpose = 'photo'),
  date date NOT NULL CHECK (date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  note text NOT NULL CHECK (length(note) <= 500),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 2048),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 2048),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, file_id),
  FOREIGN KEY (user_id, file_id, purpose) REFERENCES health.files(user_id, id, purpose) ON DELETE CASCADE
);
CREATE INDEX photos_day ON health.photos(user_id, date DESC, id);
CREATE TABLE health.documents (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  file_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'document' CHECK (purpose = 'document'),
  date date NOT NULL CHECK (date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  kind text NOT NULL CHECK (kind IN ('lab','report','imaging','other')),
  note text NOT NULL CHECK (length(note) <= 500),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, file_id),
  FOREIGN KEY (user_id, file_id, purpose) REFERENCES health.files(user_id, id, purpose) ON DELETE CASCADE
);
CREATE INDEX documents_day ON health.documents(user_id, date DESC, id);
CREATE TABLE health.lab_results (
  user_id uuid NOT NULL REFERENCES health.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  document_id uuid NOT NULL,
  date date NOT NULL CHECK (date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  value_type text NOT NULL CHECK (value_type IN ('number','text')),
  value_number numeric CHECK (value_number BETWEEN '-1.7976931348623157e308'::numeric AND '1.7976931348623157e308'::numeric),
  value_operator text CHECK (value_operator IN ('eq','lt','lte','gt','gte')),
  value_text text CHECK (length(btrim(value_text)) BETWEEN 1 AND 120),
  unit text NOT NULL CHECK (length(unit) <= 40),
  reference text NOT NULL CHECK (length(reference) <= 160),
  note text NOT NULL CHECK (length(note) <= 500),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, document_id) REFERENCES health.documents(user_id, id) ON DELETE CASCADE,
  CHECK ((value_type = 'number' AND value_number IS NOT NULL AND value_operator IS NOT NULL AND value_text IS NULL)
    OR (value_type = 'text' AND value_number IS NULL AND value_operator IS NULL AND value_text IS NOT NULL))
);
CREATE INDEX lab_results_document ON health.lab_results(user_id, document_id, date DESC, id);
CREATE INDEX lab_results_history ON health.lab_results(user_id, date DESC, id);

ALTER TABLE health.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.files FORCE ROW LEVEL SECURITY;
CREATE POLICY files_owner ON health.files TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
ALTER TABLE health.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.photos FORCE ROW LEVEL SECURITY;
CREATE POLICY photos_owner ON health.photos TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
ALTER TABLE health.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_owner ON health.documents TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
ALTER TABLE health.lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.lab_results FORCE ROW LEVEL SECURITY;
CREATE POLICY lab_results_owner ON health.lab_results TO health_runtime
  USING (user_id = nullif(current_setting('health.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('health.user_id', true), '')::uuid);
GRANT SELECT, INSERT, DELETE ON health.files TO health_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON health.photos, health.documents, health.lab_results TO health_runtime;
