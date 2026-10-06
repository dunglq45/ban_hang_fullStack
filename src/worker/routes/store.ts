import { Hono } from "hono";
import { z } from "zod";
import { createUserSchema, updateStoreSchema, updateUserSchema } from "../../shared/schemas/store";
import { validate } from "../lib/validate";
import { requireAuth, requireOwner } from "../middleware/session";
import { getStore, updateStore } from "../services/store";
import { createUser, listUsers, updateUser } from "../services/users";
import type { AuthEnv } from "../types";

const idParam = z.object({ id: z.string().min(1).max(64) });

export const storeRoutes = new Hono<AuthEnv>()
  .use(requireAuth, requireOwner)
  .get("/", async (c) => c.json(await getStore(c.get("db"))))
  .put("/", validate("json", updateStoreSchema), async (c) =>
    c.json(await updateStore(c.get("db"), c.req.valid("json"))),
  );

export const userRoutes = new Hono<AuthEnv>()
  .use(requireAuth, requireOwner)
  .get("/", async (c) => c.json({ items: await listUsers(c.get("db")) }))
  .post("/", validate("json", createUserSchema), async (c) =>
    c.json(await createUser(c.get("db"), c.req.valid("json")), 201),
  )
  .patch("/:id", validate("param", idParam), validate("json", updateUserSchema), async (c) =>
    c.json(
      await updateUser(
        c.get("db"),
        c.get("user"),
        c.get("session")!.id,
        c.req.valid("param").id,
        c.req.valid("json"),
      ),
    ),
  );
