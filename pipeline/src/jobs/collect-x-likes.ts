import { setContext, addBreadcrumb } from "observability";
import { fetchNewLikes, hasXArticle } from "../lib/x-client";
import { setCursor } from "../lib/like-cursor-store";
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
    const emptyText = `*X Likes Digest — ${getTodayLabel()}* — 新しいいいねはありません`;
    await postHeader(emptyText);
    console.log("[collect-x-likes] no new likes, posted notice to Slack (cursor unchanged)");
    return;
  }

  const headerText = `*X Likes Digest — ${getTodayLabel()}* (${newTweets.length} posts)`;
  const headerTs = await postHeader(headerText);
  console.log(`[collect-x-likes] header posted (ts=${headerTs})`);

  setContext("job", { name: "collect-x-likes", tweetCount: newTweets.length });

  // Sequential processing per spec (Slack rate limit 対策)
  for (const tweet of newTweets) {
    setContext("current_tweet", {
      id: tweet.id,
      url: tweet.url,
      authorUsername: tweet.authorUsername,
    });
    addBreadcrumb({
      category: "pipeline.tweet",
      message: `Processing tweet ${tweet.id}`,
      level: "info",
    });

    let summary: string | null = null;
    if (hasXArticle(tweet)) {
      const parts: string[] = [];
      if (tweet.articleTitle) parts.push(`タイトル: ${tweet.articleTitle}`);
      if (tweet.articlePlainText) {
        parts.push(`本文 (API article.plain_text / preview_text):\n${tweet.articlePlainText}`);
      }
      const articleBlock = parts.join("\n\n");
      if (articleBlock.trim()) {
        summary = await summarize(tweet, articleBlock);
      }
    } else {
      const linkContent = await fetchUrlsContent(tweet.urls);
      const digestParts: string[] = [];
      if (tweet.noteTweetText) {
        digestParts.push(`note_tweet:\n${tweet.noteTweetText}`);
      }
      if (linkContent) {
        digestParts.push(`リンク先の内容:\n${linkContent}`);
      }
      const digestBody = digestParts.length > 0 ? digestParts.join("\n\n---\n\n") : null;
      if (digestBody) {
        summary = await summarize(tweet, digestBody);
      }
    }
    const blocks = buildTweetBlocks(tweet, summary);
    await postThreadReply(blocks, headerTs, `${tweet.authorName}: ${tweet.text.slice(0, 100)}`);
    console.log(`[collect-x-likes] posted tweet ${tweet.id}`);
  }

  // Cursor update only after all posts succeed
  await setCursor(newTweets[0].id);
  console.log(`[collect-x-likes] cursor updated to ${newTweets[0].id}`);
}
