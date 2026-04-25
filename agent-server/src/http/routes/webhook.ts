import { Hono } from "hono";
import { isValidHubSignature256 } from "../../../lib/github-webhook-signature";
import { GITHUB_WEBHOOK_SECRET } from "../../../lib/config";
import { logger } from "../../../lib/logger";
import { pullVault } from "../../vault";

const VAULT_SYNC_REFS: readonly string[] = [
  "refs/heads/main",
  "refs/heads/master",
];

export const webhookRoute = new Hono();

webhookRoute.post("/", async (c) => {
  if (!GITHUB_WEBHOOK_SECRET) {
    logger.error("webhook: GITHUB_WEBHOOK_SECRET not set");
    return c.json({ error: "Webhook secret not configured" }, 500);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");

  if (!signature) {
    logger.warn("webhook: missing signature");
    return c.json({ error: "Missing signature" }, 401);
  }

  if (!isValidHubSignature256(GITHUB_WEBHOOK_SECRET, rawBody, signature)) {
    logger.warn("webhook: bad signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const payload = JSON.parse(rawBody) as { ref?: string };
  if (payload.ref && VAULT_SYNC_REFS.includes(payload.ref)) {
    logger.info("webhook: main push, scheduling pull", { ref: payload.ref });
    setImmediate(() => {
      pullVault().catch((err) => logger.error("vault: pull failed (webhook)", err));
    });
  } else {
    logger.debug("webhook: ignored (non-default branch)", { ref: String(payload.ref) });
  }

  return c.json({ ok: true });
});
