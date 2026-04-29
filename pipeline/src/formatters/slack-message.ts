import type { Block, KnownBlock } from "@slack/types";
import { hasXArticle, type XTweet } from "../lib/x-client";

const MAX_TWEET_LENGTH = 300;

export function buildTweetBlocks(
  tweet: XTweet,
  summary: string | null
): (Block | KnownBlock)[] {
  const truncatedText =
    tweet.text.length > MAX_TWEET_LENGTH
      ? tweet.text.slice(0, MAX_TWEET_LENGTH) + "…"
      : tweet.text;

  const blocks: (Block | KnownBlock)[] = [
    // Block 0: author
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${tweet.authorName}* (@${tweet.authorUsername})`,
      },
    },
    // Block 1: tweet text
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncatedText,
      },
    },
  ];

  // Block 2: summary（X Article / リンク要約）
  if (summary && (hasXArticle(tweet) || tweet.urls.length > 0)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: summary,
      },
    });
  }

  // Block 3: context with marker
  const contextParts = [`<${tweet.url}|View on X> x-post-v1`];
  for (const url of tweet.urls) {
    contextParts.push(`<${url}|${url}>`);
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: contextParts.join("  |  "),
      },
    ],
  });

  // Block 4: divider
  blocks.push({ type: "divider" });

  return blocks;
}
