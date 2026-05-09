import { addBreadcrumb, captureError } from "./capture";

export type ExternalApiFailureData = {
  provider: string;
  endpoint: string;
  httpStatus?: number;
  requestId?: string;
  /** レスポンスの先頭数百文字。秘密値を含まないようにする。 */
  snippet?: string;
};

/**
 * 外部 API 呼び出し失敗を Sentry に記録する。
 * 致命的でない場合は breadcrumb のみ、致命的な場合は captureError も呼ぶ。
 */
export const recordExternalApiFailure = (
  error: unknown,
  data: ExternalApiFailureData,
  opts: { fatal?: boolean } = {},
): void => {
  const breadcrumbData: Record<string, unknown> = {
    provider: data.provider,
    endpoint: data.endpoint,
  };
  if (data.httpStatus !== undefined) breadcrumbData.httpStatus = data.httpStatus;
  if (data.requestId) breadcrumbData.requestId = data.requestId;
  if (data.snippet) breadcrumbData.snippet = data.snippet.slice(0, 500);

  addBreadcrumb({
    category: "external_api.failure",
    message: `${data.provider} ${data.endpoint} failed${data.httpStatus ? ` (${data.httpStatus})` : ""}`,
    level: opts.fatal ? "error" : "warning",
    data: breadcrumbData,
  });

  if (opts.fatal) {
    captureError(error, breadcrumbData, {
      step: `${data.provider}.${data.endpoint}`,
      provider: data.provider,
    });
  }
};
