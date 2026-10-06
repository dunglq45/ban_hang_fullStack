// Token phiên đăng nhập: 32 byte ngẫu nhiên, gửi cho trình duyệt dạng base64url.
// DB chỉ lưu sha256(token) dạng hex, nên lộ DB cũng không dùng được để đăng nhập.

const TOKEN_BYTES = 32;

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex;
}
