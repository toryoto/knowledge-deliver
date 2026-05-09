import type { App } from "@slack/bolt";
import { captureError } from "observability";
import { askAgent } from "../agent-client";

function stripMentionPrefix(text: string): string {
  return text.replace(/^<@[^>]+>\s*/, "").trim();
}

export function registerMentionHandler(app: App): void {
  app.event("app_mention", async ({ event, say, logger }) => {
    const message = stripMentionPrefix(event.text ?? "");
    const sessionKey = event.thread_ts ?? event.ts;

    if (!message) {
      await say({
        thread_ts: sessionKey,
        text: "メッセージが空です。質問内容を送ってください。",
      });
      return;
    }

    try {
      const text = await askAgent(message, sessionKey);
      await say({ thread_ts: sessionKey, text });
    } catch (error) {
      logger.error("app_mention handler failed", error);
      captureError(error, { event_type: "app_mention", channel: event.channel, sessionKey }, { step: "slack.mention" });
      await say({
        thread_ts: sessionKey,
        text: "エージェント呼び出しに失敗しました。時間をおいて再試行してください。",
      });
    }
  });
}
