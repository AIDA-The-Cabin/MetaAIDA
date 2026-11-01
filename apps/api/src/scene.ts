// ============================================================================
// The store's product photo, made ready for a try-on in the store's own scene.
// Muse Image copies any face it is shown: with the store's model visible it returns the store's model,
// whatever the prompt says. So the model's head is blanked out before the photo goes to Muse Image —
// SAM 3.1 finds it ("head" = the whole head with the hair, "face" = where the chin ends, so the neckline
// stays visible) and the box is filled with the colour of the backdrop around it.
// Built once per product photo and kept in R2. Photos with no person in them (flat lays, packshots) are
// marked as such; their try-on is done on the customer's own photo instead.
// ============================================================================
import { PhotonImage, crop, watermark } from '@cf-wasm/photon';
import type { DB } from './db/client';
import * as schema from './db/schema';
import type { Env } from './env';
import { samBoxes, SAM_COST_USD, type Box } from './sam';
import { dataUri, newId } from './util';

const MIN_CONF = 0.5;

/** `masked` = the product photo with the model's head blanked out (data URI); null = no person in the photo. */
export interface StoreScene {
  masked: string | null;
  /** People found in the photo (a whole-page conversion only takes photos with exactly one). */
  people: number;
}

export function sceneKey(tenantId: string, imageHash: string): string {
  return `scenes/${tenantId}/${imageHash}.jpg`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Mean colour of the thin strips just left and right of a box (the backdrop around the head). */
function backdropColour(img: PhotonImage, x1: number, x2: number, y1: number, y2: number): [number, number, number] {
  const W = img.get_width();
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [sx1, sx2] of [
    [Math.max(0, x1 - 8), Math.max(0, x1 - 2)],
    [Math.min(W, x2 + 2), Math.min(W, x2 + 8)],
  ]) {
    if (sx2 - sx1 < 1) continue;
    const strip = crop(img, sx1, y1, sx2, y2 + 1);
    try {
      const px = strip.get_raw_pixels();
      for (let i = 0; i < px.length; i += 4) {
        r += px[i];
        g += px[i + 1];
        b += px[i + 2];
        n++;
      }
    } finally {
      strip.free();
    }
  }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [200, 200, 200];
}

// Only the small strips and the patch cross into JS; the photo itself stays inside photon (Worker CPU).
function maskHeads(bytes: Uint8Array, heads: Box[], faces: Box[]): Uint8Array {
  const img = PhotonImage.new_from_byteslice(bytes);
  try {
    const W = img.get_width();
    const H = img.get_height();
    for (const h of heads) {
      const hw = h.x2 - h.x1;
      const hh = h.y2 - h.y1;
      // The face inside this head says where the chin is — the head box often runs down the neck.
      const f = faces.find((b) => {
        const cx = (b.x1 + b.x2) / 2;
        const cy = (b.y1 + b.y2) / 2;
        return cx >= h.x1 && cx <= h.x2 && cy >= h.y1 && cy <= h.y2;
      });
      const x1 = clamp(Math.round(h.x1 - hw * 0.08), 0, W - 1);
      const x2 = clamp(Math.round(h.x2 + hw * 0.08), 0, W - 1);
      const y1 = clamp(Math.round(h.y1 - hh * 0.08), 0, H - 1);
      const y2 = clamp(Math.round(f ? f.y2 + hh * 0.03 : h.y1 + hh * 0.85), 0, H - 1);
      // Fill = the backdrop just left and right of the box, pasted over the head as one opaque patch.
      const [r, g, b] = backdropColour(img, x1, x2, y1, y2);
      const bw = x2 - x1 + 1;
      const bh = y2 - y1 + 1;
      const fill = new Uint8Array(bw * bh * 4);
      for (let i = 0; i < fill.length; i += 4) {
        fill[i] = r;
        fill[i + 1] = g;
        fill[i + 2] = b;
        fill[i + 3] = 255;
      }
      const patch = new PhotonImage(fill, bw, bh);
      try {
        watermark(img, patch, BigInt(x1), BigInt(y1));
      } finally {
        patch.free();
      }
    }
    return img.get_bytes_jpeg(90);
  } finally {
    img.free();
  }
}

/**
 * The product photo ready for a try-on in its own scene (cached per photo in R2).
 * SAM unreachable → `{ masked: null }` without caching, so this try-on falls back to the customer's photo
 * and the next one tries the store scene again.
 */
export async function storeScene(
  env: Env,
  db: DB,
  ctx: { tenantId: string; userId: string },
  garment: { id: string; imageHash: string },
  garmentDataUri: string,
): Promise<StoreScene> {
  const key = sceneKey(ctx.tenantId, garment.imageHash);
  const hit = await env.BUCKET.get(key);
  if (hit) {
    const people = Number(hit.customMetadata?.people ?? hit.customMetadata?.person ?? 0);
    if (hit.customMetadata?.person === '0') return { masked: null, people: 0 };
    return { masked: dataUri(await hit.arrayBuffer(), 'image/jpeg'), people };
  }

  const [heads, faces] = await Promise.all([samBoxes(env, garmentDataUri, 'head'), samBoxes(env, garmentDataUri, 'face')]);
  const billed = [heads, faces].filter((x) => x.billed).length;
  if (billed) {
    await db
      .insert(schema.usageEvents)
      .values({
        id: newId('ue'),
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        eventType: 'scene',
        garmentId: garment.id,
        costUsd: SAM_COST_USD * billed,
        createdAt: Date.now(),
      })
      .run();
  }
  if (!heads.billed || !faces.billed) return { masked: null, people: 0 };

  const people = heads.boxes.filter((b) => (b.c ?? 1) >= MIN_CONF);
  let jpeg: Uint8Array | null = null;
  if (people.length) {
    try {
      const raw = garmentDataUri.slice(garmentDataUri.indexOf(',') + 1);
      const bin = atob(raw);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      jpeg = maskHeads(bytes, people, faces.boxes);
    } catch {
      jpeg = null; // a format photon can't read — try-on on the customer's photo instead
    }
  }
  if (!jpeg) {
    await env.BUCKET.put(key, new Uint8Array(0), { customMetadata: { person: '0', people: '0' } });
    return { masked: null, people: 0 };
  }
  await env.BUCKET.put(key, jpeg, {
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: { person: '1', people: String(people.length) },
  });
  return { masked: dataUri(jpeg.slice().buffer, 'image/jpeg'), people: people.length };
}
