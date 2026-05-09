# knowledge-driver

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

## Sentry（Observability）

エラー監視と Agent/Anthropic のトークン使用量計測に Sentry を使います。shared package `observability/` に Sentry ラッパーを集約し、各パッケージの entrypoint で `initObservability({ service })` を呼ぶだけで接続します。

### セットアップ

1. [Sentry](https://sentry.io/) で Node.js プロジェクトを作成し、DSN を取得する
2. 各パッケージの `.env` に `SENTRY_DSN` を設定する（`.env.example` 参照）
3. 必要に応じて `SENTRY_ENVIRONMENT`（production / staging 等）を設定する

### Slack 通知

Sentry の **Slack Integration** を使い、Sentry 側の **Alert Rule** で Slack チャンネルに通知します。アプリコードから直接 Slack に通知を送る構成ではありません。

推奨 Alert Rule 例:

| 条件 | 値 |
|------|-----|
| Environment | `production` |
| Level | `error` 以上 |
| Action | Slack の運用チャンネルに通知 |

Sentry 画面では tags（`service`, `step`, `source`, `provider` 等）と context（`agent_request`, `current_tweet`, `details` 等）で検索・ドリルダウンできます。

### 送信されるデータ

- **エラー**: 全パッケージの未処理例外、Agent 実行失敗、Cron ジョブ失敗、Slack handler 失敗。失敗箇所（step）、source、sessionKey、HTTP status 等をタグ/context に含みます。
- **Agent 使用量** (`agent.usage`): `input_tokens`, `output_tokens`, `cache_*_tokens`, `total_cost_usd`, `modelUsage`, `durationMs`。Claude Agent SDK の result message から取得します。
- **Anthropic 要約使用量** (`anthropic.usage`): `input_tokens`, `output_tokens`, `cache_*_tokens`。pipeline の記事要約で使用する `claude-haiku-4-5` の呼び出しごとに記録します。
- プロンプト全文やメッセージ本文は PII/機密の可能性があるため送信しません。

---

## Docker

`docker compose` で `agent-server`・`redis`・`slack-bot`・`pipeline` をまとめて起動する定義あり（`docker-compose.yml`）。

### ビルドコンテキスト

Bun workspace の `observability` を参照するため、**Docker の build context はリポジトリルート（`.`）**です。`docker-compose.yml` では各サービスとも `context: .` と `dockerfile: <pkg>/Dockerfile` を指定しています。

### Railway

サービスごとに **Root Directory をリポジトリのルート**にし、**Dockerfile Path** に例えば次を指定してください。

| サービス | Dockerfile Path |
|----------|-----------------|
| agent-server | `agent-server/Dockerfile` |
| slack-bot | `slack-bot/Dockerfile` |
| pipeline | `pipeline/Dockerfile` |

Root Directory を `agent-server` などサブフォルダだけにすると、`workspace:*` の `observability` が解決できず `bun install` が失敗します。

ルートに `.dockerignore` があり、`node_modules` などをビルドコンテキストから除外します。
