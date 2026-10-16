CREATE FUNCTION health.lock_account_for_login(owner uuid, encoded text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM 1 FROM health.users WHERE id=owner AND password_hash=encoded
    AND (NOT email_required OR email_verified_at IS NOT NULL) FOR UPDATE;
  RETURN FOUND;
END $$;

CREATE FUNCTION health.begin_email_binding(owner uuid, address text, encoded text, digest text, moment timestamptz)
RETURNS TABLE(email text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE account health.users;
BEGIN
  IF address IS NULL OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$'
     OR moment IS NULL OR NOT isfinite(moment) THEN RETURN; END IF;
  SELECT * INTO account FROM health.users WHERE id=owner FOR UPDATE;
  IF NOT FOUND OR account.password_hash IS DISTINCT FROM encoded OR account.email IS NOT NULL
     OR moment < account.created_at OR EXISTS (SELECT FROM health.users u WHERE lower(u.email)=lower(address)) THEN RETURN; END IF;
  INSERT INTO health.account_tokens AS t(token_hash,user_id,purpose,email,created_at,expires_at)
    VALUES (digest,owner,'verify_email',address::health.email_address,moment,moment+interval '1 hour')
  ON CONFLICT (user_id,purpose) DO UPDATE SET token_hash=EXCLUDED.token_hash,email=EXCLUDED.email,
    created_at=EXCLUDED.created_at,expires_at=EXCLUDED.expires_at,consumed_at=NULL
  WHERE t.created_at<=moment-interval '1 minute';
  IF FOUND THEN RETURN QUERY SELECT address; END IF;
END $$;

CREATE OR REPLACE FUNCTION health.complete_account_token(digest text, operation text, encoded text, moment timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
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
     OR moment<ticket.created_at OR moment>=ticket.expires_at
     OR (account.email::text IS DISTINCT FROM ticket.email::text AND NOT (operation='verify_email' AND account.email IS NULL))
     OR (operation='reset_password' AND account.email_verified_at IS NULL)
     OR (operation='verify_email' AND account.email_verified_at IS NOT NULL) THEN RETURN false; END IF;
  UPDATE health.users SET password_hash=encoded,email=ticket.email,
    email_verified_at=CASE WHEN operation='verify_email' THEN moment ELSE email_verified_at END WHERE id=owner;
  UPDATE health.account_tokens SET consumed_at=moment WHERE token_hash=digest;
  DELETE FROM health.account_tokens WHERE user_id=owner AND token_hash<>digest;
  DELETE FROM health.sessions WHERE user_id=owner;
  RETURN true;
EXCEPTION WHEN unique_violation THEN RETURN false;
END $$;

REVOKE ALL ON FUNCTION health.lock_account_for_login(uuid,text),
  health.begin_email_binding(uuid,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION health.lock_account_for_login(uuid,text),
  health.begin_email_binding(uuid,text,text,text,timestamptz) TO health_runtime;
