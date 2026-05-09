import { initObservability, captureError } from "observability";
import { App } from "@slack/bolt";
import { SLACK_APP_TOKEN, SLACK_BOT_TOKEN } from "./config";
import { registerCommandHandlers } from "./handlers/commands";
import { registerDmHandler } from "./handlers/dm";
import { registerMentionHandler } from "./handlers/mention";
import { registerReactionHandler } from "./handlers/reaction";

initObservability({ service: "slack-bot" });

const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});

app.error(async (err) => {
  app.logger.error("Bolt unhandled error", err);
  captureError(err, {}, { step: "bolt.global" });
});

process.on("unhandledRejection", (reason) => {
  app.logger.error("unhandledRejection", reason);
  captureError(reason, {}, { step: "process.unhandledRejection" });
});

registerMentionHandler(app);
registerDmHandler(app);
registerCommandHandlers(app);
registerReactionHandler(app);

await app.start();
app.logger.info("slack-bot: started");
