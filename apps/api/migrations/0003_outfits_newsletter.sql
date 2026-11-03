-- The product a store photo belongs to (its own page and name), captured where the photo was converted.
ALTER TABLE garments ADD COLUMN product_url TEXT;
ALTER TABLE garments ADD COLUMN name TEXT;

-- The address a profile's person receives store newsletters at (matched to a newsletter's recipients).
ALTER TABLE profiles ADD COLUMN email TEXT;
CREATE INDEX profiles_email ON profiles (email);
-- Where the person stands in the profile photo (SAM boxes), for the Cabin's drop zones. JSON, per photo id.
ALTER TABLE profiles ADD COLUMN figure TEXT;

-- Outfits put together in the Cabin: the profile photo dressed in pieces taken from several try-ons.
CREATE TABLE outfits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  body_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  result_r2_key TEXT,
  items TEXT NOT NULL,
  cost_usd REAL,
  latency_ms INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX outfits_profile ON outfits (profile_id, created_at);

-- Store newsletters: the store's products, sent to a list of addresses. Recipients with a profile photo get
-- the products on themselves; everyone else gets the store's own photos.
CREATE TABLE nl_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  intro TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE nl_products (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  product_url TEXT,
  image_url TEXT NOT NULL,
  price TEXT
);
CREATE INDEX nl_products_campaign ON nl_products (campaign_id);

CREATE TABLE nl_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  email TEXT NOT NULL,
  profile_id TEXT,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX nl_recipients_campaign ON nl_recipients (campaign_id);

-- One product on one personalized recipient: the try-on it shows (or why it shows the store photo).
CREATE TABLE nl_items (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL,
  tryon_result_id TEXT,
  result_r2_key TEXT,
  error TEXT,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX nl_items_pair ON nl_items (recipient_id, product_id);

-- Rendered emails waiting for the mail service (ARKMAIL): one per recipient, ready to send.
CREATE TABLE nl_outbox (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  provider_id TEXT,
  error TEXT
);
CREATE UNIQUE INDEX nl_outbox_recipient ON nl_outbox (recipient_id);
CREATE INDEX nl_outbox_status ON nl_outbox (status);
