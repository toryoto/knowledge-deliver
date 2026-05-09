import * as Sentry from "@sentry/node";

type ErrorContext = Record<string, unknown>;

/**
 * エラーを Sentry に送信する。tags / extra を scope に載せて検索しやすくする。
 */
export const captureError = (
  error: unknown,
  context?: ErrorContext,
  tags?: Record<string, string>,
): void => {
  Sentry.withScope((scope) => {
    if (tags) scope.setTags(tags);
    if (context) scope.setContext("details", context);
    Sentry.captureException(error);
  });
};

export const captureMessage = (
  message: string,
  level: Sentry.SeverityLevel = "info",
  context?: ErrorContext,
  tags?: Record<string, string>,
): void => {
  Sentry.withScope((scope) => {
    if (tags) scope.setTags(tags);
    if (context) scope.setContext("details", context);
    Sentry.captureMessage(message, level);
  });
};

export const addBreadcrumb = (breadcrumb: Sentry.Breadcrumb): void => {
  Sentry.addBreadcrumb(breadcrumb);
};

export const setContext = (name: string, context: Record<string, unknown>): void => {
  Sentry.setContext(name, context);
};

export const withScope = (callback: (scope: Sentry.Scope) => void): void => {
  Sentry.withScope(callback);
};
