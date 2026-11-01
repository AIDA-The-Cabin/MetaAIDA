const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function abToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function dataUri(buf: ArrayBuffer, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${abToBase64(buf)}`;
}

function imageFetch(url: string): Promise<Response> {
  let referer = '/';
  try {
    referer = new URL(url).origin + '/';
  } catch {
    /* ignore */
  }
  return fetch(url, { headers: { 'User-Agent': UA, Referer: referer } });
}

/** Fetch a (possibly hotlink-protected) image server-side and return a base64 data URI. */
export async function fetchImageAsDataUri(url: string): Promise<string> {
  const res = await imageFetch(url);
  if (!res.ok) throw new Error(`garment fetch failed: ${res.status}`);
  const ct = res.headers.get('content-type') || 'image/jpeg';
  const mime = ct.startsWith('image/') ? ct.split(';')[0] : 'image/jpeg';
  return dataUri(await res.arrayBuffer(), mime);
}

/** Does the store's CDN serve this image to us? (status + content type only; the body is not read) */
export async function imageReachable(url: string): Promise<boolean> {
  try {
    const res = await imageFetch(url);
    const ok = res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
    await res.body?.cancel();
    return ok;
  } catch {
    return false;
  }
}

export function encodeKey(key: string): string {
  return btoa(key).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeKey(enc: string): string {
  const b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
