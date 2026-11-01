-- Several profiles (people) per account; the account keeps one active profile.
-- Photo, avatar, try-ons and Cabin move to the profile; credits and consent stay on the account.
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT,
  body_version INTEGER NOT NULL DEFAULT 0,
  primary_photo_id TEXT,
  avatar_r2_key TEXT,
  height_cm INTEGER,
  weight_kg INTEGER,
  gender TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX profiles_user ON profiles (user_id);

-- Each existing single profile becomes the account's first profile (same photo, version and measurements).
INSERT INTO profiles (id, user_id, name, body_version, primary_photo_id, height_cm, weight_kg, gender, created_at, updated_at)
  SELECT 'prf_' || lower(hex(randomblob(12))), user_id, NULL, body_version, primary_photo_id, height_cm, weight_kg, gender, updated_at, updated_at
  FROM user_profiles;

ALTER TABLE users ADD COLUMN active_profile_id TEXT;
UPDATE users SET active_profile_id = (SELECT p.id FROM profiles p WHERE p.user_id = users.id LIMIT 1);

ALTER TABLE user_photos ADD COLUMN profile_id TEXT;
UPDATE user_photos SET profile_id = (SELECT u.active_profile_id FROM users u WHERE u.id = user_photos.user_id);

ALTER TABLE tryon_results ADD COLUMN profile_id TEXT;
UPDATE tryon_results SET profile_id = (SELECT u.active_profile_id FROM users u WHERE u.id = tryon_results.user_id);

ALTER TABLE cabin_items ADD COLUMN profile_id TEXT;
UPDATE cabin_items SET profile_id = (SELECT u.active_profile_id FROM users u WHERE u.id = cabin_items.user_id);
CREATE INDEX cabin_profile ON cabin_items (profile_id);

DROP TABLE user_profiles;
