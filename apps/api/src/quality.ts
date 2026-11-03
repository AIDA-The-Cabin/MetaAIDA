// ============================================================================
// Muse Spark (muse-spark-1.3) on the Meta Model API — the try-on's quality gate.
//
// · checkTryon: every try-on in the store's scene is inspected before it is kept — the customer's own body
//   (compared with their photo only, neither slimmer nor larger) and face, one physically possible body, the
//   store photo's pose and facing (never mirrored), its framing, garment and printed text. What failed goes back
//   to Muse Image as fixed instructions: the inspector's own words are never sent, free text about bodies trips
//   Meta's content filter.
// ============================================================================
import type { Env } from './env';
import { sleep } from './util';

const META_BASE = 'https://api.meta.ai/v1';
const SPARK_MODEL = 'muse-spark-1.3';
/** About what one check costs (three photos + medium reasoning), for the usage log. */
export const QA_COST_USD = 0.012;

const FACING = ['left', 'right', 'camera', 'away'] as const;
type Facing = (typeof FACING)[number];

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

/** How the body in a try-on compares with the customer's own photo: only "the same" passes. */
const VS_CUSTOMER = ['clearly slimmer', 'slightly slimmer', 'the same', 'slightly larger', 'clearly larger'] as const;
type VsCustomer = (typeof VS_CUSTOMER)[number];

export interface Verdict {
  pass: boolean;
  bodyVsCustomer: VsCustomer;
  storeFacing: Facing;
  resultFacing: Facing;
  faceOk: boolean;
  bodyOk: boolean;
  anatomyOk: boolean;
  poseOk: boolean;
  mirrored: boolean;
  garmentOk: boolean;
  textOk: boolean;
  /** The store photo has text or graphics printed on top of it (a campaign image). */
  storeHasText: boolean;
  problems: string;
}

interface QaAnswer {
  body_vs_customer: VsCustomer;
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
    'body_vs_customer',
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
    body_vs_customer: { type: 'string', enum: VS_CUSTOMER },
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

// The body is judged against the customer's own photo only, in both directions: told to compare with the
// store model, or given a build label, the inspector passed bodies far larger than the customer's.
const bodyRule = (who: string) =>
  `- body_vs_customer: compare ${who} with the customer's body in image 2 only (ignore the store model in image 1). Look below the neck, relative to height: width of the shoulders, thickness of the upper arms, chest, waist, belly, hips and legs. A rounder belly, thicker arms or wider hips than in image 2 = larger; a narrower waist, thinner arms or legs than in image 2 = slimmer. Loose clothes do not count as body. Answer: ${VS_CUSTOMER.join(', ')}.\n`;

const QA_TASK =
  "Strict inspection of IMAGE 3 for a virtual try-on: it must show the customer of image 2 with exactly the customer's own body, in the outfit, pose and scene of image 1.\n" +
  bodyRule('the body in image 3') +
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
  `Strict inspection of IMAGE 3 for a virtual try-on of a photo with ${people} people: in IMAGE 3 every one of them must be the customer of image 2, with the customer's own face, hair and body, each keeping their own outfit, pose and place from image 1. No other person may remain.\n` +
  bodyRule('every body in image 3 (answer for the one that differs most)') +
  '- store_facing and result_facing: which side of the frame the body and feet of the most prominent person in image 1 and in image 3 point to: left, right, camera (towards the viewer) or away (back to the viewer).\n' +
  "- face_is_customer: every face and hair in image 3 is the customer's (false if any other person remains).\n" +
  '- anatomy_ok: every body is physically possible: head, torso, hips, legs and feet point in consistent directions, the right number of arms, hands, legs and feet, natural joints and hands.\n' +
  '- pose_ok: the same poses, places, camera framing/crop and background as image 1, not mirrored (head angles and expressions may differ; faces may be visible even if image 1 cut them).\n' +
  '- garment_ok: every person wears the same garments as in image 1 (cut, colour, pattern, length, details).\n' +
  '- text_ok: text and graphics printed on image 1 are unchanged in image 3 (true if there are none).\n' +
  '- store_has_text: image 1 has text, a logo or graphics printed on top of the photo (not on the garments).\n' +
  '- problems: the concrete defects, short, empty if none.';

/** Inspect a try-on against the store photo and the customer's photo. */
export async function checkTryon(
  env: Env,
  storeDataUri: string,
  bodyDataUri: string,
  resultDataUri: string,
  people = 1,
): Promise<Verdict> {
  const q = await spark<QaAnswer>(
    env,
    [
      { type: 'input_text', text: `IMAGE 1 - the store product photo (original ${people > 1 ? 'models' : 'model'}).` },
      { type: 'input_image', image_url: storeDataUri },
      { type: 'input_text', text: 'IMAGE 2 - the customer.' },
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
    bodyVsCustomer: q.body_vs_customer,
    storeFacing: q.store_facing,
    resultFacing: q.result_facing,
    faceOk: q.face_is_customer,
    bodyOk: q.body_vs_customer === 'the same',
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

/** Fixed, filter-safe instructions for the next attempt, one per failed check. */
export function retryNotes(v: Verdict): string[] {
  const n: string[] = [];
  if (!v.bodyOk) {
    const way = v.bodyVsCustomer.includes('slimmer') ? 'slimmer' : 'larger';
    n.push(`The body came out ${way} than the customer's in image A: draw exactly the customer's own size and proportions from image A, neither slimmer nor larger.`);
  }
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
    !v.bodyOk && `body ${v.bodyVsCustomer}`,
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
