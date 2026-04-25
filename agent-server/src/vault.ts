import { simpleGit } from "simple-git";
import { existsSync } from "fs";
import { join } from "path";
import { logger } from "./logger";

const VAULT_PATH = process.env.VAULT_PATH!;
const VAULT_REPO_URL = process.env.VAULT_REPO_URL;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

let isSyncing = false;

function authedUrl(url: string): string {
  if (!GITHUB_TOKEN || url.includes("@")) return url;
  const token = encodeURIComponent(GITHUB_TOKEN);
  return url.replace("https://", `https://x-access-token:${token}@`);
}

export async function initVault(): Promise<void> {
  if (!VAULT_PATH) return;

  const isGitRepo = existsSync(join(VAULT_PATH, ".git"));
  if (isGitRepo) return;

  if (!VAULT_REPO_URL) return;

  logger.info("vault: clone start", { from: "remote", to: VAULT_PATH });
  const git = simpleGit();
  await git.clone(authedUrl(VAULT_REPO_URL), VAULT_PATH);
  logger.info("vault: clone done", { to: VAULT_PATH });
}

export async function pullVault(): Promise<void> {
  if (!VAULT_PATH || isSyncing) return;

  isSyncing = true;
  try {
    const git = simpleGit(VAULT_PATH);
    await git.pull();
    logger.info("vault: pull done", { path: VAULT_PATH });
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

  await git.add("-A");
  await git.commit(message);
  logger.info("vault: commit", { files: status.files.length, path: VAULT_PATH });

  if (VAULT_REPO_URL) {
    const remote = await git.getRemotes(true);
    if (remote.length > 0) {
      const remoteUrl = remote[0].refs.push;
      await git.removeRemote("origin");
      await git.addRemote("origin", authedUrl(remoteUrl));
      await git.push("origin", "HEAD");
    }
  }
}
