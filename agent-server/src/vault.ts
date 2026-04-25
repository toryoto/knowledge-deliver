import { simpleGit } from "simple-git";
import { existsSync } from "fs";
import { join } from "path";

const VAULT_PATH = process.env.VAULT_PATH!;
const VAULT_REPO_URL = process.env.VAULT_REPO_URL;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

let isSyncing = false;

function authedUrl(url: string): string {
  if (!GITHUB_TOKEN || url.includes("@")) return url;
  return url.replace("https://", `https://${GITHUB_TOKEN}@`);
}

export async function initVault(): Promise<void> {
  if (!VAULT_PATH) return;

  const isGitRepo = existsSync(join(VAULT_PATH, ".git"));
  if (isGitRepo) return;

  if (!VAULT_REPO_URL) return;

  console.log(`Cloning vault from ${VAULT_REPO_URL} into ${VAULT_PATH}`);
  const git = simpleGit();
  await git.clone(authedUrl(VAULT_REPO_URL), VAULT_PATH);
  console.log("Vault cloned successfully");
}

export async function pullVault(): Promise<void> {
  if (!VAULT_PATH || isSyncing) return;

  isSyncing = true;
  try {
    const git = simpleGit(VAULT_PATH);
    await git.pull();
    console.log("Vault pulled successfully");
  } finally {
    isSyncing = false;
  }
}

export async function commitAndPush(message: string): Promise<void> {
  if (!VAULT_PATH) return;

  const git = simpleGit(VAULT_PATH);
  const status = await git.status();
  if (status.files.length === 0) return;

  await git.add("-A");
  await git.commit(message);

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
