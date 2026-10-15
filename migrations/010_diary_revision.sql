ALTER TABLE health.settings ADD COLUMN change_revision bigint NOT NULL DEFAULT 0
  CHECK (change_revision BETWEEN 0 AND 9007199254740991);
