import Redis from "ioredis";
import { REDIS_URL, SESSION_TTL_SECONDS } from "./config";
import { logger } from "./logger";

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
});

redis.on("error", (err) => {
  logger.error("redis: client error", err, { message: err.message });
});

redis.on("connect", () => {
  logger.info("redis: connected");
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
  await redis.setex(`session:${source}:${sessionKey}`, SESSION_TTL_SECONDS, sessionId);
}
