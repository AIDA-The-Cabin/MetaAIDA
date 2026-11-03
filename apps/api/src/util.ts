import { Buffer } from 'node:buffer';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Native base64 (nodejs_compat): the JS loops it replaced cost most of a try-on's CPU time, and the free plan's
// CPU budget ran out mid-conversion (1102 exceededCpu).
export function abToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

export function base64ToBytes(b64: string): Uint8Array {
  const b = Buffer.from(b64, 'base64');
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice(); // its own buffer (small Buffers share a pool)
}

export function dataUri(buf: ArrayBuffer | Uint8Array, mime = 'image/jpeg'): string {
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

/** Width and height from the image file's header (JPEG, PNG, WebP, GIF) — without decoding the pixels. */
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 30) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: v.getUint32(16), h: v.getUint32(20) };
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    // walk the JPEG segments to the frame header (SOFn)
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) {
        i += m === 0xff ? 1 : 2;
        continue;
      }
      const sof = (m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf);
      if (sof) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  return null;
}
