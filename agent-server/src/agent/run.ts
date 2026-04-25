import { query } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "../../lib/logger";
import { buildAgentQueryOptions } from "./build-query-options";
import { consumeClaudeAgentStream } from "./consume-messages";

export async function runAgent(params: {
  message: string;
  sessionId: string | undefined;
  vaultPath: string;
}): Promise<{ result: string; sessionId: string }> {
  const { message, sessionId, vaultPath } = params;

  const options = buildAgentQueryOptions({ vaultPath, sessionId });
  const runStarted = performance.now();
  logger.info("claude: query start", { resume: sessionId ? 1 : 0 });

  const stream = query({ prompt: message, options: options as never });
  const { sessionId: nextSessionId, result } = await consumeClaudeAgentStream(stream);

  const ms = Math.round(performance.now() - runStarted);
  logger.info("claude: query done", {
    sessionId: `${nextSessionId.slice(0, 8)}…`,
    durationMs: ms,
  });

  return { result, sessionId: nextSessionId };
}
