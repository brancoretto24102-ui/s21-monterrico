-- Private flags; credentials themselves remain managed and hashed by Supabase Auth.
ALTER TABLE s21.users
 ADD COLUMN must_change_password integer NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1)),
 ADD COLUMN credential_state text NOT NULL DEFAULT 'ready' CHECK (credential_state IN ('pending','provisioning','resetting','changing','ready','error')),
 ADD COLUMN password_not_before timestamptz,
 ADD COLUMN credential_operation text CHECK (credential_operation IN ('provision','reset','change')),
 ADD COLUMN credential_operation_id text;

-- Users authorized without an Auth identity need the administrator to complete their access.
UPDATE s21.users SET must_change_password=1,credential_state='pending',version=version+1 WHERE subject IS NULL;
