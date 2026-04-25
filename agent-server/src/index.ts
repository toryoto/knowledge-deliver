import { Hono } from "hono";
import { PORT } from "../lib/config";
import { logger } from "../lib/logger";
import { agentRoute } from "./http/routes/agent";
import { healthRoute } from "./http/routes/health";
import { webhookRoute } from "./http/routes/webhook";
import { initVault } from "./vault";

await initVault();

const app = new Hono();

app.use("*", async (c, next) => {
  const start = performance.now();
  await next();
  const ms = Math.round(performance.now() - start);
  const path = c.req.path;
  if (path === "/health" || path === "/health/") {
    logger.debug("http", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: ms,
    });
  } else {
    logger.info("http", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: ms,
    });
  }
});

app.route("/agent", agentRoute);
app.route("/webhook/github", webhookRoute);
app.route("/health", healthRoute);

app.onError((err, c) => {
  logger.error("unhandled", err, { path: c.req.path });
  return c.json({ error: "Internal server error" }, 500);
});

logger.info("server: listening", { port: PORT });

export default {
  port: PORT,
  fetch: app.fetch,
};
