import type { Block, KnownBlock } from "@slack/types";
import { WebClient } from "@slack/web-api";
import { SLACK_BOT_TOKEN, SLACK_DIGEST_CHANNEL_ID } from "./config";

const slack = new WebClient(SLACK_BOT_TOKEN);

export async function postHeader(text: string): Promise<string> {
  const result = await slack.chat.postMessage({
    channel: SLACK_DIGEST_CHANNEL_ID,
    text,
  });
  if (!result.ts) throw new Error("Slack postMessage did not return ts");
  return result.ts;
}

export async function postThreadReply(
  blocks: (Block | KnownBlock)[],
  threadTs: string,
  fallbackText: string
): Promise<void> {
  await slack.chat.postMessage({
    channel: SLACK_DIGEST_CHANNEL_ID,
    thread_ts: threadTs,
    text: fallbackText,
    blocks,
  });
}
