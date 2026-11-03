// ============================================================================
// Muse Spark (muse-spark-1.3) on the Meta Model API — the try-on's quality gate.
//
// · pickCandidate: several try-ons of the same store photo are compared with the customer's photo side by side,
//   and only one with exactly the customer's body (neither slimmer nor larger), their face, one physically
//   possible body, the store photo's pose and facing (never mirrored), its framing, garment and printed text is
//   kept. What every candidate got wrong goes back to Muse Image as fixed instructions: the inspector's own
//   words are never sent, free text about bodies trips Meta's content filter.
// ============================================================================
import type { Env } from './env';
import { sleep } from './util';

const META_BASE = 'https://api.meta.ai/v1';
const SPARK_MODEL = 'muse-spark-1.3';
/** About what one comparison costs (the customer, the store photo and three candidates, high reasoning). */
export const PICK_COST_USD = 0.02;
/** About what the customer-vs-store-model comparison costs (two photos, medium reasoning). */
export const DIRECTION_COST_USD = 0.005;

/** One structured answer from Muse Spark. Retries 429 / 5xx / network / unreadable answers. */
async function spark<T>(
  env: Env,
  content: Array<Record<string, string>>,
  name: string,
  schema: Record<string, unknown>,
  effort: 'low' | 'medium' | 'high',
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

/** How the customer's build compares with the store photo's model (and a candidate's with that model). */
const DIRECTION = ['much slimmer', 'slimmer', 'about the same', 'fuller', 'much fuller'] as const;
export type Direction = (typeof DIRECTION)[number];

/**
 * The customer next to the store's model, from the two photos only. Compared side by side the inspector answers
 * this consistently, and it says which way the try-on has to move away from the model's outline — for a
 * customer of any build, without assuming one.
 */
export async function customerVsModel(
  env: Env,
  storeDataUri: string,
  bodyDataUri: string,
  people = 1,
): Promise<{ dir: Direction; realPeople: number }> {
  const model = people > 1 ? 'models' : 'model';
  const q = await spark<{ customer_vs_model: Direction; real_people: number }>(
    env,
    [
      { type: 'input_text', text: 'IMAGE 1 - the customer.' },
      { type: 'input_image', image_url: bodyDataUri },
      { type: 'input_text', text: `IMAGE 2 - a store's product photo with its ${model}.` },
      { type: 'input_image', image_url: storeDataUri },
      {
        type: 'input_text',
        text: `Compare the body build of the customer in image 1 with the store's ${model} in image 2: overall body size relative to height (shoulders, arms, torso, waist, hips, legs), scaled by head size. Loose clothes are not body: where they hide the outline, judge by the width of the shoulders, neck, wrists and hands and of the whole figure compared with the head. Answer: the customer is ${DIRECTION.join(', ')} than the ${model}. Also real_people: how many real, photographed people image 2 shows (drawings, illustrations, mannequins and printed figures do not count; 0 if none).`,
      },
    ],
    'direction',
    {
      type: 'object',
      additionalProperties: false,
      required: ['customer_vs_model', 'real_people'],
      properties: { customer_vs_model: { type: 'string', enum: DIRECTION }, real_people: { type: 'integer' } },
    },
    'medium',
  );
  return { dir: q.customer_vs_model, realPeople: Math.max(0, q.real_people) };
}

/** What two of the three candidates are told when the store's model is built differently from the customer. */
export function directionNote(dir: Direction): string | null {
  if (dir.includes('fuller')) {
    return "The store model in image B is slimmer than the customer: do not keep the store model's outline - redraw the figure with the customer's own fuller body exactly as image A shows it, not larger than in image A.";
  }
  if (dir.includes('slimmer')) {
    return "The store model in image B is larger than the customer: do not keep the store model's outline - redraw the figure with the customer's own slimmer body exactly as image A shows it, not slimmer than in image A.";
  }
  return null;
}

/** A kept candidate has moved away from the store model's outline the way the customer differs from it. */
function awayFromModel(dir: Direction, vs: Direction): boolean {
  if (dir === 'much fuller') return vs === 'fuller' || vs === 'much fuller';
  if (dir === 'fuller') return !vs.includes('slimmer');
  if (dir === 'much slimmer') return vs === 'slimmer' || vs === 'much slimmer';
  if (dir === 'slimmer') return !vs.includes('fuller');
  return true;
}

/** How a candidate's body compares with the customer's photo. Only "the same" is kept. */
const BODY_VS = ['much slimmer', 'slimmer', 'the same', 'larger', 'much larger'] as const;
type BodyVs = (typeof BODY_VS)[number];

export interface CandidateVerdict {
  body: BodyVs;
  /** The candidate's body next to the store photo's model. */
  vsModel: Direction;
  faceOk: boolean;
  anatomyOk: boolean;
  poseOk: boolean;
  garmentOk: boolean;
  textOk: boolean;
}

export interface Pick {
  /** The kept candidate, or -1 when none has the customer's body and no defect. */
  index: number;
  verdicts: CandidateVerdict[];
}

interface PickAnswer {
  candidates: Array<{
    number: number;
    body: BodyVs;
    body_vs_store_model: Direction;
    face_is_customer: boolean;
    anatomy_ok: boolean;
    pose_ok: boolean;
    garment_ok: boolean;
    text_ok: boolean;
  }>;
  best: number;
}

const PICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates', 'best'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'body', 'body_vs_store_model', 'face_is_customer', 'anatomy_ok', 'pose_ok', 'garment_ok', 'text_ok'],
        properties: {
          number: { type: 'integer' },
          body: { type: 'string', enum: BODY_VS },
          body_vs_store_model: { type: 'string', enum: DIRECTION },
          face_is_customer: { type: 'boolean' },
          anatomy_ok: { type: 'boolean' },
          pose_ok: { type: 'boolean' },
          garment_ok: { type: 'boolean' },
          text_ok: { type: 'boolean' },
        },
      },
    },
    best: { type: 'integer' },
  },
};

// Judged one at a time, the inspector's body verdicts wavered both ways (an accurate try-on called "clearly
// slimmer", a much larger one "the same"); shown several try-ons of the same photo next to the customer, it
// ranks them reliably — the store model's outline and an exaggerated body stand out against each other.
const pickTask = (count: number, people: number) =>
  `The ${count} candidates are virtual try-ons of the store photo: each must show ${people > 1 ? `every one of its ${people} people as the customer of image 0` : 'the customer of image 0'} - their face and hair, and exactly their body - in the store photo's outfit, pose and scene.\n` +
  'Compare the candidates with image 0 and with each other. Scale everything by the size of the head, so camera distance does not matter. For the body, imagine the customer of image 0 in the pose and clothes of the candidate: skin that image 0 covers must look as it would really look on that same body - not exaggerated, not slimmed. Loose clothes are not body: where they hide the outline, judge by what still shows - the width of the shoulders, neck, wrists and hands, and how wide the whole figure is compared with the head.\n' +
  'For each candidate:\n' +
  `- body: ${BODY_VS.join(', ')} than the customer${people > 1 ? ' (for the person that differs most)' : ''};\n` +
  `- body_vs_store_model: the candidate's body is ${DIRECTION.join(', ')} than the store photo's ${people > 1 ? 'models' : 'model'};\n` +
  `- face_is_customer: ${people > 1 ? 'every face and hair is' : 'the face and hair are'} the customer's;\n` +
  '- anatomy_ok: a physically possible body: head, torso, hips, legs and feet point in consistent directions, the right number of arms, hands, legs and feet, natural joints and hands;\n' +
  '- pose_ok: the same pose, facing direction, camera framing/crop and background as the store photo, not mirrored (the head angle and expression may differ; the face may show even if the store photo cut it);\n' +
  '- garment_ok: the same garments as the store photo (cut, colour, pattern, length, details);\n' +
  '- text_ok: text and graphics printed on the store photo are unchanged (true if there are none).\n' +
  'Then best: the number of the candidate closest to the customer that has no defect (0 if none).';

// Judged only against each other, three candidates that all kept the store model's outline let the fullest of
// them pass as "the same": a kept one must also have moved away from the model the way the customer differs.
const kept = (v: CandidateVerdict, dir: Direction) =>
  v.body === 'the same' && awayFromModel(dir, v.vsModel) && v.faceOk && v.anatomyOk && v.poseOk && v.garmentOk && v.textOk;

/** Compare try-ons of one store photo with the customer and keep the closest one without a defect. */
export async function pickCandidate(
  env: Env,
  storeDataUri: string,
  bodyDataUri: string,
  candidates: string[],
  dir: Direction,
  people = 1,
): Promise<Pick> {
  const content: Array<Record<string, string>> = [
    { type: 'input_text', text: 'IMAGE 0 - the customer: their real face and body.' },
    { type: 'input_image', image_url: bodyDataUri },
    { type: 'input_text', text: `STORE PHOTO - the original product photo (the store's ${people > 1 ? 'models' : 'model'}).` },
    { type: 'input_image', image_url: storeDataUri },
  ];
  candidates.forEach((c, i) => content.push({ type: 'input_text', text: `CANDIDATE ${i + 1}` }, { type: 'input_image', image_url: c }));
  content.push({ type: 'input_text', text: pickTask(candidates.length, people) });
  const q = await spark<PickAnswer>(env, content, 'pick', PICK_SCHEMA, 'high');
  const verdicts: CandidateVerdict[] = candidates.map((_, i) => {
    const a = q.candidates.find((c) => c.number === i + 1);
    return a
      ? {
          body: a.body,
          vsModel: a.body_vs_store_model,
          faceOk: a.face_is_customer,
          anatomyOk: a.anatomy_ok,
          poseOk: a.pose_ok,
          garmentOk: a.garment_ok,
          textOk: a.text_ok,
        }
      : { body: 'much slimmer', vsModel: 'about the same', faceOk: false, anatomyOk: false, poseOk: false, garmentOk: false, textOk: false };
  });
  let index = q.best - 1;
  if (!(index >= 0 && index < verdicts.length && kept(verdicts[index], dir))) index = verdicts.findIndex((v) => kept(v, dir));
  return { index, verdicts };
}

/**
 * Fixed, filter-safe instructions for the next round, from what every candidate of this round got wrong. A
 * direction for the body only when all of them missed the same way (one verdict alone was not reliable enough).
 */
export function roundNotes(verdicts: CandidateVerdict[], dir: Direction): string[] {
  const n: string[] = [];
  const all = (f: (v: CandidateVerdict) => boolean) => verdicts.length > 0 && verdicts.every(f);
  const most = (f: (v: CandidateVerdict) => boolean) => verdicts.filter(f).length * 2 > verdicts.length;
  if (all((v) => v.body.includes('slimmer') || (dir.includes('fuller') && !awayFromModel(dir, v.vsModel)))) {
    n.push("Every attempt kept the store model's slimmer outline: draw the customer's own body exactly as image A shows it, fuller than the store model's and not larger than in image A.");
  } else if (all((v) => v.body.includes('larger') || (dir.includes('slimmer') && !awayFromModel(dir, v.vsModel)))) {
    n.push("Every attempt came out larger than the customer in image A: draw the customer's own body exactly as image A shows it, not larger and not slimmer.");
  }
  if (most((v) => !v.faceOk)) n.push("The face and hair must be the customer's from images A and A2.");
  if (most((v) => !v.poseOk)) n.push("Keep image B's exact pose, facing direction, camera framing and crop; never mirror it.");
  if (most((v) => !v.anatomyOk)) {
    n.push('The body must be physically possible: head, torso, legs and feet all point the same way, with two arms, two hands, two legs and two feet.');
  }
  if (most((v) => !v.garmentOk)) n.push('Keep the garments exactly as in image B: cut, colour, pattern, length and details.');
  if (most((v) => !v.textOk)) n.push("Keep image B's printed text exactly as it is.");
  return n;
}

/** Short reason kept with a rejected photo: what the candidates of the last round got wrong. */
export function failedReason(verdicts: CandidateVerdict[]): string {
  const count = (f: (v: CandidateVerdict) => boolean) => verdicts.filter(f).length;
  return [
    ...BODY_VS.filter((b) => b !== 'the same')
      .map((b) => [b, count((v) => v.body === b)] as const)
      .filter(([, k]) => k)
      .map(([b, k]) => `body ${b} ×${k}`),
    count((v) => !v.faceOk) && `face ×${count((v) => !v.faceOk)}`,
    count((v) => !v.poseOk) && `pose ×${count((v) => !v.poseOk)}`,
    count((v) => !v.anatomyOk) && `anatomy ×${count((v) => !v.anatomyOk)}`,
    count((v) => !v.garmentOk) && `garment ×${count((v) => !v.garmentOk)}`,
    count((v) => !v.textOk) && `text ×${count((v) => !v.textOk)}`,
  ]
    .filter(Boolean)
    .join(', ');
}

// ── Outfits (the Cabin): candidates of the customer's own photo dressed in pieces from several try-ons. ──

export interface OutfitVerdict {
  body: BodyVs;
  faceOk: boolean;
  anatomyOk: boolean;
  sceneOk: boolean;
  piecesOk: boolean;
}

const OUTFIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates', 'best'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'body', 'face_is_customer', 'anatomy_ok', 'scene_ok', 'pieces_ok'],
        properties: {
          number: { type: 'integer' },
          body: { type: 'string', enum: BODY_VS },
          face_is_customer: { type: 'boolean' },
          anatomy_ok: { type: 'boolean' },
          scene_ok: { type: 'boolean' },
          pieces_ok: { type: 'boolean' },
        },
      },
    },
    best: { type: 'integer' },
  },
};

const outfitTask = (count: number) =>
  `The ${count} candidates redraw image 0 with the customer wearing the pieces: each must show the customer of image 0 - their face and hair, and exactly their body - in image 0's pose and scene, wearing every piece.\n` +
  'Compare the candidates with image 0 and with each other. Scale everything by the size of the head, so camera distance does not matter. For the body, imagine the customer of image 0 in the clothes of the candidate: skin that image 0 covers must look as it would really look on that same body - not exaggerated, not slimmed. Loose clothes are not body: where they hide the outline, judge by what still shows - the width of the shoulders, neck, wrists and hands, and how wide the whole figure is compared with the head.\n' +
  'For each candidate:\n' +
  `- body: ${BODY_VS.join(', ')} than the customer in image 0;\n` +
  "- face_is_customer: the face and hair are the customer's;\n" +
  '- anatomy_ok: a physically possible body with the right number of arms, hands, legs and feet, natural joints and hands;\n' +
  "- scene_ok: image 0's pose, facing direction, camera framing/crop and background, not mirrored;\n" +
  '- pieces_ok: every piece is worn and matches its photo (cut, colour, pattern, length, details), and what no piece replaces is kept from image 0.\n' +
  'Then best: the number of the candidate closest to the customer that has no defect (0 if none).';

const keptOutfit = (v: OutfitVerdict) => v.body === 'the same' && v.faceOk && v.anatomyOk && v.sceneOk && v.piecesOk;

/** Compare outfit candidates with the customer's photo and keep the closest one without a defect. */
export async function pickOutfit(
  env: Env,
  bodyDataUri: string,
  pieces: Array<{ label: string; dataUri: string }>,
  candidates: string[],
): Promise<{ index: number; verdicts: OutfitVerdict[] }> {
  const content: Array<Record<string, string>> = [
    { type: 'input_text', text: "IMAGE 0 - the customer's own photo: their real face and body, the base of the outfit." },
    { type: 'input_image', image_url: bodyDataUri },
  ];
  pieces.forEach((p, i) => content.push({ type: 'input_text', text: `PIECE ${i + 1} - ${p.label} comes from this photo.` }, { type: 'input_image', image_url: p.dataUri }));
  candidates.forEach((c, i) => content.push({ type: 'input_text', text: `CANDIDATE ${i + 1}` }, { type: 'input_image', image_url: c }));
  content.push({ type: 'input_text', text: outfitTask(candidates.length) });
  const q = await spark<{
    candidates: Array<{ number: number; body: BodyVs; face_is_customer: boolean; anatomy_ok: boolean; scene_ok: boolean; pieces_ok: boolean }>;
    best: number;
  }>(env, content, 'outfit', OUTFIT_SCHEMA, 'high');
  const verdicts: OutfitVerdict[] = candidates.map((_, i) => {
    const a = q.candidates.find((c) => c.number === i + 1);
    return a
      ? { body: a.body, faceOk: a.face_is_customer, anatomyOk: a.anatomy_ok, sceneOk: a.scene_ok, piecesOk: a.pieces_ok }
      : { body: 'much slimmer', faceOk: false, anatomyOk: false, sceneOk: false, piecesOk: false };
  });
  let index = q.best - 1;
  if (!(index >= 0 && index < verdicts.length && keptOutfit(verdicts[index]))) index = verdicts.findIndex(keptOutfit);
  return { index, verdicts };
}

/** Fixed instructions for a second round, from what every outfit candidate of the first one got wrong. */
export function outfitNotes(verdicts: OutfitVerdict[]): string[] {
  const n: string[] = [];
  const all = (f: (v: OutfitVerdict) => boolean) => verdicts.length > 0 && verdicts.every(f);
  const most = (f: (v: OutfitVerdict) => boolean) => verdicts.filter(f).length * 2 > verdicts.length;
  if (all((v) => v.body.includes('slimmer'))) {
    n.push("Every attempt came out slimmer than the customer in image A: draw the customer's own body exactly as image A shows it, not slimmer and not larger.");
  } else if (all((v) => v.body.includes('larger'))) {
    n.push("Every attempt came out larger than the customer in image A: draw the customer's own body exactly as image A shows it, not larger and not slimmer.");
  }
  if (most((v) => !v.faceOk)) n.push("The face and hair must be the customer's from images A and A2.");
  if (most((v) => !v.sceneOk)) n.push("Keep image A's exact pose, facing direction, camera framing, crop and background; never mirror it.");
  if (most((v) => !v.anatomyOk)) n.push('The body must be physically possible, with two arms, two hands, two legs and two feet.');
  if (most((v) => !v.piecesOk)) n.push('Every piece must be worn exactly as its photo shows it, and everything no piece replaces stays as in image A.');
  return n;
}

/** Short reason kept with an outfit no candidate of which was kept. */
export function outfitFailedReason(verdicts: OutfitVerdict[]): string {
  const count = (f: (v: OutfitVerdict) => boolean) => verdicts.filter(f).length;
  return [
    ...BODY_VS.filter((b) => b !== 'the same')
      .map((b) => [b, count((v) => v.body === b)] as const)
      .filter(([, k]) => k)
      .map(([b, k]) => `body ${b} ×${k}`),
    count((v) => !v.faceOk) && `face ×${count((v) => !v.faceOk)}`,
    count((v) => !v.sceneOk) && `pose ×${count((v) => !v.sceneOk)}`,
    count((v) => !v.anatomyOk) && `anatomy ×${count((v) => !v.anatomyOk)}`,
    count((v) => !v.piecesOk) && `pieces ×${count((v) => !v.piecesOk)}`,
  ]
    .filter(Boolean)
    .join(', ');
}
