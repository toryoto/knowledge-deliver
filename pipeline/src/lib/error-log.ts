/**
 * Bun / Node の console がネストした `error` を省略表示するため、
 * ジョブ失敗・補助 API 失敗の原因を追えるように文字列化する。
 */
export function formatPipelineError(err: unknown): string {
  if (err === undefined || err === null) return String(err);
  if (typeof err === "string") return err;
  if (typeof err !== "object") return String(err);

  const e = err as Error & {
    status?: number;
    cause?: unknown;
    error?: unknown;
    request_id?: string;
  };
  const parts: string[] = [];

  if (typeof e.message === "string" && e.message.length > 0) {
    parts.push(e.message);
  }

  if (typeof e.status === "number") parts.push(`status=${e.status}`);
  if (e.request_id) parts.push(`request_id=${e.request_id}`);
  if (e.error !== undefined) {
    try {
      parts.push(`error=${JSON.stringify(e.error)}`);
    } catch {
      parts.push(`error=${String(e.error)}`);
    }
  }
  if (e.cause !== undefined) {
    parts.push(`cause=${formatPipelineError(e.cause)}`);
  }

  if (parts.length === 0) {
    try {
      return JSON.stringify(err);
    } catch {
      return Object.prototype.toString.call(err);
    }
  }
  return parts.join(" | ");
}
