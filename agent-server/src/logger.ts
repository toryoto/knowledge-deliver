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

  private constructor(
    private readonly min: Level = Logger.parseMinLevel()
  ) {}

  private static parseMinLevel(): Level {
    const raw = process.env.LOG_LEVEL;
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error")
      return raw;
    return "info";
  }

  static getInstance(): Logger {
    if (!Logger.singleton) {
      Logger.singleton = new Logger();
    }
    return Logger.singleton;
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
    const base = `[${ts}] [ERROR] ${msg}`;
    const rest =
      meta && Object.keys(meta).length > 0
        ? " | " + Object.entries(meta)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")
        : "";
    if (err !== undefined) {
      console.error(`${base}${rest}`, err);
    } else {
      console.error(`${base}${rest}`);
    }
  }
}

export const logger = Logger.getInstance();
