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
import {
  PhotonImage,
  Rgba,
  SamplingFilter,
  crop,
  padding_bottom,
  padding_left,
  padding_right,
  padding_top,
  resize,
} from '@cf-wasm/photon';
import type { Env } from './env';
import { abToBase64, base64ToBytes as b64ToBytes, imageSize, sleep } from './util';
import type { Build } from './quality';

const META_BASE = 'https://api.meta.ai/v1';
export const META_IMAGE_MODEL = 'muse-image-1.0';
export const META_COST_USD = 0.01;
/** Cache variants — part of the cache key and the R2 key suffix. */
export const META_VARIANT = 'meta'; // on the customer's own photo
export const META_SCENE_VARIANT = 'meta-scene-qa'; // in the store's scene, kept only after the quality check (quality.ts)

const PROMPT_OWN_PHOTO =
  'Photorealistic virtual try-on. Image 1 is a person; image 2 shows a clothing item. Render the person from image 1 ' +
  "wearing the garment from image 2. Keep the person's face, hair, body shape, pose, skin tone, hands and the " +
  'background exactly as in image 1; change only the outfit to the garment from image 2, matching its cut, colour, ' +
  'pattern and details as closely as possible. Same framing and lighting as image 1. No text, no watermark.';

// The store-scene rules go in `instructions` (the image model honours them, up to 12,000 characters). Image A
// alone left the store model's slim outline with the customer's face on it, and with the head masked the figure
// sometimes came out mirrored or with the feet turned back — so build, anatomy and facing are spelled out. Lists
// of body parts are left out on purpose: next to revealing garments they trip Meta's content filter.
const sceneRules = (build: Build | null, people: number) =>
  [
    'You are a virtual fitting room. You redraw a store product photo so that the customer is the person wearing the outfit. Every rule below is mandatory.',
    // A photo with several people (a campaign, a collage) becomes all-customer: no store model may remain.
    ...(people > 1
      ? [
          `GROUP - image B shows ${people} people, all with their heads blanked out. Every one of them becomes the customer: the same face, hair and body on each of them, each keeping their own place, pose, garments and framing. No other person remains.`,
        ]
      : []),
    "IDENTITY - the face, facial features, hair (colour, length, texture) and skin tone come only from the customer photos A and A2. Nothing of the store model's identity remains.",
    `BODY SIZE - ${build ? `the customer is ${build}. ` : ''}Draw the customer at their real size and build exactly as in image A, never slimmer. The store model in image B is a different, usually much slimmer person: do not keep the store model's outline. Shoulders, arms, torso, waist, hips and legs all take the customer's size from image A. The clothes keep their cut and are worn by that real body, fitting and folding the way they would on the customer.`,
    'ANATOMY - one physically possible person: head, shoulders, torso, hips, knees and feet all point in consistent directions, never a head or torso turned one way while the legs and feet point the other way. Two arms, two hands with five fingers each, two legs, two feet, natural joints.',
    "POSE - the same pose as image B: the same facing direction (if the person in image B faces the left side of the frame, the customer faces the left side too), the same arm, hand, leg and foot positions. Never mirror or flip the figure or the scene. The head sits where the blank box is and turns the way image B's neck and shoulders indicate.",
    "COMPOSITION - exactly image B's camera framing and crop (a close-up stays a close-up cut at the same place; never zoom out), image B's background, set, light and colour grading. Nothing of image A's background, floor, clothes or pose is used.",
    'GARMENT - the same garments, shoes and accessories as image B: cut, colour, pattern, fabric, length and every detail.',
    'TEXT - any text, logo or graphic printed on image B stays exactly as it is; add no new text, watermark or border, and no grey box remains.',
  ].join('\n');
const SCENE_A = 'Image A - the customer, full body: who they are and their real size and build.';
const SCENE_A2 = "Image A2 - close-up of the customer's face.";
const SCENE_B = "Image B - the store's product photo; the store model's head is blanked out on purpose (flat box).";
/** What failed in an earlier attempt comes back as fixed sentences (quality.ts retryNotes). */
const sceneTask = (build: Build | null, notes: string[], people: number) =>
  `Recreate image B with the customer from image A ${people > 1 ? 'as every person in it' : 'wearing it'}, at the customer's real ${build ? `${build} ` : ''}size, following every rule.` +
  (notes.length ? ` A previous attempt was rejected. Fix this: ${notes.join(' ')}` : '');

// Muse Image searches the web and runs code on its own by default; a try-on needs neither.
const TOOLS_OFF = { enable_image_search: false, enable_web_search: false, enable_shell: false };

/** Meta's content-safety filter refused the request (HTTP 400 content_policy_violation). */
export class MetaBlockedError extends Error {}

export interface MetaImage {
  bytes: Uint8Array;
  contentType: string;
  latencyMs: number;
}

/** Width and height of the image in a data URI, read from its header (no decoding). */
function dims(dataUri: string): { w: number; h: number } | null {
  try {
    const d = imageSize(b64ToBytes(dataUri.slice(dataUri.indexOf(',') + 1)));
    return d && d.w && d.h ? d : null;
  } catch {
    return null;
  }
}

/** /images/edits: "WxH" with the image's own aspect ratio, ~1024px wide (Muse Image keeps only the ratio). */
function sizeLike(dataUri: string): string | undefined {
  const d = dims(dataUri);
  return d ? `1024x${Math.round((1024 * d.h) / d.w)}` : undefined; // unreadable → the API's default
}

/**
 * /responses image_generation tool: only these sizes are accepted (any other "WxH" is a 400). A photo of another
 * shape is padded to the nearest one with its own edge colour before it is sent, and the result is cropped back
 * to the photo's shape: campaign text and framing stay where they were. (Sent as is, Muse Image re-laid the photo
 * out to the new shape and pushed text to the edges, where the page's object-fit: cover then cut it.)
 */
const TOOL_SIZES = [
  { size: '1024x1024', ratio: 1 },
  { size: '1024x1536', ratio: 2 / 3 },
  { size: '1536x1024', ratio: 3 / 2 },
];

/** Longest side a store photo is sent at. */
const MAX_SIDE = 1536;

/** Where the photo sits inside the padded image (pixels of the padded image). */
interface PadBox {
  l: number;
  t: number;
  w: number;
  h: number;
  W: number;
  H: number;
}

/** Mean colour of two thin strips of the image (the backdrop the padding continues). */
function stripColour(img: PhotonImage, strips: Array<[number, number, number, number]>): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [x1, y1, x2, y2] of strips) {
    const s = crop(img, x1, y1, x2, y2);
    try {
      const px = s.get_raw_pixels();
      for (let i = 0; i < px.length; i += 4) {
        r += px[i];
        g += px[i + 1];
        b += px[i + 2];
        n++;
      }
    } finally {
      s.free();
    }
  }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [128, 128, 128];
}

/** photon takes an Rgba by value (the call consumes it), so every padding call gets its own. */
const rgba = ([r, g, b]: [number, number, number]) => new Rgba(r, g, b, 255);

/** The store photo as the tool receives it: its accepted size, and where the photo sits when it was padded. */
export interface PreparedScene {
  dataUri: string;
  size?: string;
  box?: PadBox;
}

/**
 * The masked store photo as the tool must receive it, decoded once: stretched sideways by `widen` around its
 * centre and cropped back to its own size (the figure Muse Image follows is then about the customer's width —
 * told only in words, it kept the store model's outline on form-fitting clothes), then padded to the nearest
 * accepted size when its shape differs by more than 2%.
 */
export function prepareScene(maskedDataUri: string, widen = 1): PreparedScene {
  const d = dims(maskedDataUri);
  if (!d) return { dataUri: maskedDataUri };
  const r = d.w / d.h;
  const t = TOOL_SIZES.reduce((a, b) => (Math.abs(Math.log(b.ratio / r)) < Math.abs(Math.log(a.ratio / r)) ? b : a));
  const pad = Math.abs(Math.log(r / t.ratio)) >= 0.02;
  // The tool works at ~1024-1536 px: a bigger photo (a 2880 px campaign banner) is scaled down first, padding
  // it at full size ran out of the Worker's memory and CPU.
  const big = Math.max(d.w, d.h) > MAX_SIDE;
  if (!pad && widen <= 1 && !big) return { dataUri: maskedDataUri, size: t.size };
  const owned: PhotonImage[] = [];
  try {
    let img = PhotonImage.new_from_byteslice(b64ToBytes(maskedDataUri.slice(maskedDataUri.indexOf(',') + 1)));
    owned.push(img);
    if (big) {
      const s = MAX_SIDE / Math.max(d.w, d.h);
      img = resize(img, Math.round(d.w * s), Math.round(d.h * s), SamplingFilter.Triangle);
      owned.push(img);
    }
    const w = img.get_width();
    const h = img.get_height();
    if (widen > 1) {
      const W = Math.round(w * widen);
      const wide = resize(img, W, h, SamplingFilter.Triangle);
      owned.push(wide);
      const left = Math.floor((W - w) / 2);
      img = crop(wide, left, 0, left + w, h);
      owned.push(img);
    }
    let box: PadBox | undefined;
    if (pad) {
      let a: PhotonImage;
      if (r < t.ratio) {
        const W = Math.round(h * t.ratio);
        const left = Math.floor((W - w) / 2);
        const colour = stripColour(img, [[0, 0, 2, h], [w - 2, 0, w, h]]);
        a = padding_left(img, left, rgba(colour));
        owned.push(a);
        img = padding_right(a, W - w - left, rgba(colour));
        box = { l: left, t: 0, w, h, W, H: h };
      } else {
        const H = Math.round(w / t.ratio);
        const top = Math.floor((H - h) / 2);
        const colour = stripColour(img, [[0, 0, w, 2], [0, h - 2, w, h]]);
        a = padding_top(img, top, rgba(colour));
        owned.push(a);
        img = padding_bottom(a, H - h - top, rgba(colour));
        box = { l: 0, t: top, w, h, W: w, H };
      }
      owned.push(img);
    }
    return { dataUri: `data:image/jpeg;base64,${abToBase64(img.get_bytes_jpeg(92))}`, size: t.size, box };
  } catch {
    return { dataUri: maskedDataUri, size: t.size }; // unreadable here → sent as is, the page crops it
  } finally {
    owned.forEach((o) => o.free());
  }
}

/** Cut the padding back off the generated image (JPEG: photon's WebP encoder is lossless and heavy). */
function cropBack(out: MetaImage, box: PadBox): MetaImage {
  try {
    const img = PhotonImage.new_from_byteslice(out.bytes);
    try {
      const sx = img.get_width() / box.W;
      const sy = img.get_height() / box.H;
      const c = crop(img, Math.round(box.l * sx), Math.round(box.t * sy), Math.round((box.l + box.w) * sx), Math.round((box.t + box.h) * sy));
      try {
        return { bytes: c.get_bytes_jpeg(90), contentType: 'image/jpeg', latencyMs: out.latencyMs };
      } finally {
        c.free();
      }
    } finally {
      img.free();
    }
  } catch {
    return out;
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
  let wait = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(wait || 1500 * attempt + Math.random() * 1000);
    wait = 0;
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
    // Rate limited (150 images a minute): wait as long as Meta asks, up to 20 s.
    if (r.status === 429) wait = Math.min(20, Math.max(2, Number(r.headers.get('Retry-After')) || 5)) * 1000;
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

/**
 * Try-on in the store's scene: the customer takes the place of the store's model in the product photo
 * (`scene` from prepareScene — prepared once, reused by every attempt with the same stretch).
 */
export async function metaSceneTryon(
  env: Env,
  bodyDataUri: string,
  faceDataUri: string | null,
  scene: PreparedScene,
  endUser: string,
  opts: { build?: Build | null; notes?: string[]; people?: number } = {},
): Promise<MetaImage> {
  const people = opts.people ?? 1;
  const content: Array<Record<string, string>> = [
    { type: 'input_text', text: SCENE_A },
    { type: 'input_image', image_url: bodyDataUri },
  ];
  if (faceDataUri) {
    content.push({ type: 'input_text', text: SCENE_A2 }, { type: 'input_image', image_url: faceDataUri });
  }
  content.push(
    { type: 'input_text', text: SCENE_B },
    { type: 'input_image', image_url: scene.dataUri },
    { type: 'input_text', text: sceneTask(opts.build ?? null, opts.notes ?? [], people) },
  );
  // A padded photo is cropped back here: JPEG decodes far cheaper than WebP inside the Worker's CPU budget.
  const format = scene.box ? 'jpeg' : 'webp';
  const tool: Record<string, unknown> = { type: 'image_generation', output_format: format, ...TOOLS_OFF };
  if (scene.size) tool.size = scene.size;
  const body = {
    model: META_IMAGE_MODEL,
    instructions: sceneRules(opts.build ?? null, people),
    input: [{ role: 'user', content }],
    tools: [tool],
    store: false, // nothing to continue — keep the customer's photos off Meta's response store
    safety_identifier: endUser,
  };
  const out = await callMeta(env, '/responses', body, (j) => {
    const item = (j.output ?? []).find((o: any) => o.type === 'image_generation_call' && o.result);
    return { b64: item?.result, format };
  });
  return scene.box ? cropBack(out, scene.box) : out;
}
