import Redis from "ioredis";

const TTL_SECONDS = 7 * 24 * 60 * 60;

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  enableOfflineQueue: false,
});

redis.on("error", (err) => {
  console.error("Redis error:", err.message);
});

export async function getSessionId(
  source: string,
  sessionKey: string
): Promise<string | null> {
  return redis.get(`session:${source}:${sessionKey}`);
}

export async function saveSessionId(
  source: string,
  sessionKey: string,
  sessionId: string
): Promise<void> {
  await redis.setex(`session:${source}:${sessionKey}`, TTL_SECONDS, sessionId);
}
