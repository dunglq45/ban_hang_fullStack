import { Hono } from "hono";
import { changePasswordSchema, loginSchema, registerSchema } from "../../shared/schemas/auth";
import { getAuthDb } from "../db/client";
import { clearSessionCookie, writeSessionCookie } from "../lib/session-cookie";
import { validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { requireAuth } from "../middleware/session";
import { login, logout, register } from "../services/auth";
import { getStore } from "../services/store";
import { changeOwnPassword } from "../services/users";
import type { AppEnv } from "../types";

export const authRoutes = new Hono<AppEnv>()
  .post("/register", rateLimit("REGISTER_LIMITER"), validate("json", registerSchema), async (c) => {
    const s = await register(getAuthDb(c.env), c.req.valid("json"));
    writeSessionCookie(c, s.token, s.remember);
    return c.json({ user: s.user }, 201);
  })
  .post("/login", rateLimit("LOGIN_LIMITER"), validate("json", loginSchema), async (c) => {
    const s = await login(getAuthDb(c.env), c.req.valid("json"), c.get("session")?.id);
    writeSessionCookie(c, s.token, s.remember);
    return c.json({ user: s.user });
  })
  .post("/logout", requireAuth, async (c) => {
    await logout(getAuthDb(c.env), c.get("session")!.id);
    clearSessionCookie(c);
    return c.json({ ok: true });
  })
  .get("/me", requireAuth, async (c) => {
    const store = await getStore(c.get("db"));
    return c.json({ user: c.get("user"), store });
  })
  .put("/password", requireAuth, validate("json", changePasswordSchema), async (c) => {
    await changeOwnPassword(c.get("db"), c.get("user"), c.get("session")!.id, c.req.valid("json"));
    return c.json({ ok: true });
  });
