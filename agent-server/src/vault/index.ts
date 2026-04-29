import { simpleGit } from "simple-git";
import { existsSync } from "fs";
import { join } from "path";
import { GITHUB_TOKEN, GIT_USER_EMAIL, GIT_USER_NAME, VAULT_PATH, VAULT_REPO_URL } from "../../lib/config";
import { logger } from "../../lib/logger";

let isSyncing = false;

export function isVaultReady(): boolean {
  if (!VAULT_PATH) return false;
  return existsSync(join(VAULT_PATH, ".git"));
}

export async function initVault(): Promise<void> {
  if (!VAULT_PATH) return;

  if (isVaultReady()) return;

  if (!VAULT_REPO_URL) return;

  const cloneFrom = authedUrl(VAULT_REPO_URL);
  logger.info("vault: clone start", { from: "remote", to: VAULT_PATH });
  const git = simpleGit();
  try {
    await git.clone(cloneFrom, VAULT_PATH);
    logger.info("vault: clone done", { to: VAULT_PATH });
  } catch (e) {
    logger.error("vault: clone failed (403: token/repo/SSO 等を確認)", e);
    throw e;
  }
}

export async function pullVault(): Promise<void> {
  if (!VAULT_PATH || isSyncing) return;

  isSyncing = true;
  try {
    const git = simpleGit(VAULT_PATH);
    await git.pull();
    logger.info("vault: pull done", { path: VAULT_PATH });
  } catch (err) {
    logger.error("vault: pull failed", err);
    throw err;
  } finally {
    isSyncing = false;
  }
}

export async function commitAndPush(message: string): Promise<void> {
  if (!VAULT_PATH) return;

  const git = simpleGit(VAULT_PATH);
  const status = await git.status();
  if (status.files.length === 0) {
    logger.debug("vault: no changes to commit", { path: VAULT_PATH });
    return;
  }

  if (!GIT_USER_NAME || !GIT_USER_EMAIL) {
    throw new Error("GIT_USER_NAME and GIT_USER_EMAIL must be set");
  }
  await git.addConfig("user.email", GIT_USER_EMAIL);
  await git.addConfig("user.name", GIT_USER_NAME);

  await git.add("-A");
  await git.commit(message);
  logger.info("vault: commit", { files: status.files.length, path: VAULT_PATH });

  if (VAULT_REPO_URL) {
    const remote = await git.getRemotes(true);
    if (remote.length > 0) {
      const remoteUrl = remote[0].refs.push;
      await git.removeRemote("origin");
      await git.addRemote("origin", authedUrl(remoteUrl));
      try {
        await git.push("origin", "HEAD");
        logger.info("vault: push done", { path: VAULT_PATH });
      } catch (err) {
        logger.error("vault: push failed", err);
        throw err;
      }
    } else {
      logger.warn("vault: no remote configured, skipping push");
    }
  }
}

/**
 * Fine-grained / Classic とも x-access-token 形式。
 */
function authedUrl(url: string): string {
  if (!GITHUB_TOKEN) return url;
  try {
    const u = new URL(url);
    u.username = "x-access-token";
    u.password = GITHUB_TOKEN;
    return u.href;
  } catch {
    return url;
  }
}
