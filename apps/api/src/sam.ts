// ============================================================================
// SAM 3.1 (Meta Model API) — finds things in a photo from a short noun phrase ("face", "head").
// POST /v1/responses, model sam-3.1, one input_text phrase + one input_image. The answer is
// special-token text, one line per frame: `<0f>0<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..;c=..|><|mask;...|>`
// with boxes in source pixels. $0.0025 per image. Docs: https://dev.meta.ai/docs/media-segmentation
// ============================================================================
import type { Env } from './env';

const META_BASE = 'https://api.meta.ai/v1';
export const SAM_MODEL = 'sam-3.1';
export const SAM_COST_USD = 0.0025;

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c?: number;
}

/** Every match of `phrase`, most confident first, and whether the call went through (= was billed). */
export async function samBoxes(env: Env, imageDataUri: string, phrase: string): Promise<{ boxes: Box[]; billed: boolean }> {
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
              { type: 'input_text', text: phrase },
              { type: 'input_image', image_url: imageDataUri },
            ],
          },
        ],
        metadata: { include_confidence: 'true', mask_encoding: 'one_bit' },
      }),
    });
  } catch {
    return { boxes: [], billed: false };
  }
  if (!r.ok) return { boxes: [], billed: false };
  const j = (await r.json().catch(() => ({}))) as { output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = (j.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? '').join('\n');
  const boxes: Box[] = [...text.matchAll(/<\|box;([^|]*)\|>/g)].map((m) => {
    const f = Object.fromEntries(m[1].split(';').map((kv) => kv.split('=') as [string, string]));
    return { x1: +f.x1, y1: +f.y1, x2: +f.x2, y2: +f.y2, c: f.c === undefined ? undefined : +f.c };
  });
  boxes.sort((a, b) => (b.c ?? 0) - (a.c ?? 0));
  return { boxes, billed: true };
}
