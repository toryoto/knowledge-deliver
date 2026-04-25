import { Hono } from "hono";
import { agentRoute } from "./routes/agent";
import { webhookRoute } from "./routes/webhook";
import { healthRoute } from "./routes/health";
import { initVault } from "./vault";

await initVault();

const app = new Hono();

app.route("/agent", agentRoute);
app.route("/webhook/github", webhookRoute);
app.route("/health", healthRoute);

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number(process.env.PORT ?? 3000);
console.log(`agent-server listening on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
