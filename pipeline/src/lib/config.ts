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
    // invalid URL — pass through to fetch
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
export const MAX_PAGES = Number(process.env.MAX_PAGES ?? 10);
