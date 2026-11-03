// ============================================================================
// Face avatar + face close-up — SAM 3.1 finds the face in the profile photo (text prompt "face");
// the server crops a square around it and stores two images, built once per photo:
//   · the avatar, 128×128 WebP, shown everywhere so it is clear who is trying clothes on;
//   · the close-up, up to 512 px JPEG, sent to Muse Image with every store-photo try-on for an exact likeness.
// ============================================================================
import { eq } from 'drizzle-orm';
import { PhotonImage, crop, resize, SamplingFilter } from '@cf-wasm/photon';
import * as schema from './db/schema';
import type { DB } from './db/client';
import type { Env } from './env';
import type { ProfileRow } from './profiles';
import { samBoxes, SAM_COST_USD, type Box } from './sam';
import { dataUri, newId } from './util';

const AVATAR_PX = 128; // shown at 24–32 px (2× on retina) — the WebP encoder is lossless, so keep it small
const CLOSEUP_PX = 512;

/** Square crop around the face (side = face × k), or the top centre of a full-body photo when there is no face. */
function cropSquare(img: PhotonImage, face: Box | null, k: number, px: number): PhotonImage {
  const W = img.get_width();
  const H = img.get_height();
  let side: number, cx: number, cy: number;
  if (face) {
    side = Math.max(face.x2 - face.x1, face.y2 - face.y1) * k;
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
  if (side <= px) return cut;
  try {
    return resize(cut, px, px, SamplingFilter.Lanczos3);
  } finally {
    cut.free();
  }
}

function encode(photo: Uint8Array, face: Box | null, k: number, px: number, as: 'webp' | 'jpeg'): Uint8Array {
  const img = PhotonImage.new_from_byteslice(photo);
  try {
    const sq = cropSquare(img, face, k, px);
    try {
      return as === 'webp' ? sq.get_bytes_webp() : sq.get_bytes_jpeg(90);
    } finally {
      sq.free();
    }
  } finally {
    img.free();
  }
}

/** R2 key of the avatar for the profile's CURRENT photo. */
export function avatarKey(tenantId: string, p: ProfileRow): string | null {
  return p.primaryPhotoId ? `avatars/${tenantId}/${p.userId}/${p.primaryPhotoId}.webp` : null;
}

/** R2 key of the face close-up for one photo. */
export function closeupKey(tenantId: string, userId: string, photoId: string): string {
  return `faces/${tenantId}/${userId}/${photoId}.jpg`;
}

/** The profile's current photo (bytes + type), or null. */
export async function loadPhoto(env: Env, db: DB, p: ProfileRow) {
  if (!p.primaryPhotoId) return null;
  const photo = await db.select().from(schema.userPhotos).where(eq(schema.userPhotos.id, p.primaryPhotoId)).get();
  const obj = photo ? await env.BUCKET.get(photo.r2Key) : null;
  if (!obj) return null;
  return { bytes: await obj.arrayBuffer(), mime: obj.httpMetadata?.contentType ?? 'image/webp' };
}

async function logSam(db: DB, tenantId: string, userId: string, eventType: string) {
  await db
    .insert(schema.usageEvents)
    .values({ id: newId('ue'), tenantId, userId, eventType, costUsd: SAM_COST_USD, createdAt: Date.now() })
    .run();
}

/** Build (or rebuild) the avatar — and the face close-up — for the profile's current photo. Returns the avatar key. */
export async function buildAvatar(env: Env, db: DB, tenantId: string, p: ProfileRow): Promise<string | null> {
  const key = avatarKey(tenantId, p);
  if (!key || !p.primaryPhotoId) return null;
  const photo = await loadPhoto(env, db, p);
  if (!photo) return null;

  const { boxes, billed } = await samBoxes(env, dataUri(photo.bytes, photo.mime), 'face');
  const face = boxes[0] ?? null;
  const bytes = new Uint8Array(photo.bytes);
  let webp: Uint8Array;
  try {
    webp = encode(bytes, face, 1.8, AVATAR_PX, 'webp');
    if (face) {
      await env.BUCKET.put(closeupKey(tenantId, p.userId, p.primaryPhotoId), encode(bytes, face, 1.7, CLOSEUP_PX, 'jpeg'), {
        httpMetadata: { contentType: 'image/jpeg' },
      });
    }
  } catch {
    return null;
  }
  await env.BUCKET.put(key, webp, { httpMetadata: { contentType: 'image/webp' } });
  if (p.avatarR2Key && p.avatarR2Key !== key) await env.BUCKET.delete(p.avatarR2Key);
  await db.update(schema.profiles).set({ avatarR2Key: key }).where(eq(schema.profiles.id, p.id)).run();
  if (billed) await logSam(db, tenantId, p.userId, 'avatar');
  return key;
}

/**
 * The face close-up of the profile's current photo as a data URI (built on first use for photos uploaded
 * before close-ups existed). Null when the photo has no detectable face — the try-on then goes without it.
 */
export async function faceCloseup(env: Env, db: DB, tenantId: string, p: ProfileRow): Promise<string | null> {
  if (!p.primaryPhotoId) return null;
  const key = closeupKey(tenantId, p.userId, p.primaryPhotoId);
  const hit = await env.BUCKET.get(key);
  if (hit) return dataUri(await hit.arrayBuffer(), 'image/jpeg');

  const photo = await loadPhoto(env, db, p);
  if (!photo) return null;
  const { boxes, billed } = await samBoxes(env, dataUri(photo.bytes, photo.mime), 'face');
  if (billed) await logSam(db, tenantId, p.userId, 'face');
  if (!boxes[0]) return null;
  let jpeg: Uint8Array;
  try {
    jpeg = encode(new Uint8Array(photo.bytes), boxes[0], 1.7, CLOSEUP_PX, 'jpeg');
  } catch {
    return null;
  }
  await env.BUCKET.put(key, jpeg, { httpMetadata: { contentType: 'image/jpeg' } });
  return dataUri(jpeg.slice().buffer, 'image/jpeg');
}
