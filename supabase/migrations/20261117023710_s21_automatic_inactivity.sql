-- Six closed months with confirmed NO participation change ACTIVO to INACTIVO.
-- All routines stay inside the private s21 schema and run with the caller's privileges.
CREATE OR REPLACE FUNCTION s21.inactivity_report_confirmed(p_state text,p_participation text,p_quality text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,s21 AS $$
DECLARE quality_value jsonb;
BEGIN
 IF coalesce(p_state,'') NOT IN ('submitted','corrected') OR p_participation IS DISTINCT FROM 'NO' THEN RETURN false; END IF;
 BEGIN quality_value:=p_quality::jsonb; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 RETURN coalesce(jsonb_typeof(quality_value)='array' AND NOT (quality_value ? 'duplicado_conflictivo'),false);
END;$$;

CREATE OR REPLACE FUNCTION s21.inactivity_candidates(
 p_as_of date DEFAULT (now() AT TIME ZONE 'America/Lima')::date,
 p_publisher_id text DEFAULT NULL
)
RETURNS TABLE(publisher_id text,effective_month text,streak_start text,streak_end text,consecutive_months integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,s21 AS $$
 WITH calendar AS (
  SELECT to_char(p_as_of,'YYYY-MM') AS current_month,
   (date_trunc('month',p_as_of)-interval '1 month')::date AS closed_month
 ),eligible_publishers AS (
  SELECT p.id,p.status,greatest(p.historical_since,coalesce((
   SELECT max(h.start_month) FROM s21.histories h
   WHERE h.publisher_id=p.id AND h.kind='status' AND h.start_month<=c.current_month
  ),p.historical_since)) AS since_month
  FROM s21.publishers p CROSS JOIN calendar c
  WHERE p.status='ACTIVO' AND (p_publisher_id IS NULL OR p.id=p_publisher_id)
   AND p.historical_since ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
   AND coalesce((SELECT h.value FROM s21.histories h WHERE h.publisher_id=p.id AND h.kind='status'
    AND h.start_month<=c.current_month AND coalesce(h.end_month,'9999-12')>=c.current_month
    ORDER BY h.start_month DESC LIMIT 1),p.status)='ACTIVO'
 ),ordered_months AS (
  SELECT p.id,to_date(r.month,'YYYY-MM') AS month_date,
   row_number() OVER(PARTITION BY p.id ORDER BY r.month DESC) AS month_number
  FROM eligible_publishers p JOIN s21.reports r ON r.publisher_id=p.id CROSS JOIN calendar c
  WHERE r.month>=p.since_month AND r.month<=to_char(c.closed_month,'YYYY-MM')
   AND s21.inactivity_report_confirmed(r.state,r.participation,r.quality)
   AND coalesce((SELECT h.value FROM s21.histories h WHERE h.publisher_id=p.id AND h.kind='status'
    AND h.start_month<=r.month AND coalesce(h.end_month,'9999-12')>=r.month
    ORDER BY h.start_month DESC LIMIT 1),p.status)='ACTIVO'
 ),trailing_runs AS (
  SELECT m.id,min(m.month_date) AS first_month,max(m.month_date) AS last_month,count(*)::integer AS length
  FROM ordered_months m CROSS JOIN calendar c
  WHERE m.month_date+(m.month_number-1)*interval '1 month'=c.closed_month
  GROUP BY m.id HAVING count(*)>=6
 )
 SELECT r.id,to_char(r.first_month+interval '5 months','YYYY-MM'),
  to_char(r.first_month,'YYYY-MM'),to_char(r.last_month,'YYYY-MM'),r.length
 FROM trailing_runs r;
$$;

CREATE OR REPLACE FUNCTION s21.apply_automatic_inactivity(
 p_as_of date DEFAULT (now() AT TIME ZONE 'America/Lima')::date,
 p_publisher_id text DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,s21 AS $$
DECLARE
 candidate record; previous_publisher s21.publishers%ROWTYPE; active_history s21.histories%ROWTYPE;
 before_histories jsonb; after_histories jsonb; after_publisher jsonb;
 next_start text; inactive_end text; baseline_start text; new_status text; reason_text text;
 changed integer:=0;
BEGIN
 -- Use the same transaction lock as the API, including report corrections and imports.
 PERFORM pg_advisory_xact_lock(hashtextextended('s21:mutation',0));
 -- A partially loaded import cannot establish the six-month sequence reliably.
 IF EXISTS(SELECT 1 FROM s21.imports i WHERE i.summary::jsonb->>'state'='loading') THEN RETURN 0; END IF;
 FOR candidate IN SELECT * FROM s21.inactivity_candidates(p_as_of,p_publisher_id) ORDER BY publisher_id LOOP
  SELECT * INTO previous_publisher FROM s21.publishers p WHERE p.id=candidate.publisher_id AND p.status='ACTIVO' FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.start_month),'[]'::jsonb)
   INTO before_histories FROM s21.histories h WHERE h.publisher_id=candidate.publisher_id AND h.kind='status';
  reason_text:='Seis meses cerrados consecutivos con participación NO. Período: '||candidate.streak_start||' a '||candidate.effective_month||'.';
  SELECT min(h.start_month) INTO next_start FROM s21.histories h
   WHERE h.publisher_id=candidate.publisher_id AND h.kind='status' AND h.start_month>candidate.effective_month;
  inactive_end:=CASE WHEN next_start IS NULL THEN NULL ELSE to_char(to_date(next_start,'YYYY-MM')-interval '1 month','YYYY-MM') END;
  SELECT * INTO active_history FROM s21.histories h WHERE h.publisher_id=candidate.publisher_id AND h.kind='status'
   AND h.start_month<=candidate.effective_month AND coalesce(h.end_month,'9999-12')>=candidate.effective_month
   ORDER BY h.start_month DESC LIMIT 1 FOR UPDATE;
  IF active_history.id IS NOT NULL AND active_history.start_month=candidate.effective_month THEN
   UPDATE s21.histories SET value='INACTIVO',end_month=inactive_end,notes=reason_text,origin='automatic',
    unverified=0,created_by='Sistema',version=version+1 WHERE id=active_history.id;
  ELSE
   IF active_history.id IS NOT NULL THEN
    UPDATE s21.histories SET end_month=to_char(to_date(candidate.effective_month,'YYYY-MM')-interval '1 month','YYYY-MM'),
     version=version+1 WHERE id=active_history.id;
   END IF;
   INSERT INTO s21.histories(id,publisher_id,kind,value,start_month,end_month,notes,origin,unverified,created_by)
    VALUES(gen_random_uuid()::text,candidate.publisher_id,'status','INACTIVO',candidate.effective_month,inactive_end,
     reason_text,'automatic',0,'Sistema');
  END IF;

  -- Preserve the previous ACTIVO fallback for earlier months that have records but no status interval.
  SELECT least(previous_publisher.historical_since,coalesce(min(r.month),previous_publisher.historical_since))
   INTO baseline_start FROM s21.reports r WHERE r.publisher_id=candidate.publisher_id
    AND r.month<candidate.effective_month AND r.month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$';
  WITH uncovered AS (
   SELECT m::date AS month_date FROM generate_series(to_date(baseline_start,'YYYY-MM'),
    to_date(candidate.effective_month,'YYYY-MM')-interval '1 month',interval '1 month') m
   WHERE NOT EXISTS(SELECT 1 FROM s21.histories h WHERE h.publisher_id=candidate.publisher_id AND h.kind='status'
    AND h.start_month<=to_char(m,'YYYY-MM') AND coalesce(h.end_month,'9999-12')>=to_char(m,'YYYY-MM'))
  ),numbered AS (
   SELECT month_date,month_date-row_number() OVER(ORDER BY month_date)*interval '1 month' AS island FROM uncovered
  )
  INSERT INTO s21.histories(id,publisher_id,kind,value,start_month,end_month,notes,origin,unverified,created_by)
   SELECT gen_random_uuid()::text,candidate.publisher_id,'status','ACTIVO',to_char(min(month_date),'YYYY-MM'),
    to_char(max(month_date),'YYYY-MM'),'Estado anterior conservado al aplicar la regla automática.',
    'automatic_baseline',1,'Sistema' FROM numbered GROUP BY island;

  SELECT coalesce((SELECT h.value FROM s21.histories h WHERE h.publisher_id=candidate.publisher_id AND h.kind='status'
   AND h.start_month<=to_char(p_as_of,'YYYY-MM') AND coalesce(h.end_month,'9999-12')>=to_char(p_as_of,'YYYY-MM')
   ORDER BY h.start_month DESC LIMIT 1),previous_publisher.status) INTO new_status;
  UPDATE s21.publishers SET status=new_status,version=version+1 WHERE id=candidate.publisher_id;
  SELECT to_jsonb(p) INTO after_publisher FROM s21.publishers p WHERE p.id=candidate.publisher_id;
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.start_month),'[]'::jsonb)
   INTO after_histories FROM s21.histories h WHERE h.publisher_id=candidate.publisher_id AND h.kind='status';
  INSERT INTO s21.audit(id,at,actor,action,entity,entity_id,before_json,after_json,reason)
   VALUES(gen_random_uuid()::text,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Sistema','Inactivar automáticamente','publishers',candidate.publisher_id,
    jsonb_build_object('publisher',to_jsonb(previous_publisher),'status_history',before_histories)::text,
    jsonb_build_object('publisher',after_publisher,'status_history',after_histories)::text,reason_text);
  changed:=changed+1;
 END LOOP;
 RETURN changed;
END;$$;

CREATE OR REPLACE FUNCTION s21.evaluate_inactivity_after_report()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,s21 AS $$
BEGIN
 IF NEW.month<=to_char(date_trunc('month',now() AT TIME ZONE 'America/Lima')-interval '1 month','YYYY-MM') THEN
  PERFORM s21.apply_automatic_inactivity((now() AT TIME ZONE 'America/Lima')::date,NEW.publisher_id);
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER reports_automatic_inactivity AFTER INSERT OR UPDATE OF participation,state,quality,month,publisher_id
 ON s21.reports FOR EACH ROW EXECUTE FUNCTION s21.evaluate_inactivity_after_report();

CREATE OR REPLACE FUNCTION s21.evaluate_inactivity_after_import()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,s21 AS $$
BEGIN
 IF NEW.summary::jsonb->>'state'='completed' THEN PERFORM s21.apply_automatic_inactivity(); END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER imports_automatic_inactivity AFTER INSERT OR UPDATE OF summary
 ON s21.imports FOR EACH ROW EXECUTE FUNCTION s21.evaluate_inactivity_after_import();

REVOKE EXECUTE ON FUNCTION s21.inactivity_report_confirmed(text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION s21.inactivity_candidates(date,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION s21.apply_automatic_inactivity(date,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION s21.evaluate_inactivity_after_report() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION s21.evaluate_inactivity_after_import() FROM PUBLIC;

-- pg_cron is available on hosted Supabase; local PGlite tests exercise the routines and triggers.
DO $schedule$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') THEN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('s21-automatic-inactivity','15 5 * * *',
   $command$SET statement_timeout='30s'; SELECT s21.apply_automatic_inactivity();$command$);
 END IF;
END;$schedule$;

-- Apply the same validated rule to existing records once when it is installed.
SELECT s21.apply_automatic_inactivity();

