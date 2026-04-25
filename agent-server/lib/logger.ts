type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * サーバープロセス内で共有するロガー。`console` の直接利用よりこちらを使う。
 */
export class Logger {
  private static singleton: Logger | undefined;

  static getInstance(): Logger {
    if (!Logger.singleton) {
      Logger.singleton = new Logger();
    }
    return Logger.singleton;
  }

  debug(msg: string, meta?: Record<string, string | number | boolean | undefined>): void {
    this.line("debug", msg, meta);
  }

  info(msg: string, meta?: Record<string, string | number | boolean | undefined>): void {
    this.line("info", msg, meta);
  }

  warn(msg: string, meta?: Record<string, string | number | boolean | undefined>): void {
    this.line("warn", msg, meta);
  }

  error(
    msg: string,
    err?: unknown,
    meta?: Record<string, string | number | boolean | undefined>
  ): void {
    if (!this.enabled("error")) return;
    const ts = new Date().toISOString();
    const base = `[${ts}] [ERROR] ${redactCredentials(msg)}`;
    const rest =
      meta && Object.keys(meta).length > 0
        ? " | " +
          Object.entries(meta)
            .map(([k, v]) => {
              if (v === undefined) return `${k}=`;
              if (typeof v === "string") return `${k}=${redactCredentials(v)}`;
              return `${k}=${v}`;
            })
            .join(" ")
        : "";
    if (err !== undefined) {
      if (err instanceof Error) {
        const safe =
          redactCredentials(err.message) +
          (err.stack ? `\n${redactCredentials(err.stack)}` : "");
        console.error(`${base}${rest}`, safe);
      } else {
        console.error(`${base}${rest}`, redactCredentials(String(err)));
      }
    } else {
      console.error(`${base}${rest}`);
    }
  }

  private constructor(private readonly min: Level = Logger.parseMinLevel()) {}

  private static parseMinLevel(): Level {
    const raw = process.env.LOG_LEVEL;
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error")
      return raw;
    return "info";
  }

  private enabled(level: Level): boolean {
    return ORDER[level] >= ORDER[this.min];
  }

  private line(
    level: Level,
    msg: string,
    meta?: Record<string, string | number | boolean | undefined>
  ): void {
    if (!this.enabled(level)) return;
    const ts = new Date().toISOString();
    const base = `[${ts}] [${level.toUpperCase()}] ${msg}`;
    if (meta && Object.keys(meta).length > 0) {
      const flat = Object.entries(meta)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      console.log(`${base} | ${flat}`);
    } else {
      console.log(base);
    }
  }
}

export const logger = Logger.getInstance();

/** git / GitHub 認証情報が混ざった文字列用（ログ汚染防止） */
function redactCredentials(text: string): string {
  if (!text) return text;
  return text
    .replace(/x-access-token:[^@]+@/gi, "x-access-token:***@")
    .replace(/https:\/\/github_pat_[^@\s"']+@/gi, "https://github_pat_***@")
    .replace(/https:\/\/ghp_[a-zA-Z0-9]+@/g, "https://ghp_***@");
}
