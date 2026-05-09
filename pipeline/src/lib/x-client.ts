import { TwitterApi, TweetV2UserLikedTweetsPaginator, type TweetV2 } from "twitter-api-v2";
import { captureMessage } from "observability";
import { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET, X_USER_ID, MAX_PAGES, MAX_COLLECT_TWEETS } from "./config";
import { formatPipelineError } from "./error-log";
import { getCursor } from "./like-cursor-store";

const client = new TwitterApi({
  appKey: X_API_KEY,
  appSecret: X_API_SECRET,
  accessToken: X_ACCESS_TOKEN,
  accessSecret: X_ACCESS_SECRET,
});

/** liked_tweets は max_results の最小が 5。1 などは 400 Invalid Request になる */
const LIKED_TWEETS_MIN_PAGE_SIZE = 5;

/** カーソルが一覧に現れないとき（いいね解除など）に投稿・エンリッチする件数の上限 */
const CURSOR_NOT_FOUND_MAX_TWEETS = 5;

/**
 * liked_tweets でも GET /2/tweets/:id でも同じ set を渡す（一覧が note_tweet を省くケースの補完用）
 * @see https://docs.x.com/x-api/posts/get-liked-posts
 */
const LIKED_TWEET_FIELDS: (keyof TweetV2)[] = [
  "text",
  "author_id",
  "created_at",
  "entities",
  "note_tweet",
  "article", // X Article（`GET /2/tweets/:id?tweet.fields=article` と同系）
];

/**
 * API の生レスポンスから note_tweet.text を取り出す（型・大文字小文字差で落ちないようにする）
 */
function extractNoteTweetTextFromPayload(tweet: unknown): string | null {
  if (!tweet || typeof tweet !== "object") return null;
  const t = tweet as Record<string, unknown>;
  const note = t.note_tweet;
  if (!note || typeof note !== "object") return null;
  const text = (note as { text?: unknown }).text;
  if (typeof text !== "string") return null;
  const s = text.trim();
  return s || null;
}

/**
 * API の `article` オブジェクトからタイトル・本文を取り出す（X Article / plain_text, preview_text, title）
 */
function extractArticleFromPayload(tweet: unknown): {
  title: string | null;
  plainText: string | null;
} {
  if (!tweet || typeof tweet !== "object") {
    return { title: null, plainText: null };
  }
  const raw = (tweet as Record<string, unknown>).article;
  if (!raw || typeof raw !== "object") {
    return { title: null, plainText: null };
  }
  const a = raw as Record<string, unknown>;
  const title = typeof a.title === "string" && a.title.trim() ? a.title.trim() : null;
  let plainText: string | null = null;
  if (typeof a.plain_text === "string" && a.plain_text.trim()) {
    plainText = a.plain_text.trim();
  } else if (typeof a.plainText === "string" && a.plainText.trim()) {
    plainText = a.plainText.trim();
  } else if (typeof a.preview_text === "string" && a.preview_text.trim()) {
    plainText = a.preview_text.trim();
  }
  return { title, plainText };
}

/** 一覧に note_tweet が付かないが、長文/省略表示の可能性があるときだけ単体取得する */
function shouldFetchNoteTweetFromSingleEndpoint(tweet: TweetV2): boolean {
  const text = tweet.text ?? "";
  if (text.length >= 260) return true;
  if (/\u2026|\.\.\./.test(text)) return true;
  return false;
}

/** 一覧に article が付かないが、カード系（短い t.co 等）のときだけ単体取得を試す */
function shouldFetchArticleFromSingleEndpoint(tweet: TweetV2): boolean {
  const t = (tweet.text ?? "").trim();
  if (t.length === 0) return false;
  if (t.length < 200 && /^https?:\/\/t\.co\/\S+$/i.test(t)) return true;
  if (t.length < 100 && t.includes("t.co/")) return true;
  return false;
}

type UrlEntry = { expanded_url?: string; url: string };

/**
 * tweet.entities.urls と note_tweet.entities.urls をマージして expanded_url の一覧を返す。
 * note_tweet は型定義外のフィールドなので unknown 経由で安全に取り出す。
 */
function extractAllUrls(tweet: TweetV2, enriched: TweetV2): string[] {
  const tweetUrls: UrlEntry[] = tweet.entities?.urls ?? [];
  const noteUrls: UrlEntry[] = (() => {
    const nt = (enriched as unknown as Record<string, unknown>).note_tweet;
    if (!nt || typeof nt !== "object") return [];
    const entities = (nt as Record<string, unknown>).entities;
    if (!entities || typeof entities !== "object") return [];
    const urls = (entities as Record<string, unknown>).urls;
    return Array.isArray(urls) ? urls : [];
  })();
  const seen = new Set(tweetUrls.map((u) => u.url));
  const merged = [...tweetUrls];
  for (const nu of noteUrls) {
    if (!seen.has(nu.url)) {
      merged.push(nu);
      seen.add(nu.url);
    }
  }
  return merged.map((u) => u.expanded_url ?? u.url);
}

/**
 * ツイート JSON または正規化後の `XTweet` を受け取り、Article（X の `article`）を含むか
 */
export function hasXArticle(tweet: unknown): boolean {
  if (!tweet || typeof tweet !== "object") return false;
  const o = tweet as Record<string, unknown>;
  if ("articlePlainText" in o || "articleTitle" in o) {
    const ap = o.articlePlainText;
    const at = o.articleTitle;
    return (
      (typeof ap === "string" && ap.trim().length > 0) || (typeof at === "string" && at.trim().length > 0)
    );
  }
  const { title, plainText } = extractArticleFromPayload(tweet);
  return Boolean(title || plainText);
}

/**
 * まず liked_tweets の要素を使い、必要なら 1 回の GET /2/tweets/:id で note_tweet / article を補完する。
 */
async function fetchEnrichedTweetIfNeeded(tweet: TweetV2): Promise<TweetV2> {
  const noteFromList = extractNoteTweetTextFromPayload(tweet);
  const artFromList = extractArticleFromPayload(tweet);
  const hasArt = Boolean(artFromList.plainText || artFromList.title);

  const needNote = !noteFromList && shouldFetchNoteTweetFromSingleEndpoint(tweet);
  const needArt = !hasArt && shouldFetchArticleFromSingleEndpoint(tweet);
  if (!needNote && !needArt) {
    return tweet;
  }
  try {
    const { data } = await client.v2.singleTweet(tweet.id, { "tweet.fields": LIKED_TWEET_FIELDS });
    return data;
  } catch (e) {
    console.warn(
      `[x-client] singleTweet(${tweet.id}) for note_tweet/article enrich failed:`,
      formatPipelineError(e)
    );
    return tweet;
  }
}

export type XTweet = {
  id: string;
  text: string;
  /** `tweet.fields=note_tweet`（長文ポスト用） */
  noteTweetText: string | null;
  /** `tweet.fields=article` — X Article のタイトル・本文 */
  articleTitle: string | null;
  articlePlainText: string | null;
  authorUsername: string;
  authorName: string;
  url: string;
  urls: string[];
};

export async function fetchNewLikes(): Promise<XTweet[]> {
  const cursor = await getCursor();
  const isFirstRun = cursor === null;

  const paginator: TweetV2UserLikedTweetsPaginator = await client.v2.userLikedTweets(X_USER_ID, {
    "tweet.fields": LIKED_TWEET_FIELDS,
    expansions: ["author_id"],
    "user.fields": ["username", "name"],
    max_results: isFirstRun ? LIKED_TWEETS_MIN_PAGE_SIZE : 100,
  });

  /** ページを跨いだ author_id → user 展開（後段のエンリッチで使用） */
  const userMapById = new Map<string, { username: string; name: string }>();
  const candidateTweets: TweetV2[] = [];
  let processedCount = 0;
  let pageCount = 1;
  let cursorReached = false;

  while (true) {
    const allTweets = paginator.tweets;
    for (const u of paginator.includes?.users ?? []) {
      userMapById.set(u.id, { username: u.username, name: u.name });
    }

    for (let i = processedCount; i < allTweets.length; i++) {
      const tweet = allTweets[i] as TweetV2;

      if (!isFirstRun && tweet.id === cursor) {
        cursorReached = true;
        break;
      }

      candidateTweets.push(tweet);
    }

    processedCount = allTweets.length;

    if (
      cursorReached ||
      isFirstRun ||
      !paginator.meta?.next_token ||
      pageCount >= MAX_PAGES
    ) {
      break;
    }

    await paginator.fetchNext();
    pageCount++;
  }

  let tweetsToEnrich: TweetV2[];
  if (isFirstRun) {
    tweetsToEnrich = candidateTweets;
  } else if (cursorReached) {
    if (candidateTweets.length > MAX_COLLECT_TWEETS) {
      console.warn(
        `[x-client] MAX_COLLECT_TWEETS (${MAX_COLLECT_TWEETS}) reached (cursor found). Truncating older likes.`
      );
    }
    tweetsToEnrich = candidateTweets.slice(0, MAX_COLLECT_TWEETS);
  } else {
    const msg = `[x-client] cursor ${cursor} not found in liked posts; processing top ${CURSOR_NOT_FOUND_MAX_TWEETS} only (e.g. unliked edge).`;
    console.warn(msg);
    captureMessage(
      msg,
      "warning",
      { cursor, candidateCount: candidateTweets.length, pageCount, maxPages: MAX_PAGES },
      { step: "fetchNewLikes.cursorNotFound" },
    );
    tweetsToEnrich = candidateTweets.slice(0, CURSOR_NOT_FOUND_MAX_TWEETS);
  }

  const newTweets: XTweet[] = [];
  for (const tweet of tweetsToEnrich) {
    const user = userMapById.get(tweet.author_id ?? "") ?? { username: "unknown", name: "Unknown" };
    const enriched = await fetchEnrichedTweetIfNeeded(tweet);

    const rawUrls = extractAllUrls(tweet, enriched);
    const externalUrls = rawUrls.filter(
      (u) =>
        !u.includes("x.com/") &&
        !u.includes("twitter.com/") &&
        !u.includes("pic.twitter.com")
    );
    const noteTweetText = extractNoteTweetTextFromPayload(enriched);
    const { title: articleTitle, plainText: articlePlainText } = extractArticleFromPayload(enriched);

    newTweets.push({
      id: tweet.id,
      text: tweet.text,
      noteTweetText,
      articleTitle: articleTitle ?? null,
      articlePlainText: articlePlainText ?? null,
      authorUsername: user.username,
      authorName: user.name,
      url: `https://x.com/${user.username}/status/${tweet.id}`,
      urls: externalUrls,
    });
  }

  return newTweets;
}
