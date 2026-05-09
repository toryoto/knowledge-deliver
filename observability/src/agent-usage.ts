import { addBreadcrumb } from "./capture";

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
 * Claude Agent SDK の usage/cost 情報を Sentry breadcrumb に記録する。
 * Issue を生成する captureMessage は使わない（usage 計測はエラーではないため）。
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
  if (data.modelUsage !== undefined) breadcrumbData.modelUsage = data.modelUsage;

  addBreadcrumb({
    category: "agent.usage",
    message: `Agent run: ${data.source}/${data.sessionKey}`,
    level: "info",
    data: breadcrumbData,
  });
};
