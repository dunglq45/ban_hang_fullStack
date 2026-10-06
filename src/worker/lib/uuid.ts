// UUIDv7 (RFC 9562): 48 bit thời gian ms + 74 bit ngẫu nhiên, sắp xếp được theo thời gian.
// Trong cùng một ms, 12 bit rand_a dùng làm bộ đếm để giữ thứ tự tăng dần trong một isolate.

let lastMs = -1;
let seq = 0;

export function uuidv7(): string {
  const now = Date.now();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  if (now > lastMs) {
    lastMs = now;
    seq = (bytes[6]! & 0x07) * 256 + bytes[7]!; // khởi đầu ngẫu nhiên, chừa chỗ để tăng
  } else {
    // Đồng hồ đứng yên hoặc lùi: dùng lại lastMs và tăng bộ đếm.
    seq++;
    if (seq > 0xfff) {
      lastMs++;
      seq = 0;
    }
  }
  const ms = lastMs;

  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = (ms >>> 24) & 0xff;
  bytes[3] = (ms >>> 16) & 0xff;
  bytes[4] = (ms >>> 8) & 0xff;
  bytes[5] = ms & 0xff;
  bytes[6] = 0x70 | ((seq >>> 8) & 0x0f); // version 7
  bytes[7] = seq & 0xff;
  bytes[8] = 0x80 | (bytes[8]! & 0x3f); // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
