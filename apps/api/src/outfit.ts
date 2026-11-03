// ============================================================================
// The Cabin's dressing room. The customer drops converted photos (their try-ons) on zones of their own
// figure — hat, jewelry, top, bottoms, shoes — and Muse Image redraws their uploaded photo wearing exactly
// those pieces. Two candidates at a time are compared with the customer's photo by Muse Spark (quality.ts);
// only one with their face and exactly their body is kept, and saved with the products it came from.
// ============================================================================
import { and, desc, eq } from 'drizzle-orm';
import type { Outfit, OutfitPiece, OutfitSlot, ProfileFigure, FigureBox } from '@aida/shared';
import * as schema from './db/schema';
import type { DB } from './db/client';
import type { Env } from './env';
import { activeProfile, type ProfileRow } from './profiles';
import { faceCloseup, loadPhoto } from './avatar';
import { samBoxes, SAM_COST_USD } from './sam';
import { META_COST_USD, MetaBlockedError, cropBack, metaOutfit, prepareScene, SLOT_PIECE } from './meta';
import { PICK_COST_USD, outfitFailedReason, outfitNotes, pickOutfit, type OutfitVerdict } from './quality';
import { chargeCredit, getCredits } from './credits';
import { TryonError, imageUrl } from './tryon';
import { dataUri, imageSize, newId, sha256Hex } from './util';

/** Two candidates a round (the base is the customer's own photo: it drifts far less than a store scene). */
const OUTFIT_CANDIDATES = 2;
const OUTFIT_ROUNDS = 2;

const SLOT_ORDER: OutfitSlot[] = ['hat', 'jewelry', 'top', 'bottoms', 'shoes'];

const hostOf = (url?: string | null) => {
  try {
    return url ? new URL(url).host.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

async function logUsage(db: DB, tenantId: string, userId: string, eventType: string, costUsd: number, latencyMs?: number) {
  await db
    .insert(schema.usageEvents)
    .values({ id: newId('ue'), tenantId, userId, eventType, costUsd, latencyMs: latencyMs ?? null, createdAt: Date.now() })
    .run();
}

// ── Where the person stands in their photo (the drop zones are laid over the figure) ──

/** Stored figures of another layout are found again. */
const FIGURE_V = 2;

/**
 * The person's box and face box in the profile's current photo, as fractions of the photo. Found once per
 * photo by SAM 3.1 and kept on the profile; without a match the widget lays the zones out on the whole photo.
 */
export async function profileFigure(env: Env, db: DB, tenantId: string, p: ProfileRow): Promise<ProfileFigure | null> {
  if (!p.primaryPhotoId) return null;
  if (p.figure) {
    try {
      const f = JSON.parse(p.figure) as ProfileFigure & { photoId?: string; v?: number };
      if (f.photoId === p.primaryPhotoId && f.v === FIGURE_V) return { w: f.w, h: f.h, person: f.person, face: f.face };
    } catch {
      /* rebuilt below */
    }
  }
  const photo = await loadPhoto(env, db, p);
  if (!photo) return null;
  const size = imageSize(new Uint8Array(photo.bytes));
  if (!size) return null;
  const uri = dataUri(photo.bytes, photo.mime);
  // The face, not the head: with long hair SAM's head box runs down to the shoulders.
  const [person, face] = await Promise.all([samBoxes(env, uri, 'person'), samBoxes(env, uri, 'face')]);
  const frac = (b?: { x1: number; y1: number; x2: number; y2: number }): FigureBox | undefined =>
    b
      ? {
          x1: Math.max(0, b.x1 / size.w),
          y1: Math.max(0, b.y1 / size.h),
          x2: Math.min(1, b.x2 / size.w),
          y2: Math.min(1, b.y2 / size.h),
        }
      : undefined;
  const fig: ProfileFigure = { w: size.w, h: size.h, person: frac(person.boxes[0]), face: frac(face.boxes[0]) };
  await db
    .update(schema.profiles)
    .set({ figure: JSON.stringify({ ...fig, photoId: p.primaryPhotoId, v: FIGURE_V }) })
    .where(eq(schema.profiles.id, p.id))
    .run();
  const billed = [person.billed, face.billed].filter(Boolean).length;
  if (billed) await logUsage(db, tenantId, p.userId, 'figure', billed * SAM_COST_USD);
  return fig;
}

// ── Outfits ──

type OutfitRow = typeof schema.outfits.$inferSelect;

function toOutfit(row: OutfitRow): Outfit {
  let pieces: OutfitPiece[] = [];
  try {
    pieces = JSON.parse(row.items) as OutfitPiece[];
  } catch {
    /* an unreadable snapshot shows the image alone */
  }
  return { id: row.id, resultUrl: imageUrl(row.resultR2Key!), pieces, createdAt: row.createdAt };
}

export async function listOutfits(db: DB, ctx: { userId: string }): Promise<Outfit[]> {
  const profile = await activeProfile(db, ctx.userId);
  const rows = await db
    .select()
    .from(schema.outfits)
    .where(and(eq(schema.outfits.userId, ctx.userId), eq(schema.outfits.profileId, profile.id), eq(schema.outfits.status, 'done')))
    .orderBy(desc(schema.outfits.createdAt))
    .limit(200)
    .all();
  return rows.filter((r) => r.resultR2Key).map(toOutfit);
}

export async function removeOutfit(env: Env, db: DB, ctx: { userId: string }, id: string): Promise<boolean> {
  const row = await db
    .select()
    .from(schema.outfits)
    .where(and(eq(schema.outfits.id, id), eq(schema.outfits.userId, ctx.userId)))
    .get();
  if (!row) return false;
  if (row.resultR2Key) await env.BUCKET.delete(row.resultR2Key);
  await db.delete(schema.outfits).where(eq(schema.outfits.id, id)).run();
  return true;
}

/**
 * Put an outfit together: for every zone, the try-on whose piece goes there. Returns the saved outfit, or
 * throws TryonError (no photo, a piece that is not this person's try-on, no credits, nothing kept).
 */
export async function createOutfit(
  env: Env,
  db: DB,
  ctx: { userId: string; tenantId: string },
  slots: Partial<Record<OutfitSlot, string>>,
): Promise<Outfit> {
  const profile = await activeProfile(db, ctx.userId);
  if (!profile.primaryPhotoId) throw new TryonError('no_body_photo', 'Upload a body photo first.');

  // The pieces: this person's own try-ons only (the current photo or an earlier one).
  const pieces: Array<OutfitPiece & { key: string }> = [];
  for (const slot of SLOT_ORDER) {
    const id = slots[slot];
    if (!id) continue;
    const tr = await db
      .select()
      .from(schema.tryonResults)
      .where(and(eq(schema.tryonResults.id, id), eq(schema.tryonResults.userId, ctx.userId)))
      .get();
    if (!tr || tr.status !== 'done' || !tr.resultR2Key) throw new TryonError('bad_piece', `The ${slot} is not one of your try-ons.`);
    const g = await db.select().from(schema.garments).where(eq(schema.garments.id, tr.garmentId)).get();
    const productUrl = g?.productUrl ?? g?.sourcePageUrl ?? undefined;
    pieces.push({
      slot,
      tryonId: tr.id,
      imageUrl: imageUrl(tr.resultR2Key),
      garmentImageUrl: g?.sourceImageUrl ?? '',
      productUrl,
      name: g?.name ?? undefined,
      site: hostOf(productUrl ?? g?.sourceImageUrl),
      key: tr.resultR2Key,
    });
  }
  if (!pieces.length) throw new TryonError('bad_request', 'Drop at least one piece on the figure.');
  if ((await getCredits(db, ctx.userId)) <= 0) throw new TryonError('no_credits', 'Out of credits.');

  const photo = await loadPhoto(env, db, profile);
  if (!photo) throw new TryonError('no_body_photo', 'Body photo bytes missing.');
  const body = dataUri(photo.bytes, photo.mime);
  const piecePhotos = await Promise.all(
    pieces.map(async (p) => {
      const obj = await env.BUCKET.get(p.key);
      if (!obj) throw new TryonError('bad_piece', `The ${p.slot} image is gone.`);
      return { slot: p.slot, dataUri: dataUri(await obj.arrayBuffer(), obj.httpMetadata?.contentType ?? 'image/jpeg') };
    }),
  );
  const face = await faceCloseup(env, db, ctx.tenantId, profile);
  const endUser = (await sha256Hex(`end-user:${ctx.userId}`)).slice(0, 32);
  // The customer's photo goes in at an accepted size (padded with its own edge colour); the kept candidate is
  // cropped back to the photo's shape. The judge sees the photo padded the same way, like for like.
  const base = prepareScene(body);
  const judgePieces = piecePhotos.map((p) => ({ label: SLOT_PIECE[p.slot].split(':')[0], dataUri: p.dataUri }));

  const t0 = Date.now();
  let costUsd = 0;
  let notes: string[] = [];
  let last: OutfitVerdict[] = [];
  let blocked = 0;
  let kept: Awaited<ReturnType<typeof metaOutfit>> | null = null;
  for (let round = 0; round < OUTFIT_ROUNDS && !kept; round++) {
    const settled = await Promise.allSettled(
      Array.from({ length: OUTFIT_CANDIDATES }, () => metaOutfit(env, base, face, piecePhotos, endUser, notes)),
    );
    const gens = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const errors = settled.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
    blocked += errors.filter((e) => e instanceof MetaBlockedError).length;
    if (!gens.length) {
      const other = errors.find((e) => !(e instanceof MetaBlockedError));
      if (other) throw other;
      continue;
    }
    costUsd += gens.length * META_COST_USD;
    let pick;
    try {
      pick = await pickOutfit(env, base.dataUri, judgePieces, gens.map((g) => dataUri(g.bytes, g.contentType)));
    } catch {
      continue; // the comparison itself failed — nothing is kept unchecked
    }
    costUsd += PICK_COST_USD;
    if (pick.index >= 0) kept = gens[pick.index];
    else {
      last = pick.verdicts;
      notes = outfitNotes(pick.verdicts);
    }
  }

  const id = newId('out');
  const snapshot = pieces.map(({ key: _key, ...p }) => p);
  if (!kept) {
    const reason = last.length ? outfitFailedReason(last) : blocked ? 'content_blocked' : 'not checked';
    await db
      .insert(schema.outfits)
      .values({
        id,
        userId: ctx.userId,
        profileId: profile.id,
        bodyVersion: profile.bodyVersion,
        status: 'rejected',
        resultR2Key: null,
        items: JSON.stringify(snapshot),
        costUsd,
        latencyMs: Date.now() - t0,
        error: reason,
        createdAt: Date.now(),
      })
      .run();
    await logUsage(db, ctx.tenantId, ctx.userId, 'outfit_rejected', costUsd, Date.now() - t0);
    if (reason === 'content_blocked') throw new TryonError('content_blocked', 'Meta content safety refused this outfit.');
    throw new TryonError('rejected', `No version of this outfit kept your body and face (${reason}). Try again.`);
  }

  const out = base.box ? cropBack(kept, base.box) : kept;
  const ext = out.contentType.includes('jpeg') ? 'jpg' : 'webp';
  const key = `results/${ctx.tenantId}/${ctx.userId}/outfits/${id}.${ext}`;
  await env.BUCKET.put(key, out.bytes, { httpMetadata: { contentType: out.contentType } });
  await chargeCredit(db, ctx.userId); // 1 generated image = 1 credit, like a try-on
  const row: OutfitRow = {
    id,
    userId: ctx.userId,
    profileId: profile.id,
    bodyVersion: profile.bodyVersion,
    status: 'done',
    resultR2Key: key,
    items: JSON.stringify(snapshot),
    costUsd,
    latencyMs: Date.now() - t0,
    error: null,
    createdAt: Date.now(),
  };
  await db.insert(schema.outfits).values(row).run();
  await logUsage(db, ctx.tenantId, ctx.userId, 'outfit', costUsd, Date.now() - t0);
  return toOutfit(row);
}

