import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { and, desc, eq } from 'drizzle-orm';
import {
  ROUTES,
  CONSENT_VERSION,
  MAX_PHOTO_BYTES,
  tryonRequestSchema,
  cabinAddSchema,
  lookupSchema,
  profileUpdateSchema,
  profileCreateSchema,
  consentSchema,
} from '@aida/shared';
import * as schema from './db/schema';
import { getDb } from './db/client';
import type { Env } from './env';
import { stubAuth, tenantFromApiKey } from './auth';
import { getCredits } from './credits';
import { runTryon, imageUrl, TryonError, getTryonById, lookupResults } from './tryon';
import { activeProfile, createProfile, listProfiles, nextBodyVersion, profileSummary, setActiveProfile } from './profiles';
import { avatarKey, buildAvatar, closeupKey } from './avatar';
import { seed } from './seed';
import { newId, decodeKey, sha256Hex } from './util';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.get(ROUTES.health, (c) => c.json({ ok: true, service: 'aida-api', consentVersion: CONSENT_VERSION, ts: Date.now() }));

app.post('/v1/dev/seed', async (c) => {
  if (c.env.ENVIRONMENT === 'production') return c.json({ error: 'forbidden' }, 403);
  return c.json(await seed(getDb(c.env.DB)));
});

app.get('/v1/credits', async (c) => {
  const credits = await getCredits(getDb(c.env.DB), stubAuth().userId);
  return c.json({ credits });
});

// The ACTIVE profile (the person currently trying clothes on).
app.get(ROUTES.profile, async (c) => {
  const { userId } = stubAuth();
  const db = getDb(c.env.DB);
  const p = await activeProfile(db, userId);
  const u = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  return c.json({
    ...profileSummary(p),
    displayName: u?.displayName ?? 'admin',
    bodyVersion: p.bodyVersion,
    heightCm: p.heightCm ?? undefined,
    weightKg: p.weightKg ?? undefined,
    gender: p.gender ?? undefined,
    consentVersion: u?.consentVersion ?? undefined,
  });
});

app.patch(ROUTES.profile, async (c) => {
  const { userId } = stubAuth();
  const db = getDb(c.env.DB);
  let body;
  try {
    body = profileUpdateSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'bad_request', detail: String(e) }, 400);
  }
  const p = await activeProfile(db, userId);
  await db
    .update(schema.profiles)
    .set({
      name: body.name?.trim() || null,
      heightCm: body.heightCm ?? null,
      weightKg: body.weightKg ?? null,
      gender: body.gender ?? null,
      updatedAt: Date.now(),
    })
    .where(eq(schema.profiles.id, p.id))
    .run();
  return c.json({ ok: true });
});

// New photo for the ACTIVE profile → new photo version + its face avatar (SAM 3.1).
app.post(ROUTES.profilePhoto, async (c) => {
  const { userId, tenantId } = stubAuth();
  const db = getDb(c.env.DB);
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength) return c.json({ error: 'empty' }, 400);
  if (buf.byteLength > MAX_PHOTO_BYTES) return c.json({ error: 'too_large' }, 413);
  const p = await activeProfile(db, userId);
  const photoId = newId('pho');
  const key = `bodies/${tenantId}/${userId}/${photoId}.webp`;
  await c.env.BUCKET.put(key, buf, { httpMetadata: { contentType: 'image/webp' } });
  await db
    .insert(schema.userPhotos)
    .values({ id: photoId, userId, profileId: p.id, r2Key: key, isPrimary: true, status: 'ready', createdAt: Date.now() })
    .run();
  const nextVer = await nextBodyVersion(db, userId);
  await db
    .update(schema.profiles)
    .set({ primaryPhotoId: photoId, bodyVersion: nextVer, updatedAt: Date.now() })
    .where(eq(schema.profiles.id, p.id))
    .run();
  const updated = { ...p, primaryPhotoId: photoId, bodyVersion: nextVer };
  await buildAvatar(c.env, db, tenantId, updated);
  return c.json({ ok: true, photoId, bodyVersion: nextVer, avatarUrl: profileSummary(updated).avatarUrl });
});

// The ACTIVE profile's current body photo (shown on the Profile page). 404 when there is none.
app.get(ROUTES.profilePhoto, async (c) => {
  const { userId } = stubAuth();
  const db = getDb(c.env.DB);
  const p = await activeProfile(db, userId);
  const photo = p.primaryPhotoId
    ? await db.select().from(schema.userPhotos).where(eq(schema.userPhotos.id, p.primaryPhotoId)).get()
    : undefined;
  const obj = photo ? await c.env.BUCKET.get(photo.r2Key) : null;
  if (!obj) return c.json({ error: 'no_photo' }, 404);
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'image/webp', 'Cache-Control': 'private, no-store' },
  });
});

// ── Profiles: several people on one account; one is active everywhere (site, extension, SDK). ──
app.get(ROUTES.profiles, async (c) => {
  const { userId } = stubAuth();
  const db = getDb(c.env.DB);
  const active = await activeProfile(db, userId);
  const all = await listProfiles(db, userId);
  return c.json({ activeId: active.id, profiles: all.map(profileSummary) });
});

// New (empty) profile — it becomes the active one, ready for its photo.
app.post(ROUTES.profiles, async (c) => {
  const { userId } = stubAuth();
  const db = getDb(c.env.DB);
  let body;
  try {
    body = profileCreateSchema.parse(await c.req.json().catch(() => ({})));
  } catch (e) {
    return c.json({ error: 'bad_request', detail: String(e) }, 400);
  }
  const p = await createProfile(db, userId, body.name?.trim() || null);
  await setActiveProfile(db, userId, p.id);
  return c.json(profileSummary(p));
});

app.post('/v1/profiles/:id/activate', async (c) => {
  const { userId } = stubAuth();
  const db = getDb(c.env.DB);
  const p = (await listProfiles(db, userId)).find((x) => x.id === c.req.param('id'));
  if (!p) return c.json({ error: 'not_found' }, 404);
  await setActiveProfile(db, userId, p.id);
  return c.json({ ok: true, activeId: p.id });
});

// Delete one profile with everything it owns (photos, avatar, face close-ups, try-ons, Cabin). An account keeps at least one.
app.delete('/v1/profiles/:id', async (c) => {
  const { userId, tenantId } = stubAuth();
  const db = getDb(c.env.DB);
  const all = await listProfiles(db, userId);
  const p = all.find((x) => x.id === c.req.param('id'));
  if (!p) return c.json({ error: 'not_found' }, 404);
  if (all.length <= 1) return c.json({ error: 'last_profile', detail: 'An account keeps at least one profile.' }, 400);
  const photos = await db.select().from(schema.userPhotos).where(eq(schema.userPhotos.profileId, p.id)).all();
  const results = await db.select().from(schema.tryonResults).where(eq(schema.tryonResults.profileId, p.id)).all();
  const keys = [
    ...photos.map((x) => x.r2Key),
    ...photos.map((x) => closeupKey(tenantId, userId, x.id)),
    ...results.map((r) => r.resultR2Key),
    p.avatarR2Key,
  ].filter((k): k is string => !!k);
  if (keys.length) await c.env.BUCKET.delete(keys);
  await db.delete(schema.cabinItems).where(eq(schema.cabinItems.profileId, p.id)).run();
  await db.delete(schema.tryonResults).where(eq(schema.tryonResults.profileId, p.id)).run();
  await db.delete(schema.userPhotos).where(eq(schema.userPhotos.profileId, p.id)).run();
  await db.delete(schema.profiles).where(eq(schema.profiles.id, p.id)).run();
  const active = await activeProfile(db, userId); // re-points to a remaining profile if this one was active
  return c.json({ ok: true, activeId: active.id });
});

// Face avatar of a profile (built on first request if the photo is newer than the avatar).
app.get('/v1/profiles/:id/avatar', async (c) => {
  const { userId, tenantId } = stubAuth();
  const db = getDb(c.env.DB);
  const p = (await listProfiles(db, userId)).find((x) => x.id === c.req.param('id'));
  if (!p?.primaryPhotoId) return c.json({ error: 'no_avatar' }, 404);
  let key = p.avatarR2Key === avatarKey(tenantId, p) ? p.avatarR2Key : null;
  if (!key) key = await buildAvatar(c.env, db, tenantId, p);
  const obj = key ? await c.env.BUCKET.get(key) : null;
  if (!obj) return c.json({ error: 'no_avatar' }, 404);
  return new Response(obj.body, {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
});

app.post(ROUTES.tryon, async (c) => {
  const ctx = stubAuth();
  const db = getDb(c.env.DB);
  let body;
  try {
    body = tryonRequestSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'bad_request', detail: String(e) }, 400);
  }
  try {
    const out = await runTryon(c.env, db, ctx, body.garmentImageUrl, body.pageUrl, body.productRef, body.category, body.batchId);
    return c.json(out.result);
  } catch (e) {
    if (e instanceof TryonError) return c.json({ error: e.code, detail: e.message }, 400);
    return c.json({ error: 'tryon_failed', detail: String((e as Error).message) }, 500);
  }
});

// Status of one try-on result.
app.get('/v1/tryon/:id', async (c) => {
  const db = getDb(c.env.DB);
  const r = await getTryonById(db, c.req.param('id'));
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json(r);
});

// Cache-only: which of these page images already have a try-on (re-applied on load, never generates).
app.post('/v1/lookup', async (c) => {
  const ctx = stubAuth();
  const db = getDb(c.env.DB);
  let body;
  try {
    body = lookupSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'bad_request', detail: String(e) }, 400);
  }
  const results = await lookupResults(db, ctx, body.garmentImageUrls);
  return c.json({ results });
});

app.post(ROUTES.cabin, async (c) => {
  const ctx = stubAuth();
  const db = getDb(c.env.DB);
  let body;
  try {
    body = cabinAddSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'bad_request', detail: String(e) }, 400);
  }
  try {
    const out = await runTryon(c.env, db, ctx, body.garmentImageUrl, body.pageUrl, body.productRef, 'auto', body.batchId);
    const itemId = newId('cab');
    await db
      .insert(schema.cabinItems)
      .values({
        id: itemId,
        userId: ctx.userId,
        profileId: out.profileId,
        garmentId: out.garmentId,
        sourcePageUrl: body.pageUrl,
        name: body.name ?? null,
        status: out.result.status,
        addedAt: Date.now(),
        batchId: body.batchId ?? null,
      })
      .run();
    return c.json({
      id: itemId,
      resultId: out.result.id,
      name: body.name,
      garmentImageUrl: body.garmentImageUrl,
      pageUrl: body.pageUrl,
      resultUrl: out.result.resultUrl,
      status: out.result.status,
      addedAt: Date.now(),
    });
  } catch (e) {
    if (e instanceof TryonError) return c.json({ error: e.code, detail: e.message }, 400);
    return c.json({ error: 'tryon_failed', detail: String((e as Error).message) }, 500);
  }
});

app.get(ROUTES.cabin, async (c) => {
  const ctx = stubAuth();
  const db = getDb(c.env.DB);
  const profile = await activeProfile(db, ctx.userId); // each profile has its own Cabin
  const items = await db
    .select()
    .from(schema.cabinItems)
    .where(and(eq(schema.cabinItems.userId, ctx.userId), eq(schema.cabinItems.profileId, profile.id)))
    .orderBy(desc(schema.cabinItems.addedAt))
    .all();
  const out = [];
  for (const it of items) {
    const g = await db.select().from(schema.garments).where(eq(schema.garments.id, it.garmentId)).get();
    let resultUrl: string | undefined;
    let resultId: string | undefined;
    let status = it.status;
    if (g) {
      const tr = await db
        .select()
        .from(schema.tryonResults)
        .where(
          and(
            eq(schema.tryonResults.userId, ctx.userId),
            eq(schema.tryonResults.garmentId, g.id),
            eq(schema.tryonResults.bodyVersion, profile.bodyVersion),
          ),
        )
        .orderBy(desc(schema.tryonResults.createdAt))
        .get();
      if (tr) {
        resultId = tr.id;
        status = tr.status;
        resultUrl = tr.resultR2Key ? imageUrl(tr.resultR2Key) : undefined;
      }
    }
    out.push({
      id: it.id,
      resultId,
      name: it.name ?? undefined,
      garmentImageUrl: g?.sourceImageUrl,
      pageUrl: it.sourcePageUrl,
      resultUrl,
      status,
      addedAt: it.addedAt,
    });
  }
  return c.json({ items: out });
});

app.delete('/v1/cabin/:id', async (c) => {
  const db = getDb(c.env.DB);
  await db.delete(schema.cabinItems).where(eq(schema.cabinItems.id, c.req.param('id'))).run();
  return c.json({ ok: true });
});

app.post(ROUTES.consent, async (c) => {
  const ctx = stubAuth();
  const db = getDb(c.env.DB);
  const body = consentSchema.parse(await c.req.json());
  await db
    .insert(schema.consentRecords)
    .values({
      id: newId('con'),
      userId: ctx.userId,
      version: body.version,
      grantedAt: body.granted ? Date.now() : null,
      withdrawnAt: body.granted ? null : Date.now(),
      ip: c.req.header('cf-connecting-ip') ?? null,
      userAgent: c.req.header('user-agent') ?? null,
    })
    .run();
  await db
    .update(schema.users)
    .set({ consentVersion: body.granted ? body.version : null, consentAt: body.granted ? Date.now() : null })
    .where(eq(schema.users.id, ctx.userId))
    .run();
  return c.json({ ok: true });
});

app.get('/v1/images/:enc', async (c) => {
  const key = decodeKey(c.req.param('enc'));
  if (!key.startsWith('results/')) return c.json({ error: 'forbidden' }, 403);
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType ?? 'image/webp');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
});

app.post(ROUTES.sdkBootstrap, async (c) => {
  const key = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!key) return c.json({ error: 'no_api_key' }, 401);
  const db = getDb(c.env.DB);
  const tenant = await tenantFromApiKey(db, await sha256Hex(key));
  if (!tenant) return c.json({ error: 'invalid_api_key' }, 401);
  const settings = tenant.settings ? (JSON.parse(tenant.settings) as { buttonMode?: string; fullPageEnabled?: boolean }) : {};
  return c.json({
    tenantId: tenant.id,
    buttonMode: settings.buttonMode === 'native' ? 'native' : 'branded',
    fullPageEnabled: !!settings.fullPageEnabled,
    apiBase: new URL(c.req.url).origin,
  });
});

app.post(ROUTES.accountDelete, async (c) => {
  const { userId, tenantId } = stubAuth();
  const db = getDb(c.env.DB);
  // purge R2 objects (body photos, avatars, face close-ups, generated results) of every profile
  const prefixes = ['bodies', 'avatars', 'faces', 'results'].map((p) => `${p}/${tenantId}/${userId}/`);
  for (const prefix of prefixes) {
    const listed = await c.env.BUCKET.list({ prefix });
    await Promise.all(listed.objects.map((o) => c.env.BUCKET.delete(o.key)));
  }
  // purge DB rows, then start over with one empty profile
  await db.delete(schema.cabinItems).where(eq(schema.cabinItems.userId, userId)).run();
  await db.delete(schema.tryonResults).where(eq(schema.tryonResults.userId, userId)).run();
  await db.delete(schema.userPhotos).where(eq(schema.userPhotos.userId, userId)).run();
  await db.delete(schema.profiles).where(eq(schema.profiles.userId, userId)).run();
  await setActiveProfile(db, userId, (await createProfile(db, userId, null)).id);
  await db
    .insert(schema.consentRecords)
    .values({ id: newId('con'), userId, version: CONSENT_VERSION, withdrawnAt: Date.now() })
    .run();
  await db.update(schema.users).set({ consentVersion: null, consentAt: null }).where(eq(schema.users.id, userId)).run();
  return c.json({ ok: true });
});

app.get(ROUTES.adminUsage, async (c) => {
  const db = getDb(c.env.DB);
  const events = await db.select().from(schema.usageEvents).all();
  const hits = events.filter((e) => e.eventType === 'cache_hit').length;
  const misses = events.filter((e) => e.eventType === 'cache_miss').length;
  const lat = events.filter((e) => e.latencyMs).map((e) => e.latencyMs as number);
  const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
  const cost = events.reduce((a, e) => a + (e.costUsd ?? 0), 0);
  const total = hits + misses;
  return c.json({
    tryons: total,
    cacheHits: hits,
    cacheMisses: misses,
    cacheHitRate: total ? Math.round((hits / total) * 100) : 0,
    avgLatencyMs: avg,
    costUsd: Math.round(cost * 100) / 100,
  });
});

export default app;
