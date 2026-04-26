# knowledge-driver

Bun ワークスペース（`agent-server` / `slack-bot` / `pipeline`）の開発用メモです。

## 前提

- [Bun](https://bun.sh/) 1.x
- ローカル Redis が必要な場合: `bun run docker:redis`（リポジトリルート）または自前の `redis://…`

## リポジトリルート

| 作業 | コマンド |
|------|----------|
| 依存のインストール | `bun install` |
| agent-server の開発起動 | `bun run dev` |
| slack-bot の開発起動 | `bun run dev:slack` |
| Docker Compose 全体起動 | `bun run docker:up` |
| Redis だけ起動 | `bun run docker:redis` |

特定パッケージだけ操作する例:

```bash
bun --filter agent-server run dev
bun --filter slack-bot run start
bun --filter pipeline run dev
```

---

## agent-server

HTTP API（Hono）と Claude Agent SDK。Redis・Vault 用 Git 等を想定。

### 環境

1. `cp agent-server/.env.example agent-server/.env`
2. 必須に近い変数: `ANTHROPIC_API_KEY`, `VAULT_REPO_URL`, `GITHUB_TOKEN` など（中身は `.env.example` 参照）

### Bun コマンド

| 目的 | コマンド（`agent-server` ディレクトリ、または `--filter agent-server`） |
|------|--------------------------------------------------------------------------|
| 開発（ウォッチ） | `bun run dev` |
| 本番相当の起動 | `bun run start` |
| バンドル | `bun run build`（`dist/` に出力） |
| 型チェック | `bunx tsc --noEmit` |

---

## slack-bot

Slack Bolt ボット。`AGENT_ENDPOINT_URL` で agent-server に接続。

### 環境

1. `cp slack-bot/.env.example slack-bot/.env`
2. `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `AGENT_ENDPOINT_URL` 等を設定

### Bun コマンド

| 目的 | コマンド |
|------|----------|
| 開発（ウォッチ） | `bun run dev` |
| 本番相当の起動 | `bun run start` |
| バンドル | `bun run build`（`dist/` に出力） |
| 型チェック | `bunx tsc --noEmit` |

---

## pipeline

X / Slack 連携などのジョブ。Redis・外部 API キーを想定。`package.json` に `build` スクリプトはない（`bun` でソース直実行 / Dockerfile も同様）。

### 環境

1. `cp pipeline/.env.example pipeline/.env`
2. `X_BEARER_TOKEN`, `ANTHROPIC_API_KEY`, `SLACK_*`, `REDIS_URL`, `SPIDER_API_KEY` 等を設定
3. agent-server 利用時は `AGENT_ENDPOINT_URL` を合わせる

### Bun コマンド

| 目的 | コマンド |
|------|----------|
| 開発（ウォッチ） | `bun run dev` |
| 起動 | `bun run start` |
| 型チェック | `bunx tsc --noEmit` |
| 単一ファイルへのバンドル（任意） | `bun build src/index.ts --target bun --outdir dist` |

---

## 型チェックについて

各パッケージは `tsconfig.json` があるため、**ルートで `bun install` 済み**のうえで、そのパッケージ配下で `bunx tsc --noEmit` を実行します。初回は `bunx` が TypeScript コンパイラを解決します。

---

## Docker

`docker compose` で `agent-server`・`redis`・`slack-bot`・`pipeline` をまとめて起動する定義あり（`docker-compose.yml`）。各サービス用の `Dockerfile` は各パッケージディレクトリ内です。
