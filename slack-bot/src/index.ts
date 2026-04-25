import { App } from "@slack/bolt";
import { SLACK_APP_TOKEN, SLACK_BOT_TOKEN } from "./config";
import { registerCommandHandlers } from "./handlers/commands";
import { registerDmHandler } from "./handlers/dm";
import { registerMentionHandler } from "./handlers/mention";

const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});

registerMentionHandler(app);
registerDmHandler(app);
registerCommandHandlers(app);

await app.start();
app.logger.info("slack-bot: started");
