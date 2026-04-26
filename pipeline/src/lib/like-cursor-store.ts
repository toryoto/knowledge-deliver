import Redis from "ioredis";
import { REDIS_URL } from "./config";

const CURSOR_KEY = "x-likes-digest:last-tweet-id";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL);
  }
  return redis;
}

export async function getCursor(): Promise<string | null> {
  return getRedis().get(CURSOR_KEY);
}

export async function setCursor(tweetId: string): Promise<void> {
  await getRedis().set(CURSOR_KEY, tweetId);
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
