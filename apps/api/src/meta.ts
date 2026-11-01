// ============================================================================
// Muse Image (muse-image-1.0) on the Meta Model API — the try-on engine.
// The try-on is an edit of the CUSTOMER's own photo: image 1 = the customer, image 2 = the store's
// product photo (the garment reference). One synchronous call returns the finished image (WebP).
// $0.01 per generated image; failed or safety-filtered images are not billed.
// Docs: https://dev.meta.ai/docs/image-generation
//
// The customer's photo stays the base. Putting the customer INTO the store's photo (the model's pose)
// does not work with Muse Image: with two different prompts it returns the store's model, not the customer.
// ============================================================================
import { PhotonImage } from '@cf-wasm/photon';
import type { Env } from './env';
import { sleep } from './util';

const META_BASE = 'https://api.meta.ai/v1';
export const META_IMAGE_MODEL = 'muse-image-1.0';
export const META_COST_USD = 0.01;
/** Cache variant — part of the cache key and the R2 key suffix. */
export const META_VARIANT = 'meta';

const PROMPT =
  'Photorealistic virtual try-on. Image 1 is a person; image 2 shows a clothing item. Render the person from image 1 ' +
  "wearing the garment from image 2. Keep the person's face, hair, body shape, pose, skin tone, hands and the " +
  'background exactly as in image 1; change only the outfit to the garment from image 2, matching its cut, colour, ' +
  'pattern and details as closely as possible. Same framing and lighting as image 1. No text, no watermark.';

/** Meta's content-safety filter refused the request (HTTP 400 content_policy_violation). */
export class MetaBlockedError extends Error {}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** "WxH" with the aspect ratio of the image in `dataUri`, ~1024px wide (Muse Image keeps only the ratio). */
function sizeLike(dataUri: string): string | undefined {
  try {
    const img = PhotonImage.new_from_byteslice(b64ToBytes(dataUri.slice(dataUri.indexOf(',') + 1)));
    try {
      const w = img.get_width();
      const h = img.get_height();
      return w && h ? `1024x${Math.round((1024 * h) / w)}` : undefined;
    } finally {
      img.free();
    }
  } catch {
    return undefined; // unreadable → let the API use its default
  }
}

/** Generate one try-on with Muse Image. Retries transient failures (429 / 5xx / network); other 4xx are fatal. */
export async function metaTryon(
  env: Env,
  bodyDataUri: string,
  garmentDataUri: string,
): Promise<{ bytes: Uint8Array; contentType: string; latencyMs: number }> {
  if (!env.META_KEY) throw new Error('META_KEY is not configured');
  const t0 = Date.now();
  const reqBody: Record<string, unknown> = {
    model: META_IMAGE_MODEL,
    prompt: PROMPT,
    images: [{ image_url: bodyDataUri }, { image_url: garmentDataUri }],
    n: 1,
    output_format: 'webp',
    response_format: 'b64_json',
  };
  // The result replaces the store's product photo on the page → give it that photo's aspect ratio.
  const size = sizeLike(garmentDataUri);
  if (size) reqBody.size = size;

  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    let r: Response;
    try {
      r = await fetch(`${META_BASE}/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.META_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
    } catch (e) {
      lastErr = String(e);
      continue; // network blip — retry
    }
    const j = (await r.json().catch(() => ({}))) as {
      data?: Array<{ b64_json?: string }>;
      output_format?: string;
      error?: { code?: string; message?: string };
    };
    const b64 = j.data?.[0]?.b64_json;
    if (r.ok && b64) {
      return { bytes: b64ToBytes(b64), contentType: `image/${j.output_format ?? 'webp'}`, latencyMs: Date.now() - t0 };
    }
    if (r.status === 400 && j.error?.code === 'content_policy_violation') {
      throw new MetaBlockedError(j.error.message ?? 'Blocked by Meta content safety.');
    }
    lastErr = `${r.status} ${j.error?.message ?? JSON.stringify(j).slice(0, 300)}`;
    if (r.status !== 429 && r.status < 500) break; // our request is wrong — retrying won't help
  }
  throw new Error(`Muse Image try-on failed: ${lastErr}`);
}
