import { logger } from "../../lib/logger";

/**
 * claude-agent-sdk のストリームを走査し、session_id と最終 result を取り出す。
 * エラーサブタイプの result メッセージは例外に変換する。
 */
export async function consumeClaudeAgentStream(
  stream: AsyncIterable<unknown>
): Promise<{ sessionId: string; result: string }> {
  let sessionId: string | undefined;
  let result: string | undefined;

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

  return { sessionId, result };
}
