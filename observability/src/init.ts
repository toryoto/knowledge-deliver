import * as Sentry from "@sentry/node";

let initialized = false;

export type InitOptions = {
  service: string;
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: number;
};

/**
 * Sentry を初期化する。冪等: 2 回以上呼んでも安全。
 * DSN が未設定（環境変数 SENTRY_DSN も空）なら Sentry を初期化せず no-op モードになる。
 */
export const initObservability = (opts: InitOptions): void => {
  if (initialized) return;

  const dsn = opts.dsn ?? process.env.SENTRY_DSN ?? "";
  if (!dsn) {
    initialized = true;
    return;
  }

  Sentry.init({
    dsn,
    environment: opts.environment ?? process.env.SENTRY_ENVIRONMENT ?? "development",
    release: opts.release ?? process.env.SENTRY_RELEASE ?? undefined,
    tracesSampleRate: opts.tracesSampleRate ?? Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    initialScope: {
      tags: {
        service: opts.service,
        runtime: "bun",
      },
    },
  });

  initialized = true;
};

export const isInitialized = (): boolean => initialized;

/**
 * Sentry のバッファを flush する。短命プロセス（pipeline の cron job 等）で
 * exit 前にイベントを確実に送信するために呼ぶ。
 */
export const flushObservability = async (timeoutMs = 5000): Promise<void> => {
  await Sentry.flush(timeoutMs);
};
