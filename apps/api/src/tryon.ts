import { and, eq, inArray, like, ne, or } from 'drizzle-orm';
import { ROUTES, type TryonResult, type TryonStatus } from '@aida/shared';
import * as schema from './db/schema';
import type { DB } from './db/client';
import type { Env } from './env';
import { newId, sha256Hex, dataUri, fetchImageAsDataUri, encodeKey } from './util';
import {
  metaTryon,
  metaSceneTryon,
  prepareScene,
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
import { BUILD_COST_USD, QA_COST_USD, bodyBuild, checkTryon, failedChecks, nextWiden, retryNotes, type Verdict } from './quality';

/** Generations per photo in the store's scene: the first one, then retries told what the check found wrong. */
const SCENE_ATTEMPTS = 3;
/** Most one photo in the store's scene can cost: every attempt generated and checked. */
export const SCENE_MAX_COST_USD = SCENE_ATTEMPTS * (META_COST_USD + QA_COST_USD);

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

/**
 * A try-on in the store's scene that passed the quality check (quality.ts), or null with what failed in the
 * last attempt. Meta's content filter is not deterministic near its threshold (the same photo and prompt went
 * through on another try): a refusal costs nothing and takes seconds, so it only uses up an attempt.
 */
async function checkedSceneTryon(
  env: Env,
  ctx: { userId: string; tenantId: string },
  profile: ProfileRow,
  inputs: { bodyB64: string; garmentB64: string; face: string | null; masked: string; endUser: string; people: number },
): Promise<{ gen: Awaited<ReturnType<typeof metaSceneTryon>> | null; reason: string; costUsd: number }> {
  const { build, billed } = await bodyBuild(env, ctx.tenantId, ctx.userId, profile.primaryPhotoId!, inputs.bodyB64);
  let costUsd = billed ? BUILD_COST_USD : 0;
  let notes: string[] = [];
  let widen = 1; // the first attempt gets the store photo as it is
  let scene = prepareScene(inputs.masked);
  let verdict: Verdict | null = null;
  let blocked = 0;
  for (let attempt = 0; attempt < SCENE_ATTEMPTS; attempt++) {
    let gen: Awaited<ReturnType<typeof metaSceneTryon>>;
    try {
      gen = await metaSceneTryon(env, inputs.bodyB64, inputs.face, scene, inputs.endUser, { build, notes, people: inputs.people });
    } catch (e) {
      if (!(e instanceof MetaBlockedError)) throw e;
      blocked++;
      continue;
    }
    costUsd += META_COST_USD + QA_COST_USD;
    try {
      verdict = await checkTryon(
        env,
        inputs.garmentB64,
        inputs.bodyB64,
        dataUri(gen.bytes.slice().buffer, gen.contentType),
        build,
        inputs.people,
      );
    } catch {
      continue; // the check itself failed — this image is not kept unchecked
    }
    if (verdict.pass) return { gen, reason: '', costUsd };
    const next = nextWiden(verdict, build, widen);
    if (next !== widen) scene = prepareScene(inputs.masked, (widen = next));
    notes = retryNotes(verdict, build, widen > 1);
  }
  const reason = verdict ? failedChecks(verdict) : blocked ? 'content_blocked' : 'not checked';
  return { gen: null, reason, costUsd };
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
  allPeople = false,
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
  const skipped = (why: NonNullable<TryonResult['skipped']>): TryonOutcome => ({
    garmentId: garment.id,
    profileId: profile.id,
    result: { id: '', status: 'skipped', cached: false, skipped: why },
  });
  // No try-on of this photo passed the quality check (or Meta refused it): whole-page conversion leaves it
  // alone; a click on that one product tries again.
  if (sceneOnly && cached?.status === 'rejected') return skipped('rejected');

  const { bodyB64, garmentB64 } = await prepareInputs(env, db, profile, garment);

  // The store's scene needs a person in the product photo; flat lays are dressed on the customer's own photo.
  const scene = await storeScene(env, db, ctx, garment, garmentB64);
  // Whole-page conversion: only photos with people in them, nothing is charged for the rest. Photos with several
  // people only with `allPeople` (every one of them becomes the customer).
  if (sceneOnly && (!scene.masked || (scene.people !== 1 && !allPeople))) return skipped(scene.masked ? 'group' : 'no_person');
  const variant = scene.masked ? META_SCENE_VARIANT : META_VARIANT;
  if (!scene.masked) {
    ({ cacheKey, row: cached } = await hitFor(META_VARIANT));
    if (cached?.status === 'done' && cached.resultR2Key) return cacheHit(cached);
  }
  const face = scene.masked ? await faceCloseup(env, db, ctx.tenantId, profile) : null;
  const endUser = (await sha256Hex(`end-user:${ctx.userId}`)).slice(0, 32);

  // 1 credit per new try-on (cache hits above are free), taken once a kept image exists — a request that
  // dies half-way (a timeout, a Worker limit) or ends rejected never costs a credit.
  if ((await getCredits(db, ctx.userId)) <= 0) throw new TryonError('no_credits', 'Out of credits.');

  // Muse Image: one synchronous call returns the finished image (~15–35 s in the store's scene, plus ~20–40 s
  // for each quality check).
  const t0 = Date.now();
  let gen: Awaited<ReturnType<typeof metaTryon>>;
  let costUsd = META_COST_USD;
  if (scene.masked) {
    const people = Math.max(1, scene.people);
    const out = await checkedSceneTryon(env, ctx, profile, { bodyB64, garmentB64, face, masked: scene.masked, endUser, people });
    costUsd = out.costUsd;
    if (!out.gen) {
      const rejected = {
        id: cached?.id ?? newId('try'),
        userId: ctx.userId,
        profileId: profile.id,
        garmentId: garment.id,
        bodyVersion: profile.bodyVersion,
        cacheKey,
        status: 'rejected',
        resultR2Key: null,
        modelUsed: META_IMAGE_MODEL,
        latencyMs: Date.now() - t0,
        costUsd,
        error: out.reason,
        createdAt: Date.now(),
        variant,
        batchId: batchId ?? null,
      };
      // Another request for the same photo may have finished meanwhile: a rejection never replaces a kept try-on.
      if (cached) {
        await db
          .update(schema.tryonResults)
          .set(rejected)
          .where(and(eq(schema.tryonResults.id, cached.id), ne(schema.tryonResults.status, 'done')))
          .run();
      } else {
        await db.insert(schema.tryonResults).values(rejected).onConflictDoNothing({ target: schema.tryonResults.cacheKey }).run();
      }
      await logUsage(db, ctx.tenantId, ctx.userId, 'rejected', { garmentId: garment.id, latencyMs: Date.now() - t0, costUsd });
      if (sceneOnly) return skipped('rejected');
      if (out.reason === 'content_blocked') throw new TryonError('content_blocked', 'Meta content safety refused this photo.');
      throw new TryonError('rejected', `No try-on of this photo kept your body and face (${out.reason}).`);
    }
    gen = { ...out.gen, latencyMs: Date.now() - t0 };
  } else {
    try {
      gen = await metaTryon(env, bodyB64, garmentB64, endUser);
    } catch (e) {
      if (e instanceof MetaBlockedError) throw new TryonError('content_blocked', e.message);
      throw e;
    }
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
    costUsd,
    error: null,
    createdAt: Date.now(),
    variant,
    batchId: batchId ?? null,
  };
  if (cached) await db.update(schema.tryonResults).set(rec).where(eq(schema.tryonResults.id, cached.id)).run();
  else {
    // Two requests for the same photo at once (two tabs, a retry): the kept try-on that lands last wins.
    const { id: _id, ...latest } = rec;
    await db.insert(schema.tryonResults).values(rec).onConflictDoUpdate({ target: schema.tryonResults.cacheKey, set: latest }).run();
  }

  await logUsage(db, ctx.tenantId, ctx.userId, 'cache_miss', {
    garmentId: garment.id,
    latencyMs: gen.latencyMs,
    costUsd,
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

/**
 * Cache-only: every try-on the active profile has from one site's pages ("Show my try-ons" in the extension).
 * The page swaps each photo the moment it renders it, so lazy-loaded tiles need no scrolling first.
 */
export async function siteResults(
  db: DB,
  ctx: { userId: string; tenantId: string },
  pageUrl: string,
): Promise<Array<{ garmentImageUrl: string; resultUrl: string }>> {
  const profile = await activeProfile(db, ctx.userId);
  if (!profile.primaryPhotoId) return [];
  const host = new URL(pageUrl).host.replace(/^www\./, '');
  const onSite = [host, `www.${host}`].flatMap((h) => [
    like(schema.garments.sourcePageUrl, `https://${h}/%`),
    like(schema.garments.sourcePageUrl, `http://${h}/%`),
  ]);
  const rows = await db
    .select({ url: schema.garments.sourceImageUrl, key: schema.tryonResults.resultR2Key, variant: schema.tryonResults.variant })
    .from(schema.tryonResults)
    .innerJoin(schema.garments, eq(schema.garments.id, schema.tryonResults.garmentId))
    .where(
      and(
        eq(schema.tryonResults.userId, ctx.userId),
        eq(schema.tryonResults.bodyVersion, profile.bodyVersion),
        eq(schema.tryonResults.status, 'done'),
        inArray(schema.tryonResults.variant, VARIANTS),
        eq(schema.garments.tenantId, ctx.tenantId),
        or(...onSite),
      ),
    )
    .limit(2000)
    .all();
  // One per photo: a try-on in the store's scene beats one on the customer's own photo.
  const best = new Map<string, { key: string; rank: number }>();
  for (const r of rows) {
    if (!r.key) continue;
    const rank = VARIANTS.indexOf(r.variant ?? '');
    const cur = best.get(r.url);
    if (!cur || rank < cur.rank) best.set(r.url, { key: r.key, rank });
  }
  return [...best].map(([garmentImageUrl, b]) => ({ garmentImageUrl, resultUrl: imageUrl(b.key) }));
}
