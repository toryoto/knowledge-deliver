function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/** Bun の fetch が http の Railway 公開 URL で 404 になることがあるため、ホストが *.up.railway.app なら https に寄せる */
function normalizeAgentEndpointUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" && u.hostname.endsWith(".up.railway.app")) {
      u.protocol = "https:";
      return u.toString().replace(/\/+$/, "");
    }
  } catch {
    // 不正 URL はそのまま（fetch 側で失敗）
  }
  return trimmed;
}

export const SLACK_BOT_TOKEN = getRequiredEnv("SLACK_BOT_TOKEN");
export const SLACK_APP_TOKEN = getRequiredEnv("SLACK_APP_TOKEN");
export const AGENT_ENDPOINT_URL = normalizeAgentEndpointUrl(getRequiredEnv("AGENT_ENDPOINT_URL"));
export const AGENT_REQUEST_TIMEOUT_MS = Number(process.env.AGENT_REQUEST_TIMEOUT_MS ?? 90_000);
export const SLACK_DIGEST_CHANNEL_ID = process.env.SLACK_DIGEST_CHANNEL_ID ?? "";
export const SAVE_REACTION_EMOJI = process.env.SAVE_REACTION_EMOJI ?? "bookmark";
