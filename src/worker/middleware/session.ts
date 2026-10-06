import { createMiddleware } from "hono/factory";
import { getAuthDb, getDb } from "../db/client";
import { AppError } from "../lib/errors";
import {
  clearSessionCookie,
  readSessionCookie,
  sessionPolicy,
  writeSessionCookie,
} from "../lib/session-cookie";
import { sha256Hex } from "../lib/token";
import type { AppEnv, AuthEnv } from "../types";

/** Đọc cookie `sid`; nếu phiên hợp lệ thì gắn `c.var.session` và gia hạn khi sắp hết hạn. */
export const session = createMiddleware<AppEnv>(async (c, next) => {
  const token = readSessionCookie(c);
  if (!token) return next();

  const now = Date.now();
  const id = await sha256Hex(token);
  const auth = getAuthDb(c.env);
  const row = await auth.findSession(id, now);
  if (!row || row.user.storeId !== row.storeId) {
    // Phiên hết hạn, bị xóa hoặc tài khoản bị khóa.
    clearSessionCookie(c);
    return next();
  }

  const policy = sessionPolicy(row.remember);
  if (row.expiresAt - now < policy.renewBeforeMs) {
    await auth.extendSession(id, now + policy.ttlMs);
    if (row.remember) writeSessionCookie(c, token, true);
  }

  const { id: userId, name, phone, role } = row.user;
  c.set("session", { id, storeId: row.storeId, user: { id: userId, name, phone, role } });
  return next();
});

/** Bắt buộc đăng nhập. storeId luôn lấy từ session, không bao giờ từ request. */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const s = c.get("session");
  if (!s) throw new AppError("UNAUTHORIZED", "Vui lòng đăng nhập để tiếp tục");
  c.set("user", s.user);
  c.set("storeId", s.storeId);
  c.set("db", getDb(c.env, s.storeId));
  return next();
});

/** Chỉ chủ cửa hàng. Đặt sau requireAuth. */
export const requireOwner = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get("user").role !== "owner") {
    throw new AppError("FORBIDDEN", "Chỉ chủ cửa hàng được thực hiện thao tác này");
  }
  return next();
});
