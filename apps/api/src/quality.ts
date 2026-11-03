// ============================================================================
// Muse Spark (muse-spark-1.3) on the Meta Model API — the try-on's quality gate.
//
// · bodyBuild: the customer's build on a fixed scale, read once per profile photo and kept in R2. Muse Image
//   gets it in words: shown only the customer's photo, it kept the store model's slim outline.
// · checkTryon: every try-on in the store's scene is inspected before it is kept — the customer's build and
//   face, one physically possible body, the store photo's pose and facing (never mirrored), its framing,
//   garment and printed text. What failed goes back to Muse Image as fixed instructions: the inspector's own
//   words are never sent, free text about bodies trips Meta's content filter.
// ============================================================================
import type { Env } from './env';
import { sleep } from './util';

const META_BASE = 'https://api.meta.ai/v1';
const SPARK_MODEL = 'muse-spark-1.3';
/** About what one call costs (three photos + medium reasoning; one photo + low reasoning), for the usage log. */
export const QA_COST_USD = 0.012;
export const BUILD_COST_USD = 0.003;

export const BUILDS = ['very slim', 'slim', 'average', 'curvy', 'plus-size', 'large plus-size'] as const;
export type Build = (typeof BUILDS)[number];
const FACING = ['left', 'right', 'camera', 'away'] as const;
type Facing = (typeof FACING)[number];

export function buildKey(tenantId: string, userId: string, photoId: string): string {
  return `builds/${tenantId}/${userId}/${photoId}.txt`;
}

/** One structured answer from Muse Spark. Retries 429 / 5xx / network / unreadable answers. */
async function spark<T>(
  env: Env,
  content: Array<Record<string, string>>,
  name: string,
  schema: Record<string, unknown>,
  effort: 'low' | 'medium',
): Promise<T> {
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * attempt + Math.random() * 1000);
    let r: Response;
    try {
      r = await fetch(`${META_BASE}/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.META_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: SPARK_MODEL,
          reasoning: { effort },
          store: false,
          input: [{ role: 'user', content }],
          text: { format: { type: 'json_schema', name, strict: true, schema } },
        }),
      });
    } catch (e) {
      lastErr = String(e);
      continue;
    }
    const j = (await r.json().catch(() => ({}))) as any;
    if (r.ok) {
      const text = (j.output ?? [])
        .filter((o: any) => o.type === 'message')
        .flatMap((o: any) => o.content ?? [])
        .map((c: any) => c.text ?? '')
        .join('');
      try {
        return JSON.parse(text) as T;
      } catch {
        lastErr = 'unreadable answer';
        continue;
      }
    }
    lastErr = `${r.status} ${j?.error?.message ?? ''}`;
    if (r.status !== 429 && r.status < 500) break;
  }
  throw new Error(`Muse Spark failed: ${lastErr}`);
}

/** The customer's build, from their profile photo (once per photo, kept in R2). null if it can't be read. */
export async function bodyBuild(
  env: Env,
  tenantId: string,
  userId: string,
  photoId: string,
  bodyDataUri: string,
): Promise<{ build: Build | null; billed: boolean }> {
  const key = buildKey(tenantId, userId, photoId);
  const hit = await env.BUCKET.get(key);
  if (hit) {
    const b = (await hit.text()) as Build;
    if (BUILDS.includes(b)) return { build: b, billed: false };
  }
  try {
    const r = await spark<{ build: Build }>(
      env,
      [
        { type: 'input_image', image_url: bodyDataUri },
        {
          type: 'input_text',
          text: `A customer photo for a virtual fitting room. Rate the person's body build on this scale: ${BUILDS.join(', ')}. Judge real body size, not the clothes.`,
        },
      ],
      'build',
      { type: 'object', additionalProperties: false, required: ['build'], properties: { build: { type: 'string', enum: BUILDS } } },
      'low',
    );
    await env.BUCKET.put(key, r.build, { httpMetadata: { contentType: 'text/plain' } });
    return { build: r.build, billed: true };
  } catch {
    return { build: null, billed: false };
  }
}

const VS_STORE = ['slimmer', 'about the same', 'clearly bigger'] as const;
const VS_CUSTOMER = ['slimmer than the customer', 'same as the customer', 'bigger than the customer'] as const;

export interface Verdict {
  pass: boolean;
  storeBuild: Build;
  resultBuild: Build;
  resultVsStore: (typeof VS_STORE)[number];
  resultVsCustomer: (typeof VS_CUSTOMER)[number];
  storeFacing: Facing;
  resultFacing: Facing;
  faceOk: boolean;
  bodyOk: boolean;
  anatomyOk: boolean;
  poseOk: boolean;
  mirrored: boolean;
  garmentOk: boolean;
  textOk: boolean;
  /** The store photo has text or graphics printed on top of it (a campaign image): it is never stretched. */
  storeHasText: boolean;
  problems: string;
}

interface QaAnswer {
  store_model_build: Build;
  result_build: Build;
  result_vs_store: Verdict['resultVsStore'];
  result_vs_customer: Verdict['resultVsCustomer'];
  store_facing: Facing;
  result_facing: Facing;
  face_is_customer: boolean;
  anatomy_ok: boolean;
  pose_ok: boolean;
  garment_ok: boolean;
  text_ok: boolean;
  store_has_text: boolean;
  problems: string;
}

const QA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'store_model_build',
    'result_build',
    'result_vs_store',
    'result_vs_customer',
    'store_facing',
    'result_facing',
    'face_is_customer',
    'anatomy_ok',
    'pose_ok',
    'garment_ok',
    'text_ok',
    'store_has_text',
    'problems',
  ],
  properties: {
    store_model_build: { type: 'string', enum: BUILDS },
    result_build: { type: 'string', enum: BUILDS },
    result_vs_store: { type: 'string', enum: VS_STORE },
    result_vs_customer: { type: 'string', enum: VS_CUSTOMER },
    store_facing: { type: 'string', enum: FACING },
    result_facing: { type: 'string', enum: FACING },
    face_is_customer: { type: 'boolean' },
    anatomy_ok: { type: 'boolean' },
    pose_ok: { type: 'boolean' },
    garment_ok: { type: 'boolean' },
    text_ok: { type: 'boolean' },
    store_has_text: { type: 'boolean' },
    problems: { type: 'string' },
  },
};

// Asked for a build alone, the inspector rated a rounder face on the store model's slim body as the customer's
// build; the body is judged below the neck, and by direct comparison with both people.
const QA_TASK =
  "Strict inspection of IMAGE 3 for a virtual try-on: it must show the customer of image 2, at the customer's own body size, in the outfit, pose and scene of image 1.\n" +
  'Body size: look only at the body below the neck. The face does not count, and loose clothes do not make a body bigger - judge the width of the shoulders, upper arms, waist, hips and legs, and how the clothes sit on them.\n' +
  `- store_model_build and result_build: the body build of the person in image 1 and in image 3 on this scale: ${BUILDS.join(', ')}.\n` +
  '- result_vs_store: compared with the person in image 1, is the body in image 3 slimmer, about the same, or clearly bigger?\n' +
  '- result_vs_customer: compared with the customer in image 2, is the body in image 3 slimmer than the customer, the same as the customer, or bigger than the customer?\n' +
  '- store_facing and result_facing: which side of the frame the body and feet of the person in image 1 and in image 3 point to: left, right, camera (towards the viewer) or away (back to the viewer).\n' +
  "- face_is_customer: the face and hair are the customer's.\n" +
  '- anatomy_ok: a physically possible body: head, torso, hips, legs and feet point in consistent directions (a torso facing one way with feet pointing the other way = false), the right number of arms, hands, legs and feet, natural joints and hands.\n' +
  '- pose_ok: the same body pose, arm and leg positions, camera framing/crop and background as image 1, not mirrored (head angle and expression may differ; the face may be visible even if image 1 cut it).\n' +
  '- garment_ok: the same garments as image 1 (cut, colour, pattern, length, details).\n' +
  '- text_ok: text and graphics printed on image 1 are unchanged in image 3 (true if there are none).\n' +
  '- store_has_text: image 1 has text, a logo or graphics printed on top of the photo (not on the garment).\n' +
  '- problems: the concrete defects, short, empty if none.';

/** The same inspection for a photo with several people: every one of them must have become the customer. */
const qaTaskGroup = (people: number) =>
  `Strict inspection of IMAGE 3 for a virtual try-on of a photo with ${people} people: in IMAGE 3 every one of them must be the customer of image 2 (the customer's face, hair and body size), each keeping their own outfit, pose and place from image 1. No other person may remain.\n` +
  'Body size: look only at the bodies below the neck. Faces do not count, and loose clothes do not make a body bigger - judge the width of the shoulders, upper arms, waist, hips and legs, and how the clothes sit on them.\n' +
  `- store_model_build and result_build: the body build of the people in image 1 and of the slimmest person in image 3 on this scale: ${BUILDS.join(', ')}.\n` +
  '- result_vs_store: compared with the people in image 1, are the bodies in image 3 slimmer, about the same, or clearly bigger?\n' +
  '- result_vs_customer: compared with the customer in image 2, is the slimmest body in image 3 slimmer than the customer, the same as the customer, or bigger than the customer?\n' +
  '- store_facing and result_facing: which side of the frame the body and feet of the most prominent person in image 1 and in image 3 point to: left, right, camera (towards the viewer) or away (back to the viewer).\n' +
  "- face_is_customer: every face and hair in image 3 is the customer's (false if any other person remains).\n" +
  '- anatomy_ok: every body is physically possible: head, torso, hips, legs and feet point in consistent directions, the right number of arms, hands, legs and feet, natural joints and hands.\n' +
  '- pose_ok: the same poses, places, camera framing/crop and background as image 1, not mirrored (head angles and expressions may differ; faces may be visible even if image 1 cut them).\n' +
  '- garment_ok: every person wears the same garments as in image 1 (cut, colour, pattern, length, details).\n' +
  '- text_ok: text and graphics printed on image 1 are unchanged in image 3 (true if there are none).\n' +
  '- store_has_text: image 1 has text, a logo or graphics printed on top of the photo (not on the garments).\n' +
  '- problems: the concrete defects, short, empty if none.';

/**
 * The customer's size is kept when the inspector sees the customer's body, and — when the customer is fuller
 * (or slimmer) than the store model — a body clearly bigger (or slimmer) than the model's.
 */
function bodyKept(customer: Build | null, q: QaAnswer): boolean {
  if (q.result_vs_customer !== 'same as the customer') return false;
  if (!customer) return true;
  const gap = BUILDS.indexOf(customer) - BUILDS.indexOf(q.store_model_build);
  return gap > 0 ? q.result_vs_store === 'clearly bigger' : gap < 0 ? q.result_vs_store === 'slimmer' : true;
}

/** Inspect a try-on against the store photo and the customer's photo. */
export async function checkTryon(
  env: Env,
  storeDataUri: string,
  bodyDataUri: string,
  resultDataUri: string,
  build: Build | null,
  people = 1,
): Promise<Verdict> {
  const q = await spark<QaAnswer>(
    env,
    [
      { type: 'input_text', text: `IMAGE 1 - the store product photo (original ${people > 1 ? 'models' : 'model'}).` },
      { type: 'input_image', image_url: storeDataUri },
      { type: 'input_text', text: `IMAGE 2 - the customer${build ? ` (build: ${build})` : ''}.` },
      { type: 'input_image', image_url: bodyDataUri },
      { type: 'input_text', text: 'IMAGE 3 - the virtual try-on result to inspect.' },
      { type: 'input_image', image_url: resultDataUri },
      { type: 'input_text', text: people > 1 ? qaTaskGroup(people) : QA_TASK },
    ],
    'qa',
    QA_SCHEMA,
    'medium',
  );
  const sides = ['left', 'right'];
  const v: Verdict = {
    pass: false,
    storeBuild: q.store_model_build,
    resultBuild: q.result_build,
    resultVsStore: q.result_vs_store,
    resultVsCustomer: q.result_vs_customer,
    storeFacing: q.store_facing,
    resultFacing: q.result_facing,
    faceOk: q.face_is_customer,
    bodyOk: bodyKept(build, q),
    anatomyOk: q.anatomy_ok,
    poseOk: q.pose_ok,
    mirrored: sides.includes(q.store_facing) && sides.includes(q.result_facing) && q.store_facing !== q.result_facing,
    garmentOk: q.garment_ok,
    textOk: q.text_ok,
    storeHasText: q.store_has_text,
    problems: q.problems,
  };
  v.pass = v.faceOk && v.bodyOk && v.anatomyOk && v.poseOk && !v.mirrored && v.garmentOk && v.textOk;
  return v;
}

/** Stretch of image B for each step of the build gap (customer fuller than the store model). */
const WIDEN = [1, 1.1, 1.18, 1.27, 1.35, 1.42];
const WIDEN_STEP = 0.12;

/**
 * How far image B is stretched sideways for the next attempt (1 = not at all). Told only in words, Muse Image
 * kept tracing the store model's outline on form-fitting clothes; a wider figure in image B it follows. Photos
 * with printed text are never stretched (the text would be too).
 */
export function nextWiden(v: Verdict, build: Build | null, current: number): number {
  if (!build || v.bodyOk || v.storeHasText) return current;
  if (v.resultVsCustomer === 'bigger than the customer') return Math.max(1, current - WIDEN_STEP);
  const gap = BUILDS.indexOf(build) - BUILDS.indexOf(v.storeBuild);
  if (gap <= 0) return current;
  return current === 1 ? WIDEN[Math.min(gap, WIDEN.length - 1)] : Math.min(1.6, current + WIDEN_STEP);
}

/** A concrete width, from the gap between the two builds, is what makes Muse Image redraw the figure. */
function sizeNote(v: Verdict, build: Build | null, widened: boolean): string {
  const gap = build ? BUILDS.indexOf(build) - BUILDS.indexOf(v.storeBuild) : 0;
  if (!build || gap === 0) return "The body was not the customer's: draw the customer's real size and build from image A.";
  if (widened && gap > 0) {
    return `The figure was still the store model's size. Image B has now been stretched to about the customer's width: draw the customer's real ${build} body at least as wide as the figure in image B, never narrower, with the garment stretching over it.`;
  }
  const pct = [15, 25, 35, 45, 55][Math.abs(gap) - 1];
  return gap > 0
    ? `The figure was still the store model's size. The store model in image B is ${v.storeBuild}; the customer is ${build} and much wider: redraw the outline of the shoulders, arms, waist, hips and legs about ${pct}% wider than in image B, and let the garment stretch over that body.`
    : `The figure was still the store model's size. The store model in image B is ${v.storeBuild}; the customer is ${build} and slimmer: redraw the outline of the shoulders, arms, waist, hips and legs about ${pct}% narrower than in image B, and let the garment fall loosely on that body.`;
}

/** Fixed, filter-safe instructions for the next attempt, one per failed check. */
export function retryNotes(v: Verdict, build: Build | null, widened: boolean): string[] {
  const n: string[] = [];
  if (!v.bodyOk) n.push(sizeNote(v, build, widened));
  if (v.mirrored) {
    n.push(`The figure was mirrored: in image B the person faces the ${v.storeFacing} side of the frame, so the customer must face the ${v.storeFacing} side too.`);
  }
  if (!v.anatomyOk) {
    n.push('The body was not physically possible: head, torso, legs and feet must all point the same way, with two arms, two hands, two legs and two feet.');
  }
  if (!v.poseOk && !v.mirrored) n.push("Keep image B's exact pose, arm and leg positions, camera framing and crop.");
  if (!v.faceOk) n.push("The face and hair must be the customer's from images A and A2.");
  if (!v.garmentOk) n.push('Keep the garments exactly as in image B: cut, colour, pattern, length and details.');
  if (!v.textOk) n.push("Keep image B's printed text exactly as it is.");
  return n;
}

/** Short reason kept with a rejected photo. */
export function failedChecks(v: Verdict): string {
  return [
    !v.bodyOk && `body ${v.resultVsCustomer}`,
    v.mirrored && 'mirrored',
    !v.anatomyOk && 'anatomy',
    !v.poseOk && !v.mirrored && 'pose',
    !v.faceOk && 'face',
    !v.garmentOk && 'garment',
    !v.textOk && 'text',
  ]
    .filter(Boolean)
    .join(', ');
}
