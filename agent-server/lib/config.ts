export const VAULT_PATH = process.env.VAULT_PATH!;
export const VAULT_REPO_URL = process.env.VAULT_REPO_URL;
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
export const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
export const GIT_USER_NAME = process.env.GIT_USER_NAME;
export const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL;

export const PORT = Number(process.env.PORT ?? 3000);
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
