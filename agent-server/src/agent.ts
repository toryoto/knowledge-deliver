import { query } from "@anthropic-ai/claude-agent-sdk";
import { commitAndPush } from "./vault";
import { logger } from "./logger";

const VAULT_PATH = process.env.VAULT_PATH!;

const ALLOWED_TOOLS = ["Read", "Edit", "Write", "Grep", "Glob", "LS", "Skill"];

const VAULT_SYSTEM_APPEND = `
- 検索の対象は Obsidian Vault 内の Markdown（.md）ノートである。汎用ソースコード用リポジトリと決めつけない。
- 単純 Grep だけに頼らない。必要なら関連ノートを Read で全文読む。
- Claude Code セッション用の内部 Todo ツール候補と、Vault ノート上の人間向け TODO を混同しない。ユーザーが求めているのは通常後者である。
- CLAUDE.md や Vault 内の Skills にディレクトリ固有のルールがあれば最優先に従う。`;

export async function runAgent(params: {
  message: string;
  sessionId: string | undefined;
  vaultPath: string;
}): Promise<{ result: string; sessionId: string }> {
  const { message, sessionId, vaultPath } = params;

  let capturedSessionId: string | undefined;
  let capturedResult: string | undefined;

  const options: Record<string, unknown> = {
    cwd: vaultPath,
    settingSources: ["project"],
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: VAULT_SYSTEM_APPEND,
    },
    allowedTools: ALLOWED_TOOLS,
    permissionMode: "acceptEdits",
    hooks: {
      PreToolUse: [
        {
          matcher: "Write",
          hooks: [
            async (input: unknown) => {
              const toolInput = (input as { tool_input?: { file_path?: string } })
                .tool_input;
              const filePath = toolInput?.file_path;
              if (filePath && !filePath.startsWith(VAULT_PATH)) {
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: `Write outside VAULT_PATH is not allowed: ${filePath}`,
                  },
                };
              }
              return {};
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            async () => {
              await commitAndPush("auto: agent update");
              return {};
            },
          ],
        },
      ],
    },
  };

  if (sessionId) {
    options.resume = sessionId;
  }

  const runStarted = performance.now();
  logger.info("claude: query start", { resume: sessionId ? 1 : 0 });

  const stream = query({ prompt: message, options: options as never });

  for await (const msg of stream) {
    const message = msg as Record<string, unknown>;

    if (message.type === "system" && message.subtype === "init") {
      capturedSessionId = message.session_id as string;
    }

    if (message.type === "result" && message.subtype === "success") {
      capturedResult = (message.result as string) ?? "";
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

  if (!capturedSessionId) {
    throw new Error("No session_id received from agent");
  }
  if (capturedResult === undefined) {
    throw new Error("No result received from agent");
  }

  const ms = Math.round(performance.now() - runStarted);
  logger.info("claude: query done", {
    sessionId: `${capturedSessionId.slice(0, 8)}…`,
    durationMs: ms,
  });

  return { result: capturedResult, sessionId: capturedSessionId };
}
