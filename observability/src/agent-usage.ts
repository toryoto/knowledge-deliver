import { addBreadcrumb, captureMessage } from "./capture";

export type AgentUsageData = {
  source: string;
  sessionKey: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  totalCostUsd?: number;
  modelUsage?: Record<string, unknown>;
};

/**
 * Claude Agent SDK の usage/cost 情報を Sentry breadcrumb + info-level event に記録する。
 */
export const recordAgentUsage = (data: AgentUsageData): void => {
  const breadcrumbData: Record<string, unknown> = {
    source: data.source,
    sessionKey: data.sessionKey,
    durationMs: data.durationMs,
  };

  if (data.inputTokens !== undefined) breadcrumbData.inputTokens = data.inputTokens;
  if (data.outputTokens !== undefined) breadcrumbData.outputTokens = data.outputTokens;
  if (data.cacheCreationInputTokens !== undefined)
    breadcrumbData.cacheCreationInputTokens = data.cacheCreationInputTokens;
  if (data.cacheReadInputTokens !== undefined)
    breadcrumbData.cacheReadInputTokens = data.cacheReadInputTokens;
  if (data.totalCostUsd !== undefined) breadcrumbData.totalCostUsd = data.totalCostUsd;

  addBreadcrumb({
    category: "agent.usage",
    message: `Agent run: ${data.source}/${data.sessionKey}`,
    level: "info",
    data: breadcrumbData,
  });

  captureMessage(
    "agent.usage",
    "info",
    {
      ...breadcrumbData,
      ...(data.modelUsage ? { modelUsage: data.modelUsage } : {}),
    },
    {
      step: "agent.run",
      source: data.source,
    },
  );
};
