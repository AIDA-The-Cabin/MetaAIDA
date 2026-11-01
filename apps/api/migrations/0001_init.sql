CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'consumer',
  domains TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  settings TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE tenant_api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX tak_keyhash ON tenant_api_keys (key_hash);
CREATE INDEX tak_tenant ON tenant_api_keys (tenant_id);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  external_auth_id TEXT,
  email TEXT,
  display_name TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'active',
  consent_version TEXT,
  consent_at INTEGER,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  credits INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX users_tenant ON users (tenant_id);

CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY,
  body_version INTEGER NOT NULL DEFAULT 0,
  primary_photo_id TEXT,
  height_cm INTEGER,
  weight_kg INTEGER,
  gender TEXT,
  preferences TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE user_photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  width INTEGER,
  height INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX photos_user ON user_photos (user_id);

CREATE TABLE garments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  image_hash TEXT NOT NULL,
  source_image_url TEXT NOT NULL,
  source_page_url TEXT,
  product_ref TEXT,
  category TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX garments_hash ON garments (tenant_id, image_hash);

CREATE TABLE tryon_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  garment_id TEXT NOT NULL,
  body_version INTEGER NOT NULL,
  cache_key TEXT NOT NULL,
  status TEXT NOT NULL,
  result_r2_key TEXT,
  model_used TEXT,
  latency_ms INTEGER,
  cost_usd REAL,
  error TEXT,
  created_at INTEGER NOT NULL,
  variant TEXT,
  batch_id TEXT
);
CREATE UNIQUE INDEX tryon_cache ON tryon_results (cache_key);
CREATE INDEX tryon_user ON tryon_results (user_id);

CREATE TABLE cabin_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  garment_id TEXT NOT NULL,
  source_page_url TEXT,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'done',
  added_at INTEGER NOT NULL,
  batch_id TEXT
);
CREATE INDEX cabin_user ON cabin_items (user_id);

CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  event_type TEXT NOT NULL,
  garment_id TEXT,
  latency_ms INTEGER,
  cost_usd REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX usage_tenant ON usage_events (tenant_id);

CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  version TEXT NOT NULL,
  granted_at INTEGER,
  withdrawn_at INTEGER,
  ip TEXT,
  user_agent TEXT
);
