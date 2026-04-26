import { TwitterApi, TweetV2UserLikedTweetsPaginator } from "twitter-api-v2";
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
  // const isFirstRun = cursor === null;
  const isFirstRun = true

  const paginator: TweetV2UserLikedTweetsPaginator = await client.v2.userLikedTweets(X_USER_ID, {
    "tweet.fields": ["text", "author_id", "created_at", "entities"],
    expansions: ["author_id"],
    "user.fields": ["username", "name"],
    max_results: isFirstRun ? 1 : 100,
  });

  const newTweets: XTweet[] = [];
  let processedCount = 0;
  let pageCount = 1;
  let cursorReached = false;

  while (true) {
    const allTweets = paginator.tweets;
    const userMap = new Map(
      paginator.includes.users.map((u) => [u.id, { username: u.username, name: u.name }])
    );

    for (let i = processedCount; i < allTweets.length; i++) {
      const tweet = allTweets[i];

      if (!isFirstRun && tweet.id === cursor) {
        cursorReached = true;
        break;
      }

      const user = userMap.get(tweet.author_id ?? "") ?? { username: "unknown", name: "Unknown" };
      const rawUrls = (tweet.entities?.urls ?? []).map(
        (u: { expanded_url?: string; url: string }) => u.expanded_url ?? u.url
      );
      const externalUrls = rawUrls.filter(
        (u: string) =>
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

    processedCount = allTweets.length;

    if (cursorReached || isFirstRun || !paginator.meta?.next_token || pageCount >= MAX_PAGES) {
      break;
    }

    await paginator.fetchNext();
    pageCount++;
  }

  if (!cursorReached && !isFirstRun && pageCount >= MAX_PAGES && newTweets.length > 0) {
    console.warn(
      `[x-client] MAX_PAGES (${MAX_PAGES}) reached without finding cursor ${cursor}. Some likes may be missed.`
    );
  }

  return newTweets;
}
