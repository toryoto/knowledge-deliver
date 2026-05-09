import { query } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "../../lib/logger";
import { buildAgentQueryOptions } from "./build-query-options";
import { consumeClaudeAgentStream } from "./consume-messages";
import type { AgentStreamUsage } from "./consume-messages";

export type RunAgentResult = {
  result: string;
  sessionId: string;
  usage: AgentStreamUsage;
  durationMs: number;
};

export const runAgent = async (params: {
  message: string;
  sessionId: string | undefined;
  vaultPath: string;
}): Promise<RunAgentResult> => {
  const { message, sessionId, vaultPath } = params;

  const options = buildAgentQueryOptions({ vaultPath, sessionId });
  const runStarted = performance.now();
  logger.info("claude: query start", { resume: sessionId ? 1 : 0 });

  const stream = query({ prompt: message, options });
  const { sessionId: nextSessionId, result, usage } = await consumeClaudeAgentStream(stream);

  const durationMs = Math.round(performance.now() - runStarted);
  logger.info("claude: query done", {
    sessionId: `${nextSessionId.slice(0, 8)}…`,
    durationMs,
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.totalCostUsd !== undefined ? { totalCostUsd: usage.totalCostUsd } : {}),
  });

  return { result, sessionId: nextSessionId, usage, durationMs };
};
