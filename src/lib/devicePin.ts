/**
 * 共用の端末の PIN（7.4.2 #4、決定61）。【暫定】（2026-11-07 の試作）
 * PIN そのものは残さず、端末の中でハッシュ（PBKDF2・SHA-256）にしてから残す。サーバーにも送らない。
 */
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

export const PIN_ITER = 150_000;
export const PIN_OK = /^\d{4,8}$/;

async function derive(pin: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256);
  return toHex(bits);
}

export async function hashPin(userId: string, pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { userId, salt: toHex(salt.buffer), hash: await derive(pin, salt, PIN_ITER), iter: PIN_ITER };
}

export async function checkPin(saved: { salt: string; hash: string; iter: number }, pin: string): Promise<boolean> {
  const h = await derive(pin, fromHex(saved.salt), saved.iter);
  // 長さが同じ文字列を、最後まで比べる
  let d = 0;
  for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ saved.hash.charCodeAt(i);
  return d === 0 && h.length === saved.hash.length;
}
