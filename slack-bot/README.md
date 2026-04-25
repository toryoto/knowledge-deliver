# slack-bot

Slack Bolt (Socket Mode) でイベントを受け取り、`agent-server` の `POST /agent` へ転送するクライアントです。

## 1) Slack App 手動セットアップ

1. [Slack API Apps](https://api.slack.com/apps) で新規 App を作成
2. **Socket Mode** を ON にし、App-Level Token (`xapp-...`) を発行
3. **Event Subscriptions** で以下を追加
   - `app_mention`
   - `message.im`
4. **Slash Commands** で以下を追加
   - `/note`
   - `/daily`
   - `/search`
5. **OAuth & Permissions** で Bot Token Scopes を追加
   - `app_mentions:read`
   - `chat:write`
   - `commands`
   - `im:history`
   - `im:read`
6. ワークスペースへインストールし、Bot User OAuth Token (`xoxb-...`) を取得

## 2) 環境変数

`.env.example` を `.env` にコピーして設定します。

- `SLACK_BOT_TOKEN`: Bot User OAuth Token (`xoxb-...`)
- `SLACK_APP_TOKEN`: Socket Mode 用 App-Level Token (`xapp-...`)
- `AGENT_ENDPOINT_URL`: `agent-server` の URL（例: `http://localhost:3000`）
- `AGENT_REQUEST_TIMEOUT_MS` (任意): agent 呼び出しタイムアウト（ミリ秒、既定 90000）

## 3) 開発

```bash
bun install
bun run dev
```

## 4) 動作概要

- `app_mention`: メンション本文を `POST /agent` に送信
- `message.im`: DM 本文を `POST /agent` に送信（Bot 自身の発言は無視）
- `/note`, `/daily`, `/search`: コマンド入力をプロンプトへ変換して送信

セッション継続は Slack の `thread_ts`（なければ `ts`）を `sessionKey` に使います。