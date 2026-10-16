CREATE TABLE health.auth_rate_limits (
  bucket text NOT NULL CHECK (bucket IN ('login','email_issue','email_bind','email_complete')),
  dimension integer NOT NULL CHECK (dimension IN (1,2)),
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 30),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  PRIMARY KEY (bucket,dimension,digest)
);
REVOKE ALL ON health.auth_rate_limits FROM PUBLIC, health_runtime;

CREATE FUNCTION health.take_auth_attempt(p_bucket text, p_ip text, p_identity text, p_now timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE part integer; item text; used integer; quota integer; duration integer; lock_id integer;
BEGIN
  lock_id := CASE p_bucket WHEN 'login' THEN 2011 WHEN 'email_issue' THEN 2012
    WHEN 'email_bind' THEN 2013 WHEN 'email_complete' THEN 2014 ELSE NULL END;
  IF lock_id IS NULL OR p_ip IS NULL OR p_ip !~ '^[a-f0-9]{64}$'
     OR (p_bucket<>'email_complete' AND (p_identity IS NULL OR p_identity !~ '^[a-f0-9]{64}$'))
     OR (p_bucket='email_complete' AND p_identity IS NOT NULL)
     OR p_now IS NULL OR NOT isfinite(p_now) THEN
    RAISE EXCEPTION 'invalid rate parameters' USING ERRCODE='23514';
  END IF;
  -- One bounded namespace per operation; this also serializes insertion/quota checks.
  PERFORM pg_advisory_xact_lock(1729,lock_id);
  DELETE FROM health.auth_rate_limits WHERE bucket=p_bucket AND expires_at<=p_now;
  FOR part IN 1..CASE WHEN p_bucket='email_complete' THEN 1 ELSE 2 END LOOP
    item := CASE WHEN part=1 THEN p_ip ELSE p_identity END;
    quota := CASE WHEN p_bucket='email_complete' THEN 10 WHEN part=1 THEN 30 ELSE 5 END;
    duration := CASE WHEN p_bucket='email_complete' OR part=2 THEN 900 ELSE 60 END;
    SELECT attempts INTO used FROM health.auth_rate_limits
      WHERE bucket=p_bucket AND dimension=part AND digest=item;
    IF FOUND THEN
      IF used>=quota THEN RETURN false; END IF;
      UPDATE health.auth_rate_limits SET attempts=attempts+1
        WHERE bucket=p_bucket AND dimension=part AND digest=item;
    ELSE
      IF (SELECT count(*) FROM health.auth_rate_limits WHERE bucket=p_bucket)>=10000 THEN RETURN false; END IF;
      INSERT INTO health.auth_rate_limits VALUES (p_bucket,part,item,1,p_now+duration*interval '1 second');
    END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION health.take_auth_attempt(text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION health.take_auth_attempt(text,text,text,timestamptz) TO health_runtime;
