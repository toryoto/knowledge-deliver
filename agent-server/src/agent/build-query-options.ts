import { SYSTEM_PROMPT_APPEND } from "../../lib/prompt";
import { createAutoCommitOnStopHook, createWriteToolPathGuard } from "./hooks";

const AGENT_ALLOWED_TOOLS: string[] = [
  "Read",
  "Edit",
  "Write",
  "Grep",
  "Glob",
  "LS",
  "Skill",
];

/**
 * claude_code プリセット向けの `query()` 用オプションを組み立てる（ポリシーとフック含む）。
 */
export function buildAgentQueryOptions(params: {
  vaultPath: string;
  sessionId: string | undefined;
}): Record<string, unknown> {
  const { vaultPath, sessionId } = params;

  const options: Record<string, unknown> = {
    cwd: vaultPath,
    settingSources: ["project"],
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: SYSTEM_PROMPT_APPEND,
    },
    allowedTools: AGENT_ALLOWED_TOOLS,
    permissionMode: "acceptEdits",
    hooks: {
      PreToolUse: [
        {
          matcher: "Write",
          hooks: [createWriteToolPathGuard(vaultPath)],
        },
      ],
      Stop: [
        {
          hooks: [createAutoCommitOnStopHook()],
        },
      ],
    },
  };

  if (sessionId) {
    options.resume = sessionId;
  }

  return options;
}
