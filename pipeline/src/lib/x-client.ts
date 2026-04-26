import { TwitterApi } from "twitter-api-v2";
import { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET, X_USER_ID, MAX_PAGES } from "./config";
import { getCursor } from "./like-cursor-store";

export type XTweet = {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string;
  url: string;
  urls: string[];
};

const client = new TwitterApi({
  appKey: X_API_KEY,
  appSecret: X_API_SECRET,
  accessToken: X_ACCESS_TOKEN,
  accessSecret: X_ACCESS_SECRET,
});

export async function fetchNewLikes(): Promise<XTweet[]> {
  const cursor = await getCursor();
  const isFirstRun = cursor === null;

  const newTweets: XTweet[] = [];
  let pageCount = 0;
  let cursorReached = false;
  let nextToken: string | undefined;

  while (pageCount < MAX_PAGES) {
    const response = await client.v2.userLikedTweets(X_USER_ID, {
      "tweet.fields": ["text", "author_id", "created_at", "entities"],
      expansions: ["author_id"],
      "user.fields": ["username", "name"],
      max_results: isFirstRun ? 10 : 100,
      ...(nextToken ? { pagination_token: nextToken } : {}),
    });
    pageCount++;

    const users = new Map<string, { username: string; name: string }>();
    for (const user of response.includes?.users ?? []) {
      users.set(user.id, { username: user.username, name: user.name });
    }

    for (const tweet of response.data ?? []) {
      if (!isFirstRun && tweet.id === cursor) {
        cursorReached = true;
        break;
      }

      const user = users.get(tweet.author_id ?? "") ?? { username: "unknown", name: "Unknown" };
      type UrlEntity = { expanded_url?: string; url: string };
      const rawUrls: string[] = (
        (tweet.entities?.urls ?? []) as UrlEntity[]
      ).map((u) => u.expanded_url ?? u.url);
      const externalUrls = rawUrls.filter(
        (u) =>
          !u.includes("x.com/") &&
          !u.includes("twitter.com/") &&
          !u.includes("pic.twitter.com")
      );

      newTweets.push({
        id: tweet.id,
        text: tweet.text,
        authorUsername: user.username,
        authorName: user.name,
        url: `https://x.com/${user.username}/status/${tweet.id}`,
        urls: externalUrls,
      });
    }

    if (cursorReached || isFirstRun || !response.meta?.next_token) {
      break;
    }

    nextToken = response.meta.next_token;
  }

  if (!cursorReached && !isFirstRun && pageCount >= MAX_PAGES && newTweets.length > 0) {
    console.warn(
      `[x-client] MAX_PAGES (${MAX_PAGES}) reached without finding cursor ${cursor}. Some likes may be missed.`
    );
  }

  return newTweets;
}
