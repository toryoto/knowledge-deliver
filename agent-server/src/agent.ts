import { query } from "@anthropic-ai/claude-agent-sdk";
import { VAULT_PATH } from "../lib/config";
import { logger } from "../lib/logger";
import { SYSTEM_PROMPT_APPEND } from "../lib/prompt";
import { commitAndPush } from "./vault";

const ALLOWED_TOOLS: string[] = [
  "Read",
  "Edit",
  "Write",
  "Grep",
  "Glob",
  "LS",
  "Skill",
];

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
      append: SYSTEM_PROMPT_APPEND,
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
