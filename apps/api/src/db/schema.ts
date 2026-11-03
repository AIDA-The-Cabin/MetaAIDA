import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default('consumer'),
  domains: text('domains'),
  status: text('status').notNull().default('active'),
  settings: text('settings'),
  createdAt: integer('created_at').notNull(),
});

export const tenantApiKeys = sqliteTable('tenant_api_keys', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  keyHash: text('key_hash').notNull(),
  label: text('label'),
  createdAt: integer('created_at').notNull(),
  revokedAt: integer('revoked_at'),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  externalAuthId: text('external_auth_id'),
  email: text('email'),
  displayName: text('display_name').notNull().default('admin'),
  status: text('status').notNull().default('active'),
  consentVersion: text('consent_version'),
  consentAt: integer('consent_at'),
  createdAt: integer('created_at').notNull(),
  deletedAt: integer('deleted_at'),
  // 1 generated image = 1 credit (cache hits are free). Decremented atomically per generation.
  credits: integer('credits').notNull().default(0),
  // The profile (person) currently trying clothes on — used by the site, the extension and the SDK.
  activeProfileId: text('active_profile_id'),
});

// One person on the account. Credits and consent stay on the account; photo, avatar, try-ons and the
// Cabin belong to the profile. body_version is unique across the account's profiles (see profiles.ts).
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name'),
  bodyVersion: integer('body_version').notNull().default(0),
  primaryPhotoId: text('primary_photo_id'),
  avatarR2Key: text('avatar_r2_key'),
  heightCm: integer('height_cm'),
  weightKg: integer('weight_kg'),
  gender: text('gender'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  // The address this person receives store newsletters at (newsletter recipients are matched on it).
  email: text('email'),
  // Where the person stands in the profile photo (SAM boxes) for the Cabin's drop zones — JSON, per photo id.
  figure: text('figure'),
});

export const userPhotos = sqliteTable('user_photos', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  profileId: text('profile_id'),
  r2Key: text('r2_key').notNull(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('ready'),
  width: integer('width'),
  height: integer('height'),
  createdAt: integer('created_at').notNull(),
});

export const garments = sqliteTable('garments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  imageHash: text('image_hash').notNull(),
  sourceImageUrl: text('source_image_url').notNull(),
  sourcePageUrl: text('source_page_url'),
  productRef: text('product_ref'),
  category: text('category'),
  createdAt: integer('created_at').notNull(),
  // The product the photo belongs to (its own page, its name), captured where the photo was converted.
  productUrl: text('product_url'),
  name: text('name'),
});

export const tryonResults = sqliteTable('tryon_results', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  profileId: text('profile_id'),
  garmentId: text('garment_id').notNull(),
  bodyVersion: integer('body_version').notNull(),
  cacheKey: text('cache_key').notNull(),
  status: text('status').notNull(),
  resultR2Key: text('result_r2_key'),
  modelUsed: text('model_used'),
  latencyMs: integer('latency_ms'),
  costUsd: real('cost_usd'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  // Cache variant — part of the cache key and the R2 key suffix.
  variant: text('variant'),
  // Groups all generations of one product (page-level "whole page" try-on).
  batchId: text('batch_id'),
});

export const cabinItems = sqliteTable('cabin_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  profileId: text('profile_id'),
  garmentId: text('garment_id').notNull(),
  sourcePageUrl: text('source_page_url'),
  name: text('name'),
  status: text('status').notNull().default('done'),
  addedAt: integer('added_at').notNull(),
  // Links the product card to its batch of generated images (whole-page try-on).
  batchId: text('batch_id'),
});

export const usageEvents = sqliteTable('usage_events', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id'),
  eventType: text('event_type').notNull(),
  garmentId: text('garment_id'),
  latencyMs: integer('latency_ms'),
  costUsd: real('cost_usd'),
  createdAt: integer('created_at').notNull(),
});

export const consentRecords = sqliteTable('consent_records', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  version: text('version').notNull(),
  grantedAt: integer('granted_at'),
  withdrawnAt: integer('withdrawn_at'),
  ip: text('ip'),
  userAgent: text('user_agent'),
});

// Outfits put together in the Cabin: the profile photo dressed in pieces taken from several try-ons.
// items = JSON snapshot of the pieces (slot, try-on, product name and link), kept even if a try-on goes.
export const outfits = sqliteTable('outfits', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  profileId: text('profile_id').notNull(),
  bodyVersion: integer('body_version').notNull(),
  status: text('status').notNull(),
  resultR2Key: text('result_r2_key'),
  items: text('items').notNull(),
  costUsd: real('cost_usd'),
  latencyMs: integer('latency_ms'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
});

// Store newsletters (B2B): the store's products sent to a list of addresses. Recipients with a profile photo
// get the products on themselves, everyone else the store's own photos. Sending is the mail service's job.
export const nlCampaigns = sqliteTable('nl_campaigns', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  storeName: text('store_name').notNull(),
  subject: text('subject').notNull(),
  intro: text('intro'),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const nlProducts = sqliteTable('nl_products', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  position: integer('position').notNull(),
  name: text('name').notNull(),
  productUrl: text('product_url'),
  imageUrl: text('image_url').notNull(),
  price: text('price'),
});

export const nlRecipients = sqliteTable('nl_recipients', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  email: text('email').notNull(),
  profileId: text('profile_id'),
  // 'personal' (a profile with a photo: the products on them) or 'standard' (the store's photos)
  kind: text('kind').notNull(),
  createdAt: integer('created_at').notNull(),
});

// One product on one personal recipient: the try-on it shows, or why it shows the store photo.
export const nlItems = sqliteTable('nl_items', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  recipientId: text('recipient_id').notNull(),
  productId: text('product_id').notNull(),
  status: text('status').notNull(),
  tryonResultId: text('tryon_result_id'),
  resultR2Key: text('result_r2_key'),
  error: text('error'),
  updatedAt: integer('updated_at').notNull(),
});

// Rendered emails waiting for the mail service: one per recipient.
export const nlOutbox = sqliteTable('nl_outbox', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  recipientId: text('recipient_id').notNull(),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  html: text('html').notNull(),
  text: text('text').notNull(),
  kind: text('kind').notNull(),
  // 'ready' → the mail service sends it → 'sent' (or 'failed' with error)
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
  sentAt: integer('sent_at'),
  providerId: text('provider_id'),
  error: text('error'),
});
