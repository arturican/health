ALTER TABLE health.users ADD COLUMN email_required boolean NOT NULL DEFAULT false;
ALTER TABLE health.users ADD CONSTRAINT users_required_email CHECK (NOT email_required OR email IS NOT NULL);

CREATE FUNCTION health.issue_account_token(address text, operation text, digest text, moment timestamptz)
RETURNS TABLE(email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE account health.users;
BEGIN
  IF operation NOT IN ('verify_email', 'reset_password') OR operation IS NULL
     OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR moment IS NULL OR NOT isfinite(moment) THEN
    RAISE EXCEPTION 'invalid token parameters' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO account FROM health.users u WHERE lower(u.email) = lower(address) FOR UPDATE;
  IF NOT FOUND OR moment < account.created_at
     OR (operation = 'verify_email' AND account.email_verified_at IS NOT NULL)
     OR (operation = 'reset_password' AND account.email_verified_at IS NULL) THEN RETURN; END IF;
  INSERT INTO health.account_tokens AS t(token_hash,user_id,purpose,email,created_at,expires_at)
  VALUES (digest,account.id,operation,account.email,moment,
    moment + CASE WHEN operation = 'verify_email' THEN interval '1 hour' ELSE interval '15 minutes' END)
  ON CONFLICT (user_id,purpose) DO UPDATE SET token_hash=EXCLUDED.token_hash,
    email=EXCLUDED.email,created_at=EXCLUDED.created_at,expires_at=EXCLUDED.expires_at,consumed_at=NULL
  WHERE t.created_at <= moment - interval '1 minute';
  IF FOUND THEN RETURN QUERY SELECT account.email::text; END IF;
END $$;

CREATE FUNCTION health.begin_email_registration(address text, zone text, encoded text, digest text, moment timestamptz)
RETURNS TABLE(email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF address IS NULL OR zone IS NULL OR encoded IS NULL OR moment IS NULL OR NOT isfinite(moment) THEN
    RAISE EXCEPTION 'invalid registration parameters' USING ERRCODE = '23514';
  END IF;
  INSERT INTO health.users(id,login,password_hash,timezone,created_at,email,email_required)
  VALUES (gen_random_uuid(),'email-' || replace(gen_random_uuid()::text,'-',''),encoded,zone,moment,
    address::health.email_address,true) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT * FROM health.issue_account_token(address,'verify_email',digest,moment);
END $$;

CREATE FUNCTION health.complete_account_token(digest text, operation text, encoded text, moment timestamptz)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE owner uuid; account health.users; ticket health.account_tokens;
BEGIN
  IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR operation IS NULL
     OR operation NOT IN ('verify_email','reset_password') OR encoded IS NULL
     OR encoded NOT LIKE '$argon2id$%' OR length(encoded)>512
     OR moment IS NULL OR NOT isfinite(moment) THEN RETURN false; END IF;
  SELECT user_id INTO owner FROM health.account_tokens WHERE token_hash=digest;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO account FROM health.users WHERE id=owner FOR UPDATE;
  SELECT * INTO ticket FROM health.account_tokens WHERE token_hash=digest FOR UPDATE;
  IF NOT FOUND OR ticket.purpose<>operation OR ticket.consumed_at IS NOT NULL
     OR moment < ticket.created_at OR moment >= ticket.expires_at
     OR account.email::text IS DISTINCT FROM ticket.email::text
     OR (operation='reset_password' AND account.email_verified_at IS NULL)
     OR (operation='verify_email' AND account.email_verified_at IS NOT NULL) THEN RETURN false; END IF;
  UPDATE health.users SET password_hash=encoded,
    email_verified_at=CASE WHEN operation='verify_email' THEN moment ELSE email_verified_at END WHERE id=owner;
  UPDATE health.account_tokens SET consumed_at=moment WHERE token_hash=digest;
  DELETE FROM health.account_tokens WHERE user_id=owner AND token_hash<>digest;
  DELETE FROM health.sessions WHERE user_id=owner;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION health.issue_account_token(text,text,text,timestamptz),
  health.begin_email_registration(text,text,text,text,timestamptz),
  health.complete_account_token(text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION health.issue_account_token(text,text,text,timestamptz),
  health.begin_email_registration(text,text,text,text,timestamptz),
  health.complete_account_token(text,text,text,timestamptz) TO health_runtime;
