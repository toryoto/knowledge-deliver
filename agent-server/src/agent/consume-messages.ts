import { logger } from "../../lib/logger";

export type AgentStreamUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  totalCostUsd?: number;
  modelUsage?: Record<string, unknown>;
};

export type ConsumeResult = {
  sessionId: string;
  result: string;
  usage: AgentStreamUsage;
};

/**
 * result message から usage / cost フィールドを安全に取り出す。
 * SDK バージョンによって存在しない場合があるため optional で返す。
 */
const extractUsageFromResult = (message: Record<string, unknown>): AgentStreamUsage => {
  const out: AgentStreamUsage = {};

  const cost = message.total_cost_usd;
  if (typeof cost === "number") out.totalCostUsd = cost;

  const usage = message.usage;
  if (usage && typeof usage === "object") {
    const u = usage as Record<string, unknown>;
    if (typeof u.input_tokens === "number") out.inputTokens = u.input_tokens;
    if (typeof u.output_tokens === "number") out.outputTokens = u.output_tokens;
    if (typeof u.cache_creation_input_tokens === "number")
      out.cacheCreationInputTokens = u.cache_creation_input_tokens;
    if (typeof u.cache_read_input_tokens === "number")
      out.cacheReadInputTokens = u.cache_read_input_tokens;
  }

  const modelUsage = message.modelUsage ?? message.model_usage;
  if (modelUsage && typeof modelUsage === "object") {
    out.modelUsage = modelUsage as Record<string, unknown>;
  }

  return out;
};

/**
 * claude-agent-sdk のストリームを走査し、session_id と最終 result を取り出す。
 * エラーサブタイプの result メッセージは例外に変換する。
 */
export const consumeClaudeAgentStream = async (
  stream: AsyncIterable<unknown>,
): Promise<ConsumeResult> => {
  let sessionId: string | undefined;
  let result: string | undefined;
  let usage: AgentStreamUsage = {};

  for await (const msg of stream) {
    const message = msg as Record<string, unknown>;

    if (message.type === "system" && message.subtype === "init") {
      sessionId = message.session_id as string;
      logger.debug("agent: session init", { sessionId: `${sessionId.slice(0, 8)}…` });
    }

    if (message.type === "assistant") {
      const content = (message.message as Record<string, unknown>)?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b.type === "tool_use") {
            const input = b.input as Record<string, unknown> | undefined;
            logger.info("agent: tool_use", {
              tool: b.name as string,
              ...(typeof input?.file_path === "string" ? { file: input.file_path } : {}),
            });
          }
        }
      }
    }

    if (message.type === "result" && message.subtype === "success") {
      result = (message.result as string) ?? "";
      usage = extractUsageFromResult(message);
      logger.debug("agent: result success", { chars: result.length });
    }

    if (
      message.type === "result" &&
      typeof message.subtype === "string" &&
      message.subtype.startsWith("error")
    ) {
      const errors = (message.errors as string[]) ?? [];
      const errorMsg = `Agent error (${message.subtype}): ${errors.join(", ")}`;
      logger.error("agent: result error", new Error(errorMsg));
      throw new Error(errorMsg);
    }
  }

  if (!sessionId) {
    throw new Error("No session_id received from agent");
  }
  if (result === undefined) {
    throw new Error("No result received from agent");
  }

  return { sessionId, result, usage };
};
