// ============================================================================
// Whole-page conversion, dry run: for every photo of a page, is it already converted, ready (a single
// person was found before), not analysed yet, skipped (no person or a group) or unreachable — and what
// converting the rest would cost. No AI call is made; a photo never seen before is only fetched once to
// check that the store's CDN serves it to us.
// ============================================================================
import { and, eq } from 'drizzle-orm';
import type { ConvertPlan, ConvertPlanItem } from '@aida/shared';
import * as schema from './db/schema';
import type { DB } from './db/client';
import type { Env } from './env';
import { imageReachable, sha256Hex } from './util';
import { activeProfile } from './profiles';
import { closeupKey } from './avatar';
import { sceneKey } from './scene';
import { META_COST_USD } from './meta';
import { SAM_COST_USD } from './sam';
import { cacheKeyFor, VARIANTS } from './tryon';

export async function planConversion(
  env: Env,
  db: DB,
  ctx: { userId: string; tenantId: string },
  imageUrls: string[],
): Promise<ConvertPlan> {
  const profile = await activeProfile(db, ctx.userId);
  const items: ConvertPlanItem[] = [];
  let usd = 0;

  for (const url of imageUrls) {
    const imageHash = await sha256Hex(url);
    const g = await db
      .select()
      .from(schema.garments)
      .where(and(eq(schema.garments.tenantId, ctx.tenantId), eq(schema.garments.imageHash, imageHash)))
      .get();
    if (g && profile.primaryPhotoId) {
      let cached = false;
      for (const v of VARIANTS) {
        const key = await cacheKeyFor(ctx.userId, profile.bodyVersion, g.id, v);
        const tr = await db.select().from(schema.tryonResults).where(eq(schema.tryonResults.cacheKey, key)).get();
        if (tr?.status === 'done' && tr.resultR2Key) cached = true;
      }
      if (cached) {
        items.push({ url, state: 'cached' });
        continue;
      }
    }
    const scene = await env.BUCKET.head(sceneKey(ctx.tenantId, imageHash));
    if (scene) {
      const people = Number(scene.customMetadata?.people ?? scene.customMetadata?.person ?? 0);
      const ready = scene.customMetadata?.person !== '0' && people === 1;
      items.push({ url, state: ready ? 'ready' : 'skip' });
      if (ready) usd += META_COST_USD;
      continue;
    }
    const reachable = await imageReachable(url);
    items.push({ url, state: reachable ? 'new' : 'unreachable' });
    if (reachable) usd += 2 * SAM_COST_USD + META_COST_USD; // head + face analysis, then (if one person) the image
  }

  // The customer's face close-up is built once per photo, on the first try-on in a store's scene.
  if (profile.primaryPhotoId && items.some((i) => i.state === 'ready' || i.state === 'new')) {
    if (!(await env.BUCKET.head(closeupKey(ctx.tenantId, ctx.userId, profile.primaryPhotoId)))) usd += SAM_COST_USD;
  }
  return { items, estimateUsd: Math.round(usd * 10000) / 10000 };
}
