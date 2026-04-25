import { Hono } from "hono";
import { z } from "zod";
import { runAgent } from "../agent";
import { getSessionId, saveSessionId } from "../session-store";

const RequestSchema = z.object({
  message: z.string().min(1),
  source: z.string().min(1),
  sessionKey: z.string().min(1),
});

export const agentRoute = new Hono();

agentRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  const { message, source, sessionKey } = parsed.data;
  const vaultPath = process.env.VAULT_PATH;

  if (!vaultPath) {
    return c.json({ error: "VAULT_PATH not configured" }, 500);
  }

  const existingSessionId = await getSessionId(source, sessionKey).catch(() => null);

  const { result, sessionId } = await runAgent({
    message,
    sessionId: existingSessionId ?? undefined,
    vaultPath,
  });

  await saveSessionId(source, sessionKey, sessionId).catch((err) => {
    console.error("Failed to save session:", err);
  });

  return c.json({ text: result });
});
