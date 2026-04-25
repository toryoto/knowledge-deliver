import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
import { pullVault } from "../vault";

export const webhookRoute = new Hono();

webhookRoute.post("/", async (c) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: "Webhook secret not configured" }, 500);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");

  if (!signature) {
    return c.json({ error: "Missing signature" }, 401);
  }

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);

  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const payload = JSON.parse(rawBody) as { ref?: string };
  if (payload.ref === "refs/heads/main" || payload.ref === "refs/heads/master") {
    setImmediate(() => {
      pullVault().catch((err) => console.error("Vault pull failed:", err));
    });
  }

  return c.json({ ok: true });
});
