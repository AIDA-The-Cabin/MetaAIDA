import { and, eq } from 'drizzle-orm';
import { ROUTES, type TryonResult, type TryonStatus } from '@aida/shared';
import * as schema from './db/schema';
import type { DB } from './db/client';
import type { Env } from './env';
import { newId, sha256Hex, dataUri, fetchImageAsDataUri, encodeKey } from './util';
import {
  metaTryon,
  metaSceneTryon,
  MetaBlockedError,
  META_IMAGE_MODEL,
  META_COST_USD,
  META_VARIANT,
  META_SCENE_VARIANT,
} from './meta';
import { faceCloseup } from './avatar';
import { storeScene } from './scene';
import { chargeCredit, getCredits } from './credits';
import { activeProfile, type ProfileRow } from './profiles';

export class TryonError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function imageUrl(r2Key: string): string {
  return ROUTES.images(encodeKey(r2Key));
}

async function logUsage(
  db: DB,
  tenantId: string,
  userId: string,
  eventType: string,
  extra: { garmentId?: string; latencyMs?: number; costUsd?: number } = {},
) {
  await db
    .insert(schema.usageEvents)
    .values({
      id: newId('ue'),
      tenantId,
      userId,
      eventType,
      garmentId: extra.garmentId ?? null,
      latencyMs: extra.latencyMs ?? null,
      costUsd: extra.costUsd ?? null,
      createdAt: Date.now(),
    })
    .run();
}

export async function resolveGarment(
  db: DB,
  tenantId: string,
  garmentImageUrl: string,
  pageUrl: string,
  productRef?: string,
  category?: string,
) {
  const imageHash = await sha256Hex(garmentImageUrl);
  let g = await db
    .select()
    .from(schema.garments)
    .where(and(eq(schema.garments.tenantId, tenantId), eq(schema.garments.imageHash, imageHash)))
    .get();
  if (!g) {
    await db
      .insert(schema.garments)
      .values({
        id: newId('grm'),
        tenantId,
        imageHash,
        sourceImageUrl: garmentImageUrl,
        sourcePageUrl: pageUrl,
        productRef: productRef ?? null,
        category: category ?? null,
        createdAt: Date.now(),
      })
      .run();
    g = await db
      .select()
      .from(schema.garments)
      .where(and(eq(schema.garments.tenantId, tenantId), eq(schema.garments.imageHash, imageHash)))
      .get();
  }
  return g!;
}

export interface TryonOutcome {
  result: TryonResult;
  garmentId: string;
  profileId: string;
}

type GarmentRow = typeof schema.garments.$inferSelect;
type ResultRow = typeof schema.tryonResults.$inferSelect;

/** One cached try-on per (user, photo version, garment, variant). Photo versions are unique per account. */
export function cacheKeyFor(userId: string, bodyVersion: number, garmentId: string, variant: string): Promise<string> {
  return sha256Hex(`${userId}:${bodyVersion}:${garmentId}:${variant}`);
}

/** Newest first: a try-on in the store's scene beats one on the customer's own photo. */
export const VARIANTS = [META_SCENE_VARIANT, META_VARIANT];

/** Load the profile's current body photo + the garment image as data URIs (for Muse Image). */
async function prepareInputs(
  env: Env,
  db: DB,
  profile: ProfileRow,
  garment: GarmentRow,
): Promise<{ bodyB64: string; garmentB64: string }> {
  if (!profile.primaryPhotoId) throw new TryonError('no_body_photo', 'Upload a body photo first.');
  const photo = await db.select().from(schema.userPhotos).where(eq(schema.userPhotos.id, profile.primaryPhotoId)).get();
  if (!photo) throw new TryonError('no_body_photo', 'Primary photo missing.');
  const bodyObj = await env.BUCKET.get(photo.r2Key);
  if (!bodyObj) throw new TryonError('no_body_photo', 'Body photo bytes missing.');
  return {
    bodyB64: dataUri(await bodyObj.arrayBuffer(), 'image/webp'),
    garmentB64: await fetchImageAsDataUri(garment.sourceImageUrl),
  };
}

function doneResult(row: ResultRow): TryonResult {
  return {
    id: row.id,
    status: 'done',
    resultUrl: row.resultR2Key ? imageUrl(row.resultR2Key) : undefined,
    cached: false,
    latencyMs: row.latencyMs ?? undefined,
  };
}

export async function runTryon(
  env: Env,
  db: DB,
  ctx: { userId: string; tenantId: string },
  garmentImageUrl: string,
  pageUrl: string,
  productRef?: string,
  category?: string,
  batchId?: string,
  sceneOnly = false,
): Promise<TryonOutcome> {
  const profile = await activeProfile(db, ctx.userId);
  if (!profile.primaryPhotoId) throw new TryonError('no_body_photo', 'Upload a body photo first.');

  const garment = await resolveGarment(db, ctx.tenantId, garmentImageUrl, pageUrl, productRef, category);
  const hitFor = async (variant: string) => {
    const cacheKey = await cacheKeyFor(ctx.userId, profile.bodyVersion, garment.id, variant);
    const row = await db.select().from(schema.tryonResults).where(eq(schema.tryonResults.cacheKey, cacheKey)).get();
    return { cacheKey, row };
  };
  const cacheHit = (row: ResultRow) => logUsage(db, ctx.tenantId, ctx.userId, 'cache_hit', { garmentId: garment.id }).then(
    () => ({ garmentId: garment.id, profileId: profile.id, result: { ...doneResult(row), cached: true } }),
  );

  let { cacheKey, row: cached } = await hitFor(META_SCENE_VARIANT);
  if (cached?.status === 'done' && cached.resultR2Key) return cacheHit(cached);

  const { bodyB64, garmentB64 } = await prepareInputs(env, db, profile, garment);

  // The store's scene needs a person in the product photo; flat lays are dressed on the customer's own photo.
  const scene = await storeScene(env, db, ctx, garment, garmentB64);
  // Whole-page conversion: only photos with exactly one person, nothing is charged for the rest.
  if (sceneOnly && (!scene.masked || scene.people !== 1)) {
    return {
      garmentId: garment.id,
      profileId: profile.id,
      result: { id: '', status: 'skipped', cached: false, skipped: scene.masked ? 'group' : 'no_person' },
    };
  }
  const variant = scene.masked ? META_SCENE_VARIANT : META_VARIANT;
  if (!scene.masked) {
    ({ cacheKey, row: cached } = await hitFor(META_VARIANT));
    if (cached?.status === 'done' && cached.resultR2Key) return cacheHit(cached);
  }
  const face = scene.masked ? await faceCloseup(env, db, ctx.tenantId, profile) : null;
  const endUser = (await sha256Hex(`end-user:${ctx.userId}`)).slice(0, 32);

  // 1 credit per new generation (cache hits above are free), taken once the image exists — a request that
  // dies half-way (a timeout, a Worker limit) never costs a credit.
  if ((await getCredits(db, ctx.userId)) <= 0) throw new TryonError('no_credits', 'Out of credits.');

  // Muse Image: one synchronous call returns the finished image (~15–35 s in the store's scene).
  let gen: Awaited<ReturnType<typeof metaTryon>>;
  try {
    gen = scene.masked
      ? await metaSceneTryon(env, bodyB64, face, scene.masked, endUser)
      : await metaTryon(env, bodyB64, garmentB64, endUser);
  } catch (e) {
    if (e instanceof MetaBlockedError) throw new TryonError('content_blocked', e.message);
    throw e;
  }
  await chargeCredit(db, ctx.userId); // false only if parallel requests took the last credit meanwhile
  // WebP straight from Muse Image, or JPEG when the photo was padded to an accepted shape and cropped back.
  const ext = gen.contentType.includes('jpeg') ? 'jpg' : 'webp';
  const resultKey = `results/${ctx.tenantId}/${ctx.userId}/${garment.imageHash}/${profile.bodyVersion}-${variant}.${ext}`;
  await env.BUCKET.put(resultKey, gen.bytes, { httpMetadata: { contentType: gen.contentType } });
  if (cached?.resultR2Key && cached.resultR2Key !== resultKey) await env.BUCKET.delete(cached.resultR2Key);

  const id = cached?.id ?? newId('try');
  const rec = {
    id,
    userId: ctx.userId,
    profileId: profile.id,
    garmentId: garment.id,
    bodyVersion: profile.bodyVersion,
    cacheKey,
    status: 'done',
    resultR2Key: resultKey,
    modelUsed: META_IMAGE_MODEL,
    latencyMs: gen.latencyMs,
    costUsd: META_COST_USD,
    error: null,
    createdAt: Date.now(),
    variant,
    batchId: batchId ?? null,
  };
  if (cached) await db.update(schema.tryonResults).set(rec).where(eq(schema.tryonResults.id, cached.id)).run();
  else await db.insert(schema.tryonResults).values(rec).run();

  await logUsage(db, ctx.tenantId, ctx.userId, 'cache_miss', {
    garmentId: garment.id,
    latencyMs: gen.latencyMs,
    costUsd: META_COST_USD,
  });

  return {
    garmentId: garment.id,
    profileId: profile.id,
    result: { id, status: 'done', resultUrl: imageUrl(resultKey), cached: false, latencyMs: gen.latencyMs },
  };
}

/** Status endpoint helper: load a result by id. */
export async function getTryonById(db: DB, id: string): Promise<TryonResult | null> {
  const row = await db.select().from(schema.tryonResults).where(eq(schema.tryonResults.id, id)).get();
  if (!row) return null;
  if (row.status === 'done' && row.resultR2Key) return doneResult(row);
  return { id: row.id, status: row.status as TryonStatus, cached: false, error: row.error ?? undefined };
}

/** Cache-only: return already-generated try-ons for the given garment image URLs (never generates). */
export async function lookupResults(
  db: DB,
  ctx: { userId: string; tenantId: string },
  garmentImageUrls: string[],
): Promise<Array<{ garmentImageUrl: string; resultUrl: string }>> {
  const profile = await activeProfile(db, ctx.userId);
  if (!profile.primaryPhotoId) return [];
  const out: Array<{ garmentImageUrl: string; resultUrl: string }> = [];
  for (const url of garmentImageUrls) {
    const imageHash = await sha256Hex(url);
    const g = await db
      .select()
      .from(schema.garments)
      .where(and(eq(schema.garments.tenantId, ctx.tenantId), eq(schema.garments.imageHash, imageHash)))
      .get();
    if (!g) continue;
    for (const variant of VARIANTS) {
      const cacheKey = await cacheKeyFor(ctx.userId, profile.bodyVersion, g.id, variant);
      const tr = await db.select().from(schema.tryonResults).where(eq(schema.tryonResults.cacheKey, cacheKey)).get();
      if (tr?.status === 'done' && tr.resultR2Key) {
        out.push({ garmentImageUrl: url, resultUrl: imageUrl(tr.resultR2Key) });
        break;
      }
    }
  }
  return out;
}
