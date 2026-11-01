// ============================================================================
// Muse Image (muse-image-1.0) on the Meta Model API — the try-on engine. Two ways to dress the customer:
//
// · In the STORE's scene (default): the customer appears in the store's own product photo — same garment,
//   shoes, pose, framing, background and light. Responses API, one user message with captioned images:
//   A = the customer (full body), A2 = a close-up of their face, B = the product photo with the model's
//   head blanked out (scene.ts). Muse Image copies any face it can see, so it must not see the model's.
//
// · On the CUSTOMER's own photo: /v1/images/edits with image 1 = the customer, image 2 = the product photo.
//   Used when the product photo has no person in it (flat lays, packshots).
//
// One synchronous call returns the finished image (WebP). $0.01 per generated image; failed or
// safety-filtered images are not billed. Docs: https://dev.meta.ai/docs/image-generation
// ============================================================================
import { PhotonImage } from '@cf-wasm/photon';
import type { Env } from './env';
import { sleep } from './util';

const META_BASE = 'https://api.meta.ai/v1';
export const META_IMAGE_MODEL = 'muse-image-1.0';
export const META_COST_USD = 0.01;
/** Cache variants — part of the cache key and the R2 key suffix. */
export const META_VARIANT = 'meta'; // on the customer's own photo
export const META_SCENE_VARIANT = 'meta-scene'; // in the store's scene

const PROMPT_OWN_PHOTO =
  'Photorealistic virtual try-on. Image 1 is a person; image 2 shows a clothing item. Render the person from image 1 ' +
  "wearing the garment from image 2. Keep the person's face, hair, body shape, pose, skin tone, hands and the " +
  'background exactly as in image 1; change only the outfit to the garment from image 2, matching its cut, colour, ' +
  'pattern and details as closely as possible. Same framing and lighting as image 1. No text, no watermark.';

const SCENE_A =
  "Image A - the customer, full body. Keep this person's identity exactly: face, facial features, hair (colour, " +
  'length, texture), skin tone, and body build and proportions.';
const SCENE_A2 = "Image A2 - a close-up of the same customer's face, for an exact likeness.";
const SCENE_B =
  "Image B - the store's product photo. The original model's head was blanked out on purpose; take only the " +
  'garment, the shoes, the pose, the camera framing, the background and the lighting from it.';
const sceneTask = (withCloseup: boolean) =>
  'Recreate image B as a finished, photorealistic product photo: the same garment exactly as in image B (cut, ' +
  'colour, length, neckline and every detail), the same shoes, the same pose, the same camera framing, the same ' +
  'background and the same lighting - worn by the customer from image A: their head, face and hair exactly as in ' +
  `image A${withCloseup ? ' and A2' : ''}, their skin tone on the arms, hands and legs, and their own body build and ` +
  'proportions (the garment fits their real body). Natural neck and shoulders, seamless result. No grey box, no ' +
  'text, no watermark.';

// Muse Image searches the web and runs code on its own by default; a try-on needs neither.
const TOOLS_OFF = { enable_image_search: false, enable_web_search: false, enable_shell: false };

/** Meta's content-safety filter refused the request (HTTP 400 content_policy_violation). */
export class MetaBlockedError extends Error {}

export interface MetaImage {
  bytes: Uint8Array;
  contentType: string;
  latencyMs: number;
}

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

/** POST to the Meta Model API and pull the image out. Retries 429 / 5xx / network; other 4xx are fatal. */
async function callMeta(
  env: Env,
  path: '/images/edits' | '/responses',
  body: Record<string, unknown>,
  pick: (j: any) => { b64?: string; format?: string },
): Promise<MetaImage> {
  if (!env.META_KEY) throw new Error('META_KEY is not configured');
  const t0 = Date.now();
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    let r: Response;
    try {
      r = await fetch(`${META_BASE}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.META_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = String(e);
      continue; // network blip — retry
    }
    const j = (await r.json().catch(() => ({}))) as any;
    const { b64, format } = r.ok ? pick(j) : {};
    if (b64) return { bytes: b64ToBytes(b64), contentType: `image/${format ?? 'webp'}`, latencyMs: Date.now() - t0 };
    const err = j?.error as { code?: string; message?: string } | undefined;
    if (err?.code === 'content_policy_violation') {
      throw new MetaBlockedError(err.message ?? 'Blocked by Meta content safety.');
    }
    lastErr = `${r.status} ${err?.message ?? JSON.stringify(j).slice(0, 300)}`;
    if (r.ok) continue; // completed without an image — run it again
    if (r.status !== 429 && r.status < 500) break; // our request is wrong — retrying won't help
  }
  throw new Error(`Muse Image try-on failed: ${lastErr}`);
}

/** Try-on on the customer's own photo (their pose, background and light). */
export async function metaTryon(env: Env, bodyDataUri: string, garmentDataUri: string, endUser: string): Promise<MetaImage> {
  const body: Record<string, unknown> = {
    model: META_IMAGE_MODEL,
    prompt: PROMPT_OWN_PHOTO,
    images: [{ image_url: bodyDataUri }, { image_url: garmentDataUri }],
    n: 1,
    output_format: 'webp',
    response_format: 'b64_json',
    tool_enablement: TOOLS_OFF,
    user: endUser,
  };
  // The result replaces the store's product photo on the page → give it that photo's aspect ratio.
  const size = sizeLike(garmentDataUri);
  if (size) body.size = size;
  return callMeta(env, '/images/edits', body, (j) => ({ b64: j.data?.[0]?.b64_json, format: j.output_format }));
}

/** Try-on in the store's scene: the customer takes the place of the store's model in the product photo. */
export async function metaSceneTryon(
  env: Env,
  bodyDataUri: string,
  faceDataUri: string | null,
  maskedSceneDataUri: string,
  endUser: string,
): Promise<MetaImage> {
  const content: Array<Record<string, string>> = [
    { type: 'input_text', text: SCENE_A },
    { type: 'input_image', image_url: bodyDataUri },
  ];
  if (faceDataUri) {
    content.push({ type: 'input_text', text: SCENE_A2 }, { type: 'input_image', image_url: faceDataUri });
  }
  content.push(
    { type: 'input_text', text: SCENE_B },
    { type: 'input_image', image_url: maskedSceneDataUri },
    { type: 'input_text', text: sceneTask(!!faceDataUri) },
  );
  const tool: Record<string, unknown> = { type: 'image_generation', output_format: 'webp', ...TOOLS_OFF };
  const size = sizeLike(maskedSceneDataUri);
  if (size) tool.size = size;
  const body = {
    model: META_IMAGE_MODEL,
    input: [{ role: 'user', content }],
    tools: [tool],
    store: false, // nothing to continue — keep the customer's photos off Meta's response store
    safety_identifier: endUser,
  };
  return callMeta(env, '/responses', body, (j) => {
    const item = (j.output ?? []).find((o: any) => o.type === 'image_generation_call' && o.result);
    return { b64: item?.result, format: 'webp' };
  });
}
