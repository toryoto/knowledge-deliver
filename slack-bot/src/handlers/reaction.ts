import type { App } from "@slack/bolt";
import { SLACK_DIGEST_CHANNEL_ID, SAVE_REACTION_EMOJI } from "../config";
import { askAgent } from "../agent-client";
import { parseTweetFromBlocks } from "../lib/parse-tweet-blocks";
import type { ParsedTweetForVault } from "../lib/parse-tweet-blocks";

function buildObsidianSavePrompt(tweet: ParsedTweetForVault): string {
  const lines = [
    `以下のX投稿をObsidianのVaultに保存してください。`,
    ``,
    `URL: ${tweet.xUrl}`,
    `著者: @${tweet.authorUsername}`,
    ``,
    `ツイート本文:`,
    tweet.tweetText,
  ];

  if (tweet.summary) {
    lines.push(``, `構造化要約:`, tweet.summary);
  }

  return lines.join("\n");
}

export function registerReactionHandler(app: App): void {
  if (!SLACK_DIGEST_CHANNEL_ID) {
    app.logger.warn("SLACK_DIGEST_CHANNEL_ID is not set — reaction handler disabled");
    return;
  }

  app.event("reaction_added", async ({ event, client, logger }) => {
    if (event.reaction !== SAVE_REACTION_EMOJI) return;
    if (event.item.type !== "message") return;
    if (event.item.channel !== SLACK_DIGEST_CHANNEL_ID) return;

    try {
      const result = await client.conversations.replies({
        channel: event.item.channel,
        ts: event.item.ts,
        limit: 1,
        inclusive: true,
      });

      const tweetData = parseTweetFromBlocks(result.messages?.[0]?.blocks as unknown[]);
      if (!tweetData) return;

      await askAgent(buildObsidianSavePrompt(tweetData), "import-x-post");
    } catch (err) {
      logger.error("reaction handler failed", err);
    }
  });
}
