import { fetchNewLikes } from "../lib/x-client";
import { getCursor, setCursor } from "../lib/like-cursor-store";
import { fetchUrlsContent } from "../lib/web-fetcher";
import { summarize } from "../lib/summarizer";
import { postHeader, postThreadReply } from "../lib/slack-client";
import { buildTweetBlocks } from "../formatters/slack-message";

function getTodayLabel(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runCollectXLikesJob(): Promise<void> {
  console.log("[collect-x-likes] job started");

  const newTweets = await fetchNewLikes();
  console.log(`[collect-x-likes] fetched ${newTweets.length} new like(s)`);

  if (newTweets.length === 0) {
    console.log("[collect-x-likes] no new likes, skipping Slack post and cursor update");
    return;
  }

  const headerText = `*X Likes Digest — ${getTodayLabel()}* (${newTweets.length} posts)`;
  const headerTs = await postHeader(headerText);
  console.log(`[collect-x-likes] header posted (ts=${headerTs})`);

  // Sequential processing per spec (Slack rate limit 対策)
  for (const tweet of newTweets) {
    const webContent = await fetchUrlsContent(tweet.urls);
    const summary = tweet.urls.length > 0 ? await summarize(tweet, webContent) : null;
    const blocks = buildTweetBlocks(tweet, summary);
    await postThreadReply(blocks, headerTs, `${tweet.authorName}: ${tweet.text.slice(0, 100)}`);
    console.log(`[collect-x-likes] posted tweet ${tweet.id}`);
  }

  // Cursor update only after all posts succeed
  await setCursor(newTweets[0].id);
  console.log(`[collect-x-likes] cursor updated to ${newTweets[0].id}`);
}
