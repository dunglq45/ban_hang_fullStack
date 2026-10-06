import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE = "sid";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** "Ghi nhớ": sống 30 ngày, gia hạn thêm 30 ngày khi còn dưới 7 ngày mà vẫn dùng. */
export const SESSION_TTL_MS = 30 * DAY_MS;
/**
 * Không ghi nhớ: cookie phiên, nhưng trình duyệt "khôi phục phiên" có thể giữ nó rất lâu,
 * nên server chỉ cho sống 1 ngày kể từ lần dùng gần nhất (gia hạn khi còn dưới 12 giờ).
 */
export const SHORT_SESSION_TTL_MS = DAY_MS;

export function sessionPolicy(remember: boolean) {
  return remember
    ? { ttlMs: SESSION_TTL_MS, renewBeforeMs: 7 * DAY_MS }
    : { ttlMs: SHORT_SESSION_TTL_MS, renewBeforeMs: 12 * HOUR_MS };
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

/** remember = false: cookie phiên (mất khi đóng trình duyệt); true: giữ 30 ngày. */
export function writeSessionCookie(c: Context, token: string, remember: boolean) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    ...(remember ? { maxAge: SESSION_TTL_MS / 1000 } : {}),
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
}
