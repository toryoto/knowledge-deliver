function getRequired(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" && u.hostname.endsWith(".up.railway.app")) {
      u.protocol = "https:";
      return u.toString().replace(/\/+$/, "");
    }
  } catch {
    // invalid URL はそのまま返す（下流の fetch で失敗として扱う）
  }
  return trimmed;
}

// OAuth 1.0a User Context
export const X_API_KEY = getRequired("X_API_KEY");
export const X_API_SECRET = getRequired("X_API_SECRET");
export const X_ACCESS_TOKEN = getRequired("X_ACCESS_TOKEN");
export const X_ACCESS_SECRET = getRequired("X_ACCESS_SECRET");
export const X_USER_ID = getRequired("X_USER_ID");
export const REDIS_URL = getRequired("REDIS_URL");
export const SPIDER_API_KEY = process.env.SPIDER_API_KEY ?? "";
export const SPIDER_SCRAPE_REQUEST = process.env.SPIDER_SCRAPE_REQUEST ?? "smart";
export const ANTHROPIC_API_KEY = getRequired("ANTHROPIC_API_KEY");
export const SLACK_BOT_TOKEN = getRequired("SLACK_BOT_TOKEN");
export const SLACK_DIGEST_CHANNEL_ID = getRequired("SLACK_DIGEST_CHANNEL_ID");
export const AGENT_ENDPOINT_URL = normalizeUrl(
  process.env.AGENT_ENDPOINT_URL ?? "http://localhost:3000"
);
export const AGENT_REQUEST_TIMEOUT_MS = Number(
  process.env.AGENT_REQUEST_TIMEOUT_MS ?? 180_000
);
const DEFAULT_MAX_PAGES = 10;
const parsedMaxPages = Number(process.env.MAX_PAGES ?? DEFAULT_MAX_PAGES);
export const MAX_PAGES = Number.isFinite(parsedMaxPages) && parsedMaxPages > 0
  ? parsedMaxPages
  : DEFAULT_MAX_PAGES;

const DEFAULT_MAX_COLLECT_TWEETS = 20;
const parsedMaxCollect = Number(process.env.MAX_COLLECT_TWEETS ?? DEFAULT_MAX_COLLECT_TWEETS);
export const MAX_COLLECT_TWEETS = Number.isFinite(parsedMaxCollect) && parsedMaxCollect > 0
  ? parsedMaxCollect
  : DEFAULT_MAX_COLLECT_TWEETS;
