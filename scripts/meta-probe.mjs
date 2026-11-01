// One Muse Image try-on straight against the Meta Model API (no Worker): body photo + garment photo → WebP.
// Same request as apps/api/src/meta.ts. Reads META_KEY from apps/api/.dev.vars (never printed).
//   node scripts/meta-probe.mjs <bodyPhoto> <garmentPhoto>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const [bodyPath, garmentPath] = process.argv.slice(2);
if (!bodyPath || !garmentPath) throw new Error('usage: node scripts/meta-probe.mjs <bodyPhoto> <garmentPhoto>');

const vars = await readFile(new URL('../apps/api/.dev.vars', import.meta.url), 'utf8');
const KEY = vars.match(/^\s*META_KEY\s*=\s*(\S+)\s*$/m)?.[1];
if (!KEY) throw new Error('META_KEY missing in apps/api/.dev.vars');

const PROMPT =
  'Photorealistic virtual try-on. Image 1 is a person; image 2 shows a clothing item. Render the person from image 1 ' +
  "wearing the garment from image 2. Keep the person's face, hair, body shape, pose, skin tone, hands and the " +
  'background exactly as in image 1; change only the outfit to the garment from image 2, matching its cut, colour, ' +
  'pattern and details as closely as possible. Same framing and lighting as image 1. No text, no watermark.';

const mime = (p) => (p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
const uri = async (p) => `data:${mime(p)};base64,${(await readFile(p)).toString('base64')}`;

const t0 = Date.now();
const r = await fetch('https://api.meta.ai/v1/images/edits', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'muse-image-1.0',
    prompt: PROMPT,
    images: [{ image_url: await uri(bodyPath) }, { image_url: await uri(garmentPath) }],
    n: 1,
    output_format: 'webp',
    response_format: 'b64_json',
  }),
});
const j = await r.json().catch(() => ({}));
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (!r.ok || !j.data?.[0]?.b64_json) {
  console.log(`FAILED ${r.status} after ${secs}s:`, JSON.stringify(j).slice(0, 800));
  process.exit(1);
}
const OUT = fileURLToPath(new URL('../shots/', import.meta.url));
await mkdir(OUT, { recursive: true });
const bytes = Buffer.from(j.data[0].b64_json, 'base64');
await writeFile(`${OUT}meta-probe.webp`, bytes);
console.log(`OK in ${secs}s → shots/meta-probe.webp (${(bytes.length / 1024).toFixed(0)} KB)`);
