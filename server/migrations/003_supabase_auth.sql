ALTER TABLE users ADD COLUMN supabase_user_id UUID UNIQUE;
ALTER TABLE users DROP COLUMN password_hash;
DROP TABLE IF EXISTS auth_sessions;
