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
    }

    if (message.type === "result" && message.subtype === "success") {
      result = (message.result as string) ?? "";
    }

    if (
      message.type === "result" &&
      typeof message.subtype === "string" &&
      message.subtype.startsWith("error")
    ) {
      const errors = (message.errors as string[]) ?? [];
      throw new Error(`Agent error (${message.subtype}): ${errors.join(", ")}`);
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
