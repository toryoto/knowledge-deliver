import { Hono } from "hono";
import { z } from "zod";
import { VAULT_PATH } from "../../lib/config";
import { logger } from "../../lib/logger";
import { getSessionId, saveSessionId } from "../../lib/session-store";
import { runAgent } from "../agent";
import { isVaultReady } from "../vault";

const requestBodySchema = z.object({
  message: z.string().min(1),
  source: z.string().min(1),
  sessionKey: z.string().min(1),
});

export const agentRoute = new Hono();

agentRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = requestBodySchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("agent: bad request", { issueCount: parsed.error.issues.length });
    return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  const { message, source, sessionKey } = parsed.data;

  if (!VAULT_PATH) {
    logger.error("agent: VAULT_PATH missing", undefined, { source, sessionKey });
    return c.json({ error: "VAULT_PATH not configured" }, 500);
  }

  if (!isVaultReady()) {
    logger.warn("agent: vault not ready", { source, sessionKey });
    return c.json(
      {
        error:
          "Vault is not initialized (git clone failed or still starting). Check GITHUB_TOKEN: repository must be selected on the token, Contents read (or read/write), and SSO authorized if the org requires it.",
      },
      503
    );
  }

  const existingSessionId = await getSessionId(source, sessionKey).catch((err) => {
    logger.error("agent: getSessionId failed", err, { source, sessionKey });
    return null;
  });

  logger.info("agent: start", {
    source,
    sessionKey,
    messageChars: message.length,
    resume: existingSessionId ? 1 : 0,
  });

  try {
    const { result, sessionId } = await runAgent({
      message,
      sessionId: existingSessionId ?? undefined,
      vaultPath: VAULT_PATH,
    });

    await saveSessionId(source, sessionKey, sessionId).catch((err) => {
      logger.error("agent: saveSessionId failed", err, { source, sessionKey });
    });

    logger.info("agent: ok", { source, sessionKey, resultChars: result.length });
    return c.json({ text: result });
  } catch (err) {
    logger.error("agent: run failed", err, { source, sessionKey });
    throw err;
  }
});
