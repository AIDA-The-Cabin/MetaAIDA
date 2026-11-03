// ============================================================================
// Store newsletters (B2B). A store picks a few of its products (a link to each product page, or a photo it
// uploads with a name and a link) and a list of addresses. Every address that belongs to a Cabin profile with
// a photo gets the products worn by that person; every other address gets the store's own photos. The emails
// are rendered here and wait in the outbox, ready for the mail service — sending is not this module's job.
//
// The try-ons are made one request at a time, driven by the store's page (Workers keep a request alive only
// while someone waits for it), and the store pays for them: the subscriber's own credits are never touched.
// A product photo this person already tried on (the same photo at another size) is reused, free.
// ============================================================================
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { NlCampaignCreate } from '@aida/shared';
import * as schema from './db/schema';
import type { DB } from './db/client';
import type { Env } from './env';
import { TryonError, imageUrl, runTryon } from './tryon';
import { newId } from './util';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type Auth = { userId: string; tenantId: string };
type ProductRow = typeof schema.nlProducts.$inferSelect;
type RecipientRow = typeof schema.nlRecipients.$inferSelect;
type ItemRow = typeof schema.nlItems.$inferSelect;

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();

function meta(html: string, keys: string[]): string | undefined {
  for (const k of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, 'i');
    const tag = re.exec(html)?.[0];
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decode(content);
  }
  return undefined;
}

/** The first schema.org Product in the page's JSON-LD (name, image, price). */
function ldProduct(html: string): { name?: string; image?: string; price?: string } {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j: unknown;
    try {
      j = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const stack: unknown[] = [j];
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      if (Array.isArray(o)) {
        stack.push(...o);
        continue;
      }
      const r = o as Record<string, any>;
      const type = Array.isArray(r['@type']) ? r['@type'] : [r['@type']];
      if (type.includes('Product')) {
        const image = Array.isArray(r.image) ? r.image[0] : typeof r.image === 'object' ? r.image?.url : r.image;
        const offer = Array.isArray(r.offers) ? r.offers[0] : r.offers;
        const price = offer?.price ?? offer?.lowPrice;
        const cur = offer?.priceCurrency;
        return { name: r.name, image, price: price != null ? `${price}${cur ? ' ' + cur : ''}` : undefined };
      }
      stack.push(...Object.values(r));
    }
  }
  return {};
}

/** What a product page says about itself: name, main photo and price (Open Graph, then schema.org). */
export async function productPreview(url: string): Promise<{ name?: string; imageUrl?: string; productUrl: string; price?: string }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow' });
  } catch {
    throw new TryonError('unreachable', 'The product page could not be opened.');
  }
  // A link to the product's photo itself: the store adds the name and the product link by hand.
  if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) {
    await res.body?.cancel();
    return { imageUrl: res.url || url, productUrl: '' };
  }
  if (!res.ok) {
    // Stores behind bot protection refuse to be read by a server (403/401/429).
    const code = res.status === 403 || res.status === 401 || res.status === 429 ? 'blocked' : 'unreachable';
    throw new TryonError(code, `The product page answered ${res.status}.`);
  }
  const html = (await res.text()).slice(0, 1_500_000);
  const ld = ldProduct(html);
  const rawImage = meta(html, ['og:image:secure_url', 'og:image', 'twitter:image']) ?? ld.image;
  let imageUrl: string | undefined;
  try {
    imageUrl = rawImage ? new URL(rawImage, res.url).href : undefined;
  } catch {
    imageUrl = undefined;
  }
  const amount = meta(html, ['product:price:amount', 'og:price:amount']);
  const currency = meta(html, ['product:price:currency', 'og:price:currency']);
  const title = meta(html, ['og:title', 'twitter:title']) ?? ld.name ?? decode(/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '');
  return {
    name: ld.name ?? (title?.replace(/\s*[|–—-]\s*[^|–—-]+$/, '').trim() || undefined),
    imageUrl,
    productUrl: res.url || url,
    price: amount ? `${amount}${currency ? ' ' + currency : ''}` : ld.price,
  };
}

/** A product photo the store uploads (stored with the results, so it is served to the emails). */
export async function storeUpload(env: Env, tenantId: string, body: ArrayBuffer, contentType: string, origin: string): Promise<string> {
  if (!body.byteLength) throw new TryonError('empty', 'No photo.');
  if (body.byteLength > MAX_UPLOAD_BYTES) throw new TryonError('too_large', 'The photo is larger than 8 MB.');
  const type = contentType.split(';')[0].trim();
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
  if (!ext) throw new TryonError('bad_type', 'Upload a JPEG, PNG or WebP photo.');
  const key = `results/nl/${tenantId}/${newId('img')}.${ext}`;
  await env.BUCKET.put(key, body, { httpMetadata: { contentType: type } });
  return `${origin}${imageUrl(key)}`;
}

/** The same photo at another size (store CDNs vary only the query): the person's earlier try-on of it is reused. */
async function samePhoto(db: DB, tenantId: string, url: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const base = `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  if (base.length < 24) return url;
  // A prefix compare, not LIKE: D1 refuses LIKE patterns this long ("LIKE or GLOB pattern too complex").
  const rows = await db
    .select({ url: schema.garments.sourceImageUrl })
    .from(schema.garments)
    .where(and(eq(schema.garments.tenantId, tenantId), sql`substr(${schema.garments.sourceImageUrl}, 1, ${base.length}) = ${base}`))
    .limit(20)
    .all();
  const hit = rows.find((r) => {
    try {
      const v = new URL(r.url);
      return `${v.origin}${v.pathname.replace(/\/+$/, '')}` === base;
    } catch {
      return false;
    }
  });
  return hit?.url ?? url;
}

// ── Campaigns ──

export async function createCampaign(db: DB, auth: Auth, body: NlCampaignCreate) {
  const now = Date.now();
  const id = newId('nlc');
  await db
    .insert(schema.nlCampaigns)
    .values({ id, tenantId: auth.tenantId, storeName: body.storeName, subject: body.subject, intro: body.intro || null, status: 'preparing', createdAt: now })
    .run();
  const products = body.products.map((p, i) => ({
    id: newId('nlp'),
    campaignId: id,
    position: i,
    name: p.name,
    productUrl: p.productUrl ?? null,
    imageUrl: p.imageUrl,
    price: p.price || null,
  }));
  await db.insert(schema.nlProducts).values(products).run();

  // Every address once; one with a profile that has a photo gets the products on that person.
  const emails = [...new Set(body.recipients.map((e) => e.trim().toLowerCase()))];
  const people = await db
    .select({ id: schema.profiles.id, email: schema.profiles.email })
    .from(schema.profiles)
    .where(and(isNotNull(schema.profiles.primaryPhotoId), inArray(schema.profiles.email, emails)))
    .all();
  const byEmail = new Map(people.map((p) => [p.email!, p.id]));
  const recipients: RecipientRow[] = emails.map((email) => ({
    id: newId('nlr'),
    campaignId: id,
    email,
    profileId: byEmail.get(email) ?? null,
    kind: byEmail.has(email) ? 'personal' : 'standard',
    createdAt: now,
  }));
  for (let i = 0; i < recipients.length; i += 50) await db.insert(schema.nlRecipients).values(recipients.slice(i, i + 50)).run();

  const items: ItemRow[] = recipients
    .filter((r) => r.kind === 'personal')
    .flatMap((r) =>
      products.map((p) => ({
        id: newId('nli'),
        campaignId: id,
        recipientId: r.id,
        productId: p.id,
        status: 'pending',
        tryonResultId: null,
        resultR2Key: null,
        error: null,
        updatedAt: now,
      })),
    );
  for (let i = 0; i < items.length; i += 50) await db.insert(schema.nlItems).values(items.slice(i, i + 50)).run();
  return campaignDetail(db, auth, id);
}

export async function listCampaigns(db: DB, auth: Auth) {
  const rows = await db
    .select()
    .from(schema.nlCampaigns)
    .where(eq(schema.nlCampaigns.tenantId, auth.tenantId))
    .orderBy(desc(schema.nlCampaigns.createdAt))
    .limit(50)
    .all();
  const out = [];
  for (const c of rows) {
    const rec = await db.select({ kind: schema.nlRecipients.kind }).from(schema.nlRecipients).where(eq(schema.nlRecipients.campaignId, c.id)).all();
    out.push({
      id: c.id,
      storeName: c.storeName,
      subject: c.subject,
      status: c.status,
      recipients: rec.length,
      personal: rec.filter((r) => r.kind === 'personal').length,
    });
  }
  return out;
}

/** The campaign as its page shows it: products, recipients (no images of anyone), try-on jobs and the outbox. */
export async function campaignDetail(db: DB, auth: Auth, id: string) {
  const c = await db
    .select()
    .from(schema.nlCampaigns)
    .where(and(eq(schema.nlCampaigns.id, id), eq(schema.nlCampaigns.tenantId, auth.tenantId)))
    .get();
  if (!c) return null;
  const products = await db.select().from(schema.nlProducts).where(eq(schema.nlProducts.campaignId, id)).orderBy(asc(schema.nlProducts.position)).all();
  const recipients = await db.select().from(schema.nlRecipients).where(eq(schema.nlRecipients.campaignId, id)).orderBy(asc(schema.nlRecipients.email)).all();
  const items = await db.select().from(schema.nlItems).where(eq(schema.nlItems.campaignId, id)).all();
  const outbox = await db
    .select({ id: schema.nlOutbox.id, recipientId: schema.nlOutbox.recipientId, status: schema.nlOutbox.status, kind: schema.nlOutbox.kind })
    .from(schema.nlOutbox)
    .where(eq(schema.nlOutbox.campaignId, id))
    .all();
  const mail = new Map(outbox.map((o) => [o.recipientId, o]));
  return {
    id: c.id,
    storeName: c.storeName,
    subject: c.subject,
    intro: c.intro ?? undefined,
    status: c.status,
    products: products.map((p) => ({ id: p.id, name: p.name, productUrl: p.productUrl ?? undefined, imageUrl: p.imageUrl, price: p.price ?? undefined })),
    recipients: recipients.map((r) => {
      const mine = items.filter((i) => i.recipientId === r.id);
      const o = mail.get(r.id);
      return {
        id: r.id,
        email: r.email,
        kind: r.kind,
        made: mine.filter((i) => i.status === 'done').length,
        missed: mine.filter((i) => i.status === 'failed' || i.status === 'skipped').length,
        outboxId: o?.id,
        outboxStatus: o?.status,
      };
    }),
    // what is left to make, for the page that drives it
    jobs: items.filter((i) => i.status === 'pending').map((i) => ({ recipientId: i.recipientId, productId: i.productId })),
    total: items.length,
  };
}

/** Make one product on one personal recipient (the store's page calls this once per pair). */
export async function runItem(env: Env, db: DB, auth: Auth, campaignId: string, recipientId: string, productId: string) {
  const c = await db
    .select()
    .from(schema.nlCampaigns)
    .where(and(eq(schema.nlCampaigns.id, campaignId), eq(schema.nlCampaigns.tenantId, auth.tenantId)))
    .get();
  if (!c) throw new TryonError('not_found', 'No such campaign.');
  const item = await db
    .select()
    .from(schema.nlItems)
    .where(and(eq(schema.nlItems.campaignId, campaignId), eq(schema.nlItems.recipientId, recipientId), eq(schema.nlItems.productId, productId)))
    .get();
  if (!item) throw new TryonError('not_found', 'No such recipient or product in this campaign.');
  if (item.status !== 'pending') return { status: item.status };
  const r = await db.select().from(schema.nlRecipients).where(eq(schema.nlRecipients.id, recipientId)).get();
  const p = await db.select().from(schema.nlProducts).where(eq(schema.nlProducts.id, productId)).get();
  const profile = r?.profileId ? await db.select().from(schema.profiles).where(eq(schema.profiles.id, r.profileId)).get() : undefined;
  const set = (status: string, extra: Partial<ItemRow> = {}) =>
    db.update(schema.nlItems).set({ status, updatedAt: Date.now(), ...extra }).where(eq(schema.nlItems.id, item.id)).run();
  if (!p || !profile?.primaryPhotoId) {
    await set('skipped', { error: 'no photo' });
    return { status: 'skipped' };
  }
  try {
    const photo = await samePhoto(db, auth.tenantId, p.imageUrl);
    const out = await runTryon(env, db, auth, photo, p.productUrl ?? p.imageUrl, undefined, 'auto', `nl:${campaignId}`, false, false, {
      profile,
      billing: 'tenant',
      productUrl: p.productUrl ?? undefined,
      name: p.name,
    });
    const tr = out.result.id
      ? await db.select().from(schema.tryonResults).where(eq(schema.tryonResults.id, out.result.id)).get()
      : undefined;
    if (out.result.status === 'done' && tr?.resultR2Key) {
      await set('done', { tryonResultId: tr.id, resultR2Key: tr.resultR2Key, error: null });
      return { status: 'done' };
    }
    await set('skipped', { error: out.result.skipped ?? out.result.status });
    return { status: 'skipped' };
  } catch (e) {
    const msg = e instanceof TryonError ? e.code : String((e as Error).message).slice(0, 200);
    // A request the Worker could not finish (busy, out of time) is tried again by the page; a refusal is final.
    if (e instanceof TryonError) {
      await set('failed', { error: msg });
      return { status: 'failed', error: msg };
    }
    throw e;
  }
}

// ── The emails ──

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface MailProduct {
  name: string;
  price?: string;
  url?: string;
  image: string;
  onYou: boolean;
}

/**
 * One email: the store's header, the intro, the products two to a row (on the subscriber themselves when the
 * Cabin made them), a short footer. Table layout and inline styles: what mail clients render.
 * `{{unsubscribe_url}}` is left for the mail service to fill.
 */
export function renderEmail(o: {
  storeName: string;
  subject: string;
  intro?: string;
  greeting?: string;
  products: MailProduct[];
  personal: boolean;
  profileUrl: string;
}): { html: string; text: string } {
  const gold = '#9C7A2E';
  const cell = (p: MailProduct) => `
<td valign="top" width="50%" style="padding:10px;">
  <a href="${esc(p.url ?? '#')}" style="text-decoration:none;color:#1c1b19;">
    <img src="${esc(p.image)}" width="260" alt="${esc(p.name)}" style="display:block;width:100%;max-width:260px;height:auto;border-radius:10px;border:0;background:#efe9df;" />
  </a>
  ${p.onYou ? `<div style="margin:10px 0 0;font:600 10px/1.2 Arial,Helvetica,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${gold};">&#10022; On you</div>` : ''}
  <div style="margin:${p.onYou ? 4 : 12}px 0 0;font:500 15px/1.35 Georgia,'Times New Roman',serif;color:#1c1b19;">${esc(p.name)}</div>
  ${p.price ? `<div style="margin:4px 0 0;font:13px/1.4 Arial,Helvetica,sans-serif;color:#6b665d;">${esc(p.price)}</div>` : ''}
  ${p.url ? `<a href="${esc(p.url)}" style="display:inline-block;margin:12px 0 0;padding:9px 16px;border-radius:999px;background:#1c1b19;color:#f6efe2;font:600 12px/1 Arial,Helvetica,sans-serif;letter-spacing:.5px;text-decoration:none;">Shop now &rarr;</a>` : ''}
</td>`;
  const rows: string[] = [];
  for (let i = 0; i < o.products.length; i += 2) {
    const pair = o.products.slice(i, i + 2);
    rows.push(`<tr>${pair.map(cell).join('')}${pair.length === 1 ? '<td width="50%" style="padding:10px;"></td>' : ''}</tr>`);
  }
  const lead = o.personal
    ? `<p style="margin:0 0 6px;font:600 11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${gold};">&#10022; Styled on you</p>`
    : '';
  const hello = o.greeting ? `<p style="margin:0 0 10px;font:15px/1.6 Arial,Helvetica,sans-serif;color:#1c1b19;">Hi ${esc(o.greeting)},</p>` : '';
  const intro = o.intro
    ? o.intro
        .split(/\n{2,}/)
        .map((para) => `<p style="margin:0 0 12px;font:15px/1.6 Arial,Helvetica,sans-serif;color:#3b3833;">${esc(para).replace(/\n/g, '<br />')}</p>`)
        .join('')
    : '';
  const cabinNote = o.personal
    ? `<p style="margin:0 0 8px;">These photos show you wearing the products: The Cabin made them from your own profile photo, only for you. <a href="${esc(o.profileUrl)}" style="color:${gold};">Your Cabin profile</a></p>`
    : '';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(o.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3eee6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eee6;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
  <tr><td align="center" style="padding:26px 28px 18px;border-bottom:1px solid #eee6d8;">
    <div style="font:500 22px/1.2 Georgia,'Times New Roman',serif;letter-spacing:4px;text-transform:uppercase;color:#1c1b19;">${esc(o.storeName)}</div>
  </td></tr>
  <tr><td style="padding:26px 28px 6px;">
    ${lead}
    <h1 style="margin:0 0 14px;font:500 28px/1.25 Georgia,'Times New Roman',serif;color:#1c1b19;">${esc(o.subject)}</h1>
    ${hello}${intro}
  </td></tr>
  <tr><td style="padding:4px 18px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
  </td></tr>
  <tr><td style="padding:18px 28px 26px;border-top:1px solid #eee6d8;font:12px/1.6 Arial,Helvetica,sans-serif;color:#8a847a;">
    ${cabinNote}
    <p style="margin:0;">You receive this email because you subscribed to ${esc(o.storeName)}'s newsletter. <a href="{{unsubscribe_url}}" style="color:#8a847a;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = [
    o.storeName.toUpperCase(),
    '',
    o.personal ? 'Styled on you' : '',
    o.subject,
    o.greeting ? `\nHi ${o.greeting},` : '',
    o.intro ?? '',
    '',
    ...o.products.map((p) => `- ${p.name}${p.price ? ` (${p.price})` : ''}${p.url ? `: ${p.url}` : ''}`),
    '',
    o.personal ? 'These photos show you wearing the products: The Cabin made them from your own profile photo, only for you.' : '',
    `Unsubscribe: {{unsubscribe_url}}`,
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
  return { html, text };
}

/** Render every recipient's email into the outbox (again, if the campaign changed). The campaign is then ready. */
export async function buildOutbox(db: DB, auth: Auth, campaignId: string, origin: string) {
  const c = await db
    .select()
    .from(schema.nlCampaigns)
    .where(and(eq(schema.nlCampaigns.id, campaignId), eq(schema.nlCampaigns.tenantId, auth.tenantId)))
    .get();
  if (!c) throw new TryonError('not_found', 'No such campaign.');
  const products = await db.select().from(schema.nlProducts).where(eq(schema.nlProducts.campaignId, campaignId)).orderBy(asc(schema.nlProducts.position)).all();
  const recipients = await db.select().from(schema.nlRecipients).where(eq(schema.nlRecipients.campaignId, campaignId)).all();
  const items = await db.select().from(schema.nlItems).where(eq(schema.nlItems.campaignId, campaignId)).all();
  const profiles = await db
    .select({ id: schema.profiles.id, name: schema.profiles.name })
    .from(schema.profiles)
    .where(inArray(schema.profiles.id, recipients.map((r) => r.profileId).filter((x): x is string => !!x).concat('')))
    .all();
  const nameOf = new Map(profiles.map((p) => [p.id, p.name]));
  const abs = (key: string) => `${origin}${imageUrl(key)}`;
  let personal = 0;
  for (const r of recipients) {
    const mine = new Map(items.filter((i) => i.recipientId === r.id && i.status === 'done' && i.resultR2Key).map((i) => [i.productId, i.resultR2Key!]));
    const list: MailProduct[] = products.map((p: ProductRow) => {
      const key = mine.get(p.id);
      return { name: p.name, price: p.price ?? undefined, url: p.productUrl ?? undefined, image: key ? abs(key) : p.imageUrl, onYou: !!key };
    });
    const isPersonal = list.some((p) => p.onYou);
    if (isPersonal) personal++;
    const first = (r.profileId && nameOf.get(r.profileId)?.trim().split(/\s+/)[0]) || undefined;
    const mail = renderEmail({
      storeName: c.storeName,
      subject: c.subject,
      intro: c.intro ?? undefined,
      greeting: isPersonal ? first : undefined,
      products: list,
      personal: isPersonal,
      profileUrl: `${origin}/profile`,
    });
    const row = {
      id: newId('nlo'),
      campaignId,
      recipientId: r.id,
      toEmail: r.email,
      subject: c.subject,
      html: mail.html,
      text: mail.text,
      kind: isPersonal ? 'personal' : 'standard',
      status: 'ready',
      createdAt: Date.now(),
      sentAt: null,
      providerId: null,
      error: null,
    };
    const { id: _id, ...rest } = row;
    await db.insert(schema.nlOutbox).values(row).onConflictDoUpdate({ target: schema.nlOutbox.recipientId, set: rest }).run();
  }
  await db.update(schema.nlCampaigns).set({ status: 'ready' }).where(eq(schema.nlCampaigns.id, campaignId)).run();
  return { emails: recipients.length, personal, standard: recipients.length - personal };
}

/** One rendered email, as the subscriber's "view in browser" page (the id is the unguessable outbox id). */
export async function outboxHtml(db: DB, id: string): Promise<string | null> {
  const row = await db.select({ html: schema.nlOutbox.html }).from(schema.nlOutbox).where(eq(schema.nlOutbox.id, id)).get();
  return row ? row.html.replace(/\{\{unsubscribe_url\}\}/g, '#') : null;
}

