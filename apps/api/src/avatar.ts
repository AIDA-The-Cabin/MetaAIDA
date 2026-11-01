// ============================================================================
// Face avatar — SAM 3.1 (Meta Model API) finds the face in the profile photo with the text prompt
// "face"; the server crops a square around it and stores a 128×128 WebP. Built once per photo.
// $0.0025 per image. Docs: https://dev.meta.ai/docs/media-segmentation
// ============================================================================
import { eq } from 'drizzle-orm';
import { PhotonImage, crop, resize, SamplingFilter } from '@cf-wasm/photon';
import * as schema from './db/schema';
import type { DB } from './db/client';
import type { Env } from './env';
import type { ProfileRow } from './profiles';
import { abToBase64, newId } from './util';

const META_BASE = 'https://api.meta.ai/v1';
export const SAM_MODEL = 'sam-3.1';
export const SAM_COST_USD = 0.0025;
const AVATAR_PX = 128; // shown at 24–32 px (2× on retina) — the WebP encoder is lossless, so keep it small

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c?: number;
}

/**
 * Ask SAM 3.1 for faces in the photo. The answer is special-token text, one line per frame:
 * `<0f>0<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..;c=..|><|mask;...|>` — boxes in source pixels.
 * Returns the most confident face (or null) and whether the call went through (= was billed).
 */
async function findFace(env: Env, photo: ArrayBuffer, mime: string): Promise<{ face: Box | null; billed: boolean }> {
  let r: Response;
  try {
    r = await fetch(`${META_BASE}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.META_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: SAM_MODEL,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'face' },
              { type: 'input_image', image_url: `data:${mime};base64,${abToBase64(photo)}` },
            ],
          },
        ],
        metadata: { include_confidence: 'true', mask_encoding: 'one_bit' },
      }),
    });
  } catch {
    return { face: null, billed: false };
  }
  if (!r.ok) return { face: null, billed: false };
  const j = (await r.json().catch(() => ({}))) as { output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = (j.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? '').join('\n');
  const boxes: Box[] = [...text.matchAll(/<\|box;([^|]*)\|>/g)].map((m) => {
    const f = Object.fromEntries(m[1].split(';').map((kv) => kv.split('=') as [string, string]));
    return { x1: +f.x1, y1: +f.y1, x2: +f.x2, y2: +f.y2, c: f.c === undefined ? undefined : +f.c };
  });
  boxes.sort((a, b) => (b.c ?? 0) - (a.c ?? 0));
  return { face: boxes[0] ?? null, billed: true };
}

/** Square crop around the face (or the top centre of a full-body photo when no face was found) → WebP. */
function cropAvatar(photo: Uint8Array, face: Box | null): Uint8Array {
  const img = PhotonImage.new_from_byteslice(photo);
  try {
    const W = img.get_width();
    const H = img.get_height();
    let side: number, cx: number, cy: number;
    if (face) {
      side = Math.max(face.x2 - face.x1, face.y2 - face.y1) * 1.8;
      cx = (face.x1 + face.x2) / 2;
      cy = (face.y1 + face.y2) / 2;
    } else {
      side = Math.min(W, H) * 0.5;
      cx = W / 2;
      cy = side / 2;
    }
    side = Math.round(Math.min(side, W, H));
    const x1 = Math.max(0, Math.min(W - side, Math.round(cx - side / 2)));
    const y1 = Math.max(0, Math.min(H - side, Math.round(cy - side / 2)));
    const cut = crop(img, x1, y1, x1 + side, y1 + side);
    try {
      const small = resize(cut, AVATAR_PX, AVATAR_PX, SamplingFilter.Lanczos3);
      try {
        return small.get_bytes_webp();
      } finally {
        small.free();
      }
    } finally {
      cut.free();
    }
  } finally {
    img.free();
  }
}

/** R2 key of the avatar for the profile's CURRENT photo. */
export function avatarKey(tenantId: string, p: ProfileRow): string | null {
  return p.primaryPhotoId ? `avatars/${tenantId}/${p.userId}/${p.primaryPhotoId}.webp` : null;
}

/** Build (or rebuild) the face avatar for the profile's current photo. Returns its R2 key, or null. */
export async function buildAvatar(env: Env, db: DB, tenantId: string, p: ProfileRow): Promise<string | null> {
  const key = avatarKey(tenantId, p);
  if (!key || !p.primaryPhotoId) return null;
  const photo = await db.select().from(schema.userPhotos).where(eq(schema.userPhotos.id, p.primaryPhotoId)).get();
  const obj = photo ? await env.BUCKET.get(photo.r2Key) : null;
  if (!obj) return null;
  const bytes = await obj.arrayBuffer();

  const { face, billed } = await findFace(env, bytes, obj.httpMetadata?.contentType ?? 'image/webp');
  let webp: Uint8Array;
  try {
    webp = cropAvatar(new Uint8Array(bytes), face);
  } catch {
    return null;
  }
  await env.BUCKET.put(key, webp, { httpMetadata: { contentType: 'image/webp' } });
  if (p.avatarR2Key && p.avatarR2Key !== key) await env.BUCKET.delete(p.avatarR2Key);
  await db.update(schema.profiles).set({ avatarR2Key: key }).where(eq(schema.profiles.id, p.id)).run();
  if (billed) {
    await db
      .insert(schema.usageEvents)
      .values({ id: newId('ue'), tenantId, userId: p.userId, eventType: 'avatar', costUsd: SAM_COST_USD, createdAt: Date.now() })
      .run();
  }
  return key;
}
