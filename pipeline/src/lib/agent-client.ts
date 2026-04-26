import { AGENT_ENDPOINT_URL, AGENT_REQUEST_TIMEOUT_MS } from "./config";

type AgentSuccessResponse = { text: string };
type AgentErrorResponse = { error?: string };

export async function askAgent(message: string, sessionKey: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("Agent request timed out"), AGENT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${AGENT_ENDPOINT_URL}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, source: "pipeline", sessionKey }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as AgentErrorResponse;
      throw new Error(payload.error ?? `Agent request failed (${response.status})`);
    }

    const payload = (await response.json()) as AgentSuccessResponse;
    if (!payload.text) throw new Error("Agent response does not include text");
    return payload.text;
  } finally {
    clearTimeout(timeoutId);
  }
}
