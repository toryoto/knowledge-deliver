import type { App } from "@slack/bolt";
import type { MessageEvent } from "@slack/types";
import type { WebClient } from "@slack/web-api";
import { captureError } from "observability";
import { askAgent } from "../agent-client";

async function isDirectMessageChannel(
  client: WebClient,
  channelId: string,
  channelType: string | undefined
): Promise<boolean> {
  if (channelType === "im") {
    return true;
  }
  if (channelType !== undefined && channelType !== "im") {
    return false;
  }
  try {
    const res = await client.conversations.info({ channel: channelId });
    return Boolean(res.channel?.is_im);
  } catch {
    return false;
  }
}

function isUserTextMessage(event: MessageEvent): boolean {
  if ("bot_id" in event && event.bot_id) {
    return false;
  }
  if ("subtype" in event && event.subtype !== undefined) {
    return false;
  }
  return true;
}

export function registerDmHandler(app: App): void {
  app.event("message", async ({ event, say, logger, client }) => {
    const e = event as MessageEvent;
    if (!isUserTextMessage(e)) {
      return;
    }
    if (!("channel" in e) || typeof e.channel !== "string") {
      return;
    }

    const channelType = "channel_type" in e ? e.channel_type : undefined;
    const ok = await isDirectMessageChannel(client, e.channel, channelType);
    if (!ok) {
      return;
    }

    const message = "text" in e ? e.text?.trim() : undefined;
    const sessionKey =
      "thread_ts" in e && e.thread_ts ? e.thread_ts : "ts" in e ? e.ts : undefined;

    if (!message || !sessionKey) {
      return;
    }

    try {
      const text = await askAgent(message, sessionKey);
      await say({ thread_ts: sessionKey, text });
    } catch (error) {
      logger.error("dm handler failed", error);
      captureError(error, { event_type: "message", channel: e.channel, sessionKey }, { step: "slack.dm" });
      await say({
        thread_ts: sessionKey,
        text: "エージェント呼び出しに失敗しました。時間をおいて再試行してください。",
      });
    }
  });
}
