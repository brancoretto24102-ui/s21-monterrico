-- S-21 stores private congregation records in its own, non-exposed schema.
CREATE SCHEMA s21;
REVOKE ALL ON SCHEMA s21 FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA s21 REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA s21 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE s21.audit (
id text PRIMARY KEY NOT NULL,
	at text NOT NULL,
	actor text NOT NULL,
	action text NOT NULL,
	entity text NOT NULL,
	entity_id text NOT NULL,
	before_json text,
	after_json text,
	reason text DEFAULT '' NOT NULL
);

CREATE TABLE s21.campaigns (
id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	start_month text NOT NULL,
	end_month text NOT NULL,
	type_id text NOT NULL,
	active integer DEFAULT 1 NOT NULL,
	notes text DEFAULT '' NOT NULL,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.catalogs (
id text PRIMARY KEY NOT NULL,
	category text NOT NULL,
	name text NOT NULL,
	config text DEFAULT '{}' NOT NULL,
	active integer DEFAULT 1 NOT NULL,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.corrections (
id text PRIMARY KEY NOT NULL,
	publisher_id text NOT NULL,
	report_id text NOT NULL,
	month text NOT NULL,
	field text NOT NULL,
	message text NOT NULL,
	state text DEFAULT 'pending' NOT NULL,
	created_by text NOT NULL,
	created_at text NOT NULL,
	resolved_by text,
	resolved_at text,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.groups (
id text PRIMARY KEY NOT NULL,
	code text NOT NULL,
	name text NOT NULL,
	leader_id text,
	assistant_id text,
	notes text DEFAULT '' NOT NULL,
	active integer DEFAULT 1 NOT NULL,
	history text DEFAULT '[]' NOT NULL,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.histories (
id text PRIMARY KEY NOT NULL,
	publisher_id text NOT NULL,
	kind text NOT NULL,
	value text NOT NULL,
	start_month text NOT NULL,
	end_month text,
	campaign_id text,
	notes text DEFAULT '' NOT NULL,
	origin text DEFAULT 'manual' NOT NULL,
	unverified integer DEFAULT 0 NOT NULL,
	created_by text NOT NULL,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.imports (
id text PRIMARY KEY NOT NULL,
	filename text NOT NULL,
	created_at text NOT NULL,
	created_by text NOT NULL,
	summary text NOT NULL
);

CREATE TABLE s21.issues (
id text PRIMARY KEY NOT NULL,
	publisher_id text,
	month text,
	kind text NOT NULL,
	message text NOT NULL,
	details text NOT NULL,
	state text DEFAULT 'pending' NOT NULL,
	resolved_by text,
	resolved_at text,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.periods (
month text PRIMARY KEY NOT NULL,
	state text DEFAULT 'open' NOT NULL,
	notes text DEFAULT '' NOT NULL,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.preaching_types (
id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	counts_hours integer DEFAULT 0 NOT NULL,
	goal_kind text DEFAULT 'none' NOT NULL,
	monthly_goal double precision,
	annual_goal double precision,
	monthly_reference double precision,
	requires_campaign integer DEFAULT 0 NOT NULL,
	versions text DEFAULT '[]' NOT NULL,
	description text DEFAULT '' NOT NULL,
	active integer DEFAULT 1 NOT NULL,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.profiles (
id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	permissions text NOT NULL,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.publishers (
id text PRIMARY KEY NOT NULL,
	code text NOT NULL,
	names text NOT NULL,
	surnames text NOT NULL,
	full_name text NOT NULL,
	alias text NOT NULL,
	gender text NOT NULL,
	birth_date text,
	baptized integer DEFAULT 0 NOT NULL,
	baptism_date text,
	condition text DEFAULT 'OO' NOT NULL,
	role text DEFAULT 'HERMANO' NOT NULL,
	status text DEFAULT 'ACTIVO' NOT NULL,
	group_id text,
	preaching_type_id text DEFAULT 'PUB' NOT NULL,
	notes text DEFAULT '' NOT NULL,
	historical_since text NOT NULL,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.reports (
id text PRIMARY KEY NOT NULL,
	publisher_id text NOT NULL,
	month text NOT NULL,
	group_id text,
	type_id text NOT NULL,
	counts_hours integer DEFAULT 0 NOT NULL,
	participation text,
	hours double precision,
	courses integer,
	comment text DEFAULT '' NOT NULL,
	state text DEFAULT 'draft' NOT NULL,
	quality text DEFAULT '[]' NOT NULL,
	source text DEFAULT 'web' NOT NULL,
	updated_by text NOT NULL,
	updated_at text NOT NULL,
	submitted_at text,
	version integer DEFAULT 1 NOT NULL
);

CREATE TABLE s21.settings (
key text PRIMARY KEY NOT NULL,
	value text NOT NULL
);

CREATE TABLE s21.users (
id text PRIMARY KEY NOT NULL,
	subject text,
	email text NOT NULL,
	name text NOT NULL,
	profile_id text NOT NULL,
	groups_json text DEFAULT '[]' NOT NULL,
	active integer DEFAULT 1 NOT NULL,
	publisher_id text,
	version integer DEFAULT 1 NOT NULL
);

CREATE INDEX audit_at ON s21.audit (at);

CREATE UNIQUE INDEX groups_code ON s21.groups (code);

CREATE INDEX histories_person ON s21.histories (publisher_id,kind,start_month);

CREATE UNIQUE INDEX publishers_code ON s21.publishers (code);

CREATE INDEX publishers_group ON s21.publishers (group_id);

CREATE UNIQUE INDEX report_person_month ON s21.reports (publisher_id,month);

CREATE INDEX reports_month_group ON s21.reports (month,group_id);

CREATE UNIQUE INDEX users_email ON s21.users (email);

CREATE UNIQUE INDEX users_subject ON s21.users (subject);

ALTER TABLE s21.campaigns ADD FOREIGN KEY (type_id) REFERENCES s21.preaching_types(id) ON UPDATE no action ON DELETE no action;

ALTER TABLE s21.corrections ADD FOREIGN KEY (publisher_id) REFERENCES s21.publishers(id) ON UPDATE no action ON DELETE no action;

ALTER TABLE s21.histories ADD FOREIGN KEY (publisher_id) REFERENCES s21.publishers(id) ON UPDATE no action ON DELETE no action;

ALTER TABLE s21.publishers ADD FOREIGN KEY (group_id) REFERENCES s21.groups(id) ON UPDATE no action ON DELETE no action;

ALTER TABLE s21.reports ADD FOREIGN KEY (publisher_id) REFERENCES s21.publishers(id) ON UPDATE no action ON DELETE no action;

ALTER TABLE s21.reports ADD FOREIGN KEY (group_id) REFERENCES s21.groups(id) ON UPDATE no action ON DELETE no action;

ALTER TABLE s21.users ADD FOREIGN KEY (profile_id) REFERENCES s21.profiles(id) ON UPDATE no action ON DELETE no action;
CREATE TABLE s21.assets(id text PRIMARY KEY,content bytea NOT NULL);
CREATE UNIQUE INDEX users_email_lower ON s21.users(lower(email));
ALTER TABLE s21.histories ADD CONSTRAINT history_months CHECK(start_month ~ '^\d{4}-(0[1-9]|1[0-2])$' AND (end_month IS NULL OR end_month ~ '^\d{4}-(0[1-9]|1[0-2])$' AND end_month>=start_month));
ALTER TABLE s21.reports ADD CONSTRAINT report_values CHECK((participation IS NULL OR participation IN('SI','NO')) AND (hours IS NULL OR hours>=0) AND (courses IS NULL OR courses>=0) AND (counts_hours=1 OR hours IS NULL));
CREATE FUNCTION s21.check_history_overlap() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,s21 AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('s21:history:'||NEW.publisher_id||':'||NEW.kind,0));
 IF EXISTS(SELECT 1 FROM s21.histories h WHERE h.publisher_id=NEW.publisher_id AND h.kind=NEW.kind AND h.id<>NEW.id AND h.start_month<=COALESCE(NEW.end_month,'9999-12') AND COALESCE(h.end_month,'9999-12')>=NEW.start_month) THEN
  RAISE EXCEPTION 'Las vigencias se superponen' USING ERRCODE='23P01';
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER histories_overlap BEFORE INSERT OR UPDATE ON s21.histories FOR EACH ROW EXECUTE FUNCTION s21.check_history_overlap();
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='s21' LOOP
  EXECUTE format('ALTER TABLE s21.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON s21.%I FROM PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON s21.%I FROM anon',t); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON s21.%I FROM authenticated',t); END IF;
 END LOOP;
END;$$;
REVOKE EXECUTE ON FUNCTION s21.check_history_overlap() FROM PUBLIC;

-- Initial catalogs and profiles. No personal data.
INSERT INTO s21.profiles(id,name,permissions) VALUES('admin','Administrador','["dashboard","masters.read","publishers.write","groups.write","catalogs.write","assignments.write","reports.write","reports.submit","reports.correct","periods.write","comments.read","groups.all","pdf.single","pdf.bulk","import","audit","users.write","backup"]') ON CONFLICT DO NOTHING;
INSERT INTO s21.profiles(id,name,permissions) VALUES('gestor','Gestor de informes','["dashboard","masters.read","publishers.write","groups.write","catalogs.write","assignments.write","reports.write","reports.submit","reports.correct","periods.write","comments.read","groups.all","pdf.single","pdf.bulk","import","audit"]') ON CONFLICT DO NOTHING;
INSERT INTO s21.profiles(id,name,permissions) VALUES('encargado','Encargado de grupo','["dashboard","masters.read","reports.write","reports.submit","comments.read","pdf.single"]') ON CONFLICT DO NOTHING;
INSERT INTO s21.profiles(id,name,permissions) VALUES('auxiliar','Auxiliar de grupo','["dashboard","masters.read","reports.write","reports.submit","comments.read","pdf.single"]') ON CONFLICT DO NOTHING;
INSERT INTO s21.profiles(id,name,permissions) VALUES('consulta','Consulta','["dashboard","masters.read","comments.read"]') ON CONFLICT DO NOTHING;
INSERT INTO s21.preaching_types(id,name,counts_hours,goal_kind,monthly_goal,annual_goal,monthly_reference,requires_campaign,versions,description) VALUES('PUB','Normal',0,'none',NULL,NULL,NULL,0,'[{"since":"1900-01","id":"PUB","name":"Normal","counts_hours":0,"goal_kind":"none","monthly_goal":null,"annual_goal":null,"monthly_reference":null,"requires_campaign":0,"description":"Participación y cursos bíblicos."}]','Participación y cursos bíblicos.') ON CONFLICT DO NOTHING;
INSERT INTO s21.preaching_types(id,name,counts_hours,goal_kind,monthly_goal,annual_goal,monthly_reference,requires_campaign,versions,description) VALUES('PA','Auxiliar por campaña',1,'monthly',15,NULL,NULL,1,'[{"since":"1900-01","id":"PA","name":"Auxiliar por campaña","counts_hours":1,"goal_kind":"monthly","monthly_goal":15,"annual_goal":null,"monthly_reference":null,"requires_campaign":1,"description":"15 horas durante una campaña autorizada."}]','15 horas durante una campaña autorizada.') ON CONFLICT DO NOTHING;
INSERT INTO s21.preaching_types(id,name,counts_hours,goal_kind,monthly_goal,annual_goal,monthly_reference,requires_campaign,versions,description) VALUES('PAC','Auxiliar de continuo',1,'monthly',30,NULL,NULL,0,'[{"since":"1900-01","id":"PAC","name":"Auxiliar de continuo","counts_hours":1,"goal_kind":"monthly","monthly_goal":30,"annual_goal":null,"monthly_reference":null,"requires_campaign":0,"description":"Responsabilidad continua, con vigencia mensual."}]','Responsabilidad continua, con vigencia mensual.') ON CONFLICT DO NOTHING;
INSERT INTO s21.preaching_types(id,name,counts_hours,goal_kind,monthly_goal,annual_goal,monthly_reference,requires_campaign,versions,description) VALUES('PR','Regular',1,'annual',NULL,600,50,0,'[{"since":"1900-01","id":"PR","name":"Regular","counts_hours":1,"goal_kind":"annual","monthly_goal":null,"annual_goal":600,"monthly_reference":50,"requires_campaign":0,"description":"600 horas anuales. 50 horas mensuales como referencia."}]','600 horas anuales. 50 horas mensuales como referencia.') ON CONFLICT DO NOTHING;
INSERT INTO s21.preaching_types(id,name,counts_hours,goal_kind,monthly_goal,annual_goal,monthly_reference,requires_campaign,versions,description) VALUES('PE','Especial',1,'monthly',90,NULL,NULL,0,'[{"since":"1900-01","id":"PE","name":"Especial","counts_hours":1,"goal_kind":"monthly","monthly_goal":90,"annual_goal":null,"monthly_reference":null,"requires_campaign":0,"description":"Meta mensual inicial de 90 horas."}]','Meta mensual inicial de 90 horas.') ON CONFLICT DO NOTHING;
INSERT INTO s21.preaching_types(id,name,counts_hours,goal_kind,monthly_goal,annual_goal,monthly_reference,requires_campaign,versions,description) VALUES('MIS','Misionero',1,'monthly',120,NULL,NULL,0,'[{"since":"1900-01","id":"MIS","name":"Misionero","counts_hours":1,"goal_kind":"monthly","monthly_goal":120,"annual_goal":null,"monthly_reference":null,"requires_campaign":0,"description":"Meta mensual inicial de 120 horas."}]','Meta mensual inicial de 120 horas.') ON CONFLICT DO NOTHING;
INSERT INTO s21.groups(id,code,name) VALUES('G1','G1','Grupo 1') ON CONFLICT DO NOTHING;
INSERT INTO s21.groups(id,code,name) VALUES('G2','G2','Grupo 2') ON CONFLICT DO NOTHING;
INSERT INTO s21.groups(id,code,name) VALUES('G3','G3','Grupo 3') ON CONFLICT DO NOTHING;
INSERT INTO s21.groups(id,code,name) VALUES('G4','G4','Grupo 4') ON CONFLICT DO NOTHING;
INSERT INTO s21.groups(id,code,name) VALUES('G5','G5','Grupo 5') ON CONFLICT DO NOTHING;
INSERT INTO s21.groups(id,code,name) VALUES('G6','G6','Grupo 6') ON CONFLICT DO NOTHING;
INSERT INTO s21.catalogs(id,category,name) VALUES('ACTIVO','status','Activo') ON CONFLICT DO NOTHING;
INSERT INTO s21.catalogs(id,category,name) VALUES('INACTIVO','status','Inactivo') ON CONFLICT DO NOTHING;
INSERT INTO s21.catalogs(id,category,name) VALUES('EXPULSADO','status','Expulsado') ON CONFLICT DO NOTHING;
INSERT INTO s21.catalogs(id,category,name) VALUES('FALLECIDO','status','Fallecido') ON CONFLICT DO NOTHING;
INSERT INTO s21.catalogs(id,category,name) VALUES('TRASLADADO','status','Trasladado a otra congregación') ON CONFLICT DO NOTHING;
INSERT INTO s21.catalogs(id,category,name) VALUES('HERMANO','role','Hermano(a)') ON CONFLICT DO NOTHING;
INSERT INTO s21.catalogs(id,category,name) VALUES('SM','role','Siervo ministerial') ON CONFLICT DO NOTHING;
INSERT INTO s21.catalogs(id,category,name) VALUES('ANCIANO','role','Anciano') ON CONFLICT DO NOTHING;
INSERT INTO s21.catalogs(id,category,name) VALUES('OO','condition','Otras ovejas') ON CONFLICT DO NOTHING;
INSERT INTO s21.catalogs(id,category,name) VALUES('UNGIDO','condition','Ungido') ON CONFLICT DO NOTHING;
INSERT INTO s21.settings(key,value) VALUES('defaults_v1','1') ON CONFLICT DO NOTHING;
