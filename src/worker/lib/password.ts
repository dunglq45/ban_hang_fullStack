// Băm mật khẩu PBKDF2-SHA256 qua WebCrypto (chạy native trên Workers và Node 22).
// Định dạng: "pbkdf2$<vòng lặp>$<salt base64>$<hash base64>".
// Workers giới hạn PBKDF2 tối đa 100000 vòng.

const ITERATIONS = 100_000;
// Chuỗi lưu có số vòng thấp hơn mức này bị coi là không hợp lệ (chống hạ cấp).
const MIN_ITERATIONS = 10_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterText, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterText || !saltB64 || !hashB64) return false;
  const iterations = Number(iterText);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > ITERATIONS) return false;

  let expected: Uint8Array;
  let salt: Uint8Array<ArrayBuffer>;
  try {
    expected = fromBase64(hashB64);
    salt = fromBase64(saltB64);
  } catch {
    return false; // base64 hỏng
  }
  const actual = await derive(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  // So sánh thời gian hằng để không lộ thông tin qua thời gian phản hồi.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
