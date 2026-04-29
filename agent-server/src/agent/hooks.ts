import { logger } from "../../lib/logger";
import { commitAndPush } from "../vault";

/**
 * Write が許可された Vault ルート外へ向かう場合に deny する PreToolUse フック。
 * `options.cwd` に渡すパスと同じ値を `allowedRoot` に渡すこと。
 */
export function createWriteToolPathGuard(allowedRoot: string) {
  return async function preToolUseWritePathGuard(input: unknown) {
    const toolInput = (input as { tool_input?: { file_path?: string } }).tool_input;
    const filePath = toolInput?.file_path;
    if (filePath && !filePath.startsWith(allowedRoot)) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse" as const,
          permissionDecision: "deny" as const,
          permissionDecisionReason: `Write outside the configured vault path is not allowed: ${filePath}`,
        },
      };
    }
    return {};
  };
}

/**
 * セッション終了時に Vault をコミット・プッシュする。
 */
export function createAutoCommitOnStopHook() {
  return async function autoCommitOnStop() {
    logger.info("hook: Stop → commit/push start");
    try {
      await commitAndPush("auto: agent update");
      logger.info("hook: Stop → commit/push finished");
    } catch (err) {
      logger.error("hook: Stop → commit/push failed", err);
    }
    return {};
  };
}
