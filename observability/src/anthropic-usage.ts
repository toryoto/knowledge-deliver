import { addBreadcrumb, captureMessage } from "./capture";

export type AnthropicUsageData = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  /** 呼び出し元が特定できる label（例: tweet id） */
  label?: string;
};

/**
 * Anthropic messages.create の usage 情報を Sentry breadcrumb + info-level event に記録する。
 */
export const recordAnthropicUsage = (data: AnthropicUsageData): void => {
  const breadcrumbData: Record<string, unknown> = {
    model: data.model,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
  };

  if (data.cacheCreationInputTokens !== undefined)
    breadcrumbData.cacheCreationInputTokens = data.cacheCreationInputTokens;
  if (data.cacheReadInputTokens !== undefined)
    breadcrumbData.cacheReadInputTokens = data.cacheReadInputTokens;
  if (data.label) breadcrumbData.label = data.label;

  addBreadcrumb({
    category: "anthropic.usage",
    message: `Anthropic ${data.model}: ${data.inputTokens}in/${data.outputTokens}out`,
    level: "info",
    data: breadcrumbData,
  });

  captureMessage(
    "anthropic.usage",
    "info",
    breadcrumbData,
    {
      step: "summarize",
      model: data.model,
    },
  );
};
