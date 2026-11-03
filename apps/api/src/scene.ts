// ============================================================================
// The store's product photo, made ready for a try-on in the store's own scene.
// Muse Image copies any face it is shown: with the store's model visible it returns the store's model,
// whatever the prompt says. So the model's head is blanked out before the photo goes to Muse Image —
// SAM 3.1 finds it ("head" = the whole head with the hair, "face" = where the chin ends, so the neckline
// stays visible) and the box is filled with the colour of the backdrop around it.
// Printed captions the box covers (campaign tiles) are put back on top of it, letter by letter.
// Built once per product photo and kept in R2. Photos with no person in them (flat lays, packshots) are
// marked as such; their try-on is done on the customer's own photo instead.
// ============================================================================
import { PhotonImage, crop, watermark } from '@cf-wasm/photon';
import type { DB } from './db/client';
import * as schema from './db/schema';
import type { Env } from './env';
import { samBoxes, SAM_COST_USD, type Box } from './sam';
import { base64ToBytes, dataUri, newId } from './util';

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

/**
 * The letters of a printed caption inside a region: white pixels (bright and colourless — blonde highlights
 * are bright but yellowish), else black ones, grown by one pixel for their anti-aliased edges. Only these go
 * back over the head patch: the whole region would also bring back the store model's hair between the letters.
 * `maxShare` keeps a white backdrop or a white garment from passing for lettering.
 */
function letterMask(px: Uint8Array, w: number, h: number, maxShare: number, kinds: Array<'white' | 'black'>): Uint8Array | null {
  const n = w * h;
  for (const kind of kinds) {
    const on = new Uint8Array(n);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const r = px[i * 4];
      const g = px[i * 4 + 1];
      const b = px[i * 4 + 2];
      const hi = Math.max(r, g, b);
      const lo = Math.min(r, g, b);
      if (kind === 'white' ? lo >= 215 && hi - lo <= 28 : hi <= 45 && hi - lo <= 20) {
        on[i] = 1;
        count++;
      }
    }
    if (count < n * 0.01 || count > n * maxShare) continue;
    const grown = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!on[y * w + x]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h) grown[yy * w + xx] = 1;
          }
        }
      }
    }
    return grown;
  }
  return null;
}

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Only the small strips and the patch cross into JS; the photo itself stays inside photon (Worker CPU).
function maskHeads(bytes: Uint8Array, heads: Box[], faces: Box[], captions: Box[] = []): Uint8Array {
  const img = PhotonImage.new_from_byteslice(bytes);
  try {
    const W = img.get_width();
    const H = img.get_height();
    const rects: Rect[] = heads.map((h) => {
      const hw = h.x2 - h.x1;
      const hh = h.y2 - h.y1;
      // The face inside this head says where the chin is — the head box often runs down the neck.
      const f = faces.find((b) => {
        const cx = (b.x1 + b.x2) / 2;
        const cy = (b.y1 + b.y2) / 2;
        return cx >= h.x1 && cx <= h.x2 && cy >= h.y1 && cy <= h.y2;
      });
      return {
        x1: clamp(Math.round(h.x1 - hw * 0.08), 0, W - 1),
        x2: clamp(Math.round(h.x2 + hw * 0.08), 0, W - 1),
        y1: clamp(Math.round(h.y1 - hh * 0.08), 0, H - 1),
        y2: clamp(Math.round(f ? f.y2 + hh * 0.03 : h.y1 + hh * 0.85), 0, H - 1),
      };
    });
    // Printed captions (campaign tiles: "TOPS UNDER $50") often sit over the model's hair: their letters stay.
    // SAM finds most of them as "caption"; when it finds none, a head patch is searched for sparse white
    // lettering itself (it found none on "THE PLAID SHOP", which the patch covered).
    const regions = (
      captions.length
        ? captions.map((c) => ({ x1: Math.round(c.x1) - 3, y1: Math.round(c.y1) - 3, x2: Math.round(c.x2) + 3, y2: Math.round(c.y2) + 3, share: 0.45, kinds: ['white', 'black'] as Array<'white' | 'black'> }))
        : rects.map((r) => ({ ...r, share: 0.25, kinds: ['white'] as Array<'white' | 'black'> }))
    ).map((r) => {
      const x1 = clamp(r.x1, 0, W - 1);
      const y1 = clamp(r.y1, 0, H - 1);
      const x2 = clamp(r.x2, x1 + 1, W);
      const y2 = clamp(r.y2, y1 + 1, H);
      const part = crop(img, x1, y1, x2, y2);
      try {
        return { x1, y1, w: part.get_width(), h: part.get_height(), px: part.get_raw_pixels(), share: r.share, kinds: r.kinds };
      } finally {
        part.free();
      }
    });
    for (const { x1, y1, x2, y2 } of rects) {
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
    for (const k of regions) {
      const letters = letterMask(k.px, k.w, k.h, k.share, k.kinds);
      if (!letters) continue;
      const now = crop(img, k.x1, k.y1, k.x1 + k.w, k.y1 + k.h);
      let merged: Uint8Array;
      try {
        merged = now.get_raw_pixels();
      } finally {
        now.free();
      }
      for (let i = 0; i < letters.length; i++) {
        if (!letters[i]) continue;
        merged[i * 4] = k.px[i * 4];
        merged[i * 4 + 1] = k.px[i * 4 + 1];
        merged[i * 4 + 2] = k.px[i * 4 + 2];
      }
      const patch = new PhotonImage(merged, k.w, k.h);
      try {
        watermark(img, patch, BigInt(k.x1), BigInt(k.y1));
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

  // "caption" is the phrase SAM 3.1 finds printed labels with ("text", "letters" find nothing).
  const [heads, faces, captions] = await Promise.all([
    samBoxes(env, garmentDataUri, 'head'),
    samBoxes(env, garmentDataUri, 'face'),
    samBoxes(env, garmentDataUri, 'caption'),
  ]);
  const billed = [heads, faces, captions].filter((x) => x.billed).length;
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
      const bytes = base64ToBytes(garmentDataUri.slice(garmentDataUri.indexOf(',') + 1));
      jpeg = maskHeads(bytes, people, faces.boxes, captions.boxes.filter((b) => (b.c ?? 1) >= MIN_CONF));
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
