# Observability — 設計仕様書

## 1. 概要

本ドキュメントは `knowledge-driver` リポジトリにおける可観測性（Observability）の設計方針と実装仕様を定義する。

### 目的

- 本番環境でのエラーを発生箇所・詳細とともに即座に把握する
- Claude Agent SDK 実行のトークン数・コストを継続的に記録する
- pipeline（Cron ジョブ）の失敗を詳細なコンテキストとともに通知する
- Slack 通知は Sentry の Slack Integration に委任し、アプリコードの責務を最小に保つ

### 設計方針

- `observability` shared package に Sentry の初期化と capture 関連 API を集約する
- 各ランタイム（`agent-server` / `pipeline` / `slack-bot`）は entrypoint で `initObservability({ service })` を 1 行呼ぶだけで接続する
- `SENTRY_DSN` が未設定なら Sentry を初期化せず no-op になる（ローカル開発・テスト環境に影響しない）
- Sentry singleton を直接 export せず、wrapper 関数を通じてのみ呼び出す
- プロンプト全文・Slack メッセージ本文・トークン・シークレット情報は Sentry に送らない

---

## 2. パッケージ構成

```
observability/           ← shared package（Bun workspace）
  src/
    index.ts             ← 公開 API の re-export
    init.ts              ← initObservability, flushObservability
    capture.ts           ← captureError, captureMessage, addBreadcrumb, setContext, withScope
    agent-usage.ts       ← recordAgentUsage
    anthropic-usage.ts   ← recordAnthropicUsage
    external-api.ts      ← recordExternalApiFailure
```

各実行パッケージは `observability` を dependency として宣言し、import して使う。

---

## 3. 環境変数

全ランタイム共通。Railway では Secret Variables として一元管理し、各サービスに同じ変数を渡す。

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `SENTRY_DSN` | 本番のみ | Sentry プロジェクトの DSN。未設定なら Sentry を無効化する。 |
| `SENTRY_ENVIRONMENT` | 推奨 | `production` / `staging` / `development` 等。デフォルト: `development`。 |
| `SENTRY_RELEASE` | 任意 | デプロイのリリース識別子（例: git commit SHA）。sourcemap と紐づけるときに使う。 |
| `SENTRY_TRACES_SAMPLE_RATE` | 任意 | Sentry トレース（Transaction）のサンプリング率 0〜1。デフォルト: `0`（無効）。 |

> **各パッケージの `.env.example` に記述するのはドキュメント目的**。環境変数の実体は Railway の Secret Variables（または `.env`）で管理し、パッケージごとに重複定義する必要はない。

---

## 4. Public API 仕様

### 4-1. `initObservability(opts)`

```ts
type InitOptions = {
  service: string;          // 必須。Sentry の tag "service" に使う（例: "pipeline"）
  dsn?: string;             // 明示指定する場合。省略時は SENTRY_DSN 環境変数を使う
  environment?: string;     // 省略時は SENTRY_ENVIRONMENT または "development"
  release?: string;         // 省略時は SENTRY_RELEASE
  tracesSampleRate?: number;
};

initObservability(opts: InitOptions): void
```

- 冪等。2 回以上呼んでも 2 回目以降は何もしない。
- DSN が空なら Sentry.init を呼ばず、以降の capture 系は no-op になる。
- 各ランタイムの **entrypoint 最初の行**で呼ぶ。

### 4-2. `flushObservability(timeoutMs?)`

```ts
flushObservability(timeoutMs?: number): Promise<void>
```

- Sentry の送信バッファを flush する。デフォルト 5000ms。
- 短命プロセス（pipeline の Cron ジョブ）では `process.exit` の直前に必ず呼ぶ。

### 4-3. `captureError(error, context?, tags?)`

```ts
captureError(
  error: unknown,
  context?: Record<string, unknown>,  // Sentry context "details" に載る
  tags?: Record<string, string>,      // Sentry tags に載る（検索に使える）
): void
```

tags の `step` キーに失敗箇所を入れる運用にする。

| step 値 | 意味 |
|---------|------|
| `job.run` | pipeline ジョブ全体の失敗 |
| `agent.run` | Claude Agent SDK 実行失敗 |
| `http.unhandled` | agent-server の未処理例外 |
| `slack.mention` | app_mention handler 失敗 |
| `slack.dm` | DM handler 失敗 |
| `slack.command` | スラッシュコマンド handler 失敗 |
| `slack.reaction` | reaction handler 失敗 |
| `x.fetch_likes` | X API いいね取得失敗 |
| `summarize` | Anthropic 要約 API 失敗 |
| `slack.post` | Slack への投稿失敗 |
| `vault.git` | Vault git 操作失敗 |
| `redis.session` | Redis セッション操作失敗 |

### 4-4. `captureMessage(message, level?, context?, tags?)`

```ts
captureMessage(
  message: string,
  level?: "fatal" | "error" | "warning" | "info" | "debug",
  context?: Record<string, unknown>,
  tags?: Record<string, string>,
): void
```

エラー以外の重要なイベント（usage 記録等）を Sentry event として送る。

### 4-5. `addBreadcrumb(breadcrumb)`

Sentry Breadcrumb を追加する。捕捉するエラー発生直前の操作ログとして使う。

### 4-6. `setContext(name, context)`

Sentry の scope context を設定する。同一スコープ内のその後のエラーに context が付く。

```ts
// 例: ループ処理中の現在の tweet を scope に載せておく
setContext("current_tweet", { id: tweet.id, url: tweet.url, authorUsername: tweet.authorUsername });
```

### 4-7. `recordAgentUsage(data)`

Claude Agent SDK の 1 回の実行結果を Sentry breadcrumb + info message に記録する。

```ts
type AgentUsageData = {
  source: string;
  sessionKey: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  totalCostUsd?: number;
  modelUsage?: Record<string, unknown>;
};
```

- `totalCostUsd` は Claude Agent SDK の result message の `total_cost_usd` から取得する（SDK バージョンにより存在しない場合は undefined）。
- `modelUsage` は SDK の `modelUsage` / `model_usage` フィールドから取得し、モデル別の詳細を保持する。

### 4-8. `recordAnthropicUsage(data)`

Anthropic `messages.create` の 1 回の呼び出し結果を記録する。

```ts
type AnthropicUsageData = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  label?: string;           // 呼び出し元を特定できる識別子（例: "tweet:1234567890"）
};
```

- Anthropic SDK はレスポンスに USD コストを含まないため、現時点ではトークン数のみ記録する。
- `cacheCreationInputTokens` / `cacheReadInputTokens` は型定義外のフィールドのため `unknown` 経由で取得する。

### 4-9. `recordExternalApiFailure(error, data, opts?)`

外部 API（X API、Spider、Slack Web API 等）の呼び出し失敗を記録する。

```ts
type ExternalApiFailureData = {
  provider: string;    // "x", "spider", "slack", "anthropic" 等
  endpoint: string;    // "liked_tweets", "scrape", "postMessage" 等
  httpStatus?: number;
  requestId?: string;
  snippet?: string;    // レスポンス body の先頭 500 文字以内。秘密値を含まないこと。
};

recordExternalApiFailure(
  error: unknown,
  data: ExternalApiFailureData,
  opts?: { fatal?: boolean },  // true にすると breadcrumb + captureError 両方送る
): void
```

---

## 5. 各ランタイムの使用箇所

### 5-1. `agent-server`

| 箇所 | API | 付与する主な情報 |
|------|-----|----------------|
| `src/index.ts` entrypoint | `initObservability({ service: "agent-server" })` | — |
| `src/index.ts` `app.onError` | `captureError` | `path`, `method` |
| `src/http/routes/agent.ts` | `setContext("agent_request", ...)` | `source`, `sessionKey`, `messageChars`, `resume` |
| `src/http/routes/agent.ts` catch | `captureError` | `source`, `sessionKey`, `messageChars` |
| `src/http/routes/agent.ts` success | `recordAgentUsage` | `durationMs`, tokens, `totalCostUsd`, `modelUsage` |
| `src/agent/consume-messages.ts` | usage 抽出（内部実装） | SDK result message から `total_cost_usd`, `usage`, `modelUsage` を取得 |

### 5-2. `pipeline`

| 箇所 | API | 付与する主な情報 |
|------|-----|----------------|
| `src/index.ts` entrypoint | `initObservability({ service: "pipeline" })` | — |
| `src/index.ts` catch | `captureError` | `job: "collect-x-likes"` |
| `src/index.ts` 終了前 | `flushObservability()` | — |
| `src/jobs/collect-x-likes.ts` ループ開始前 | `setContext("job", ...)` | `name`, `tweetCount` |
| `src/jobs/collect-x-likes.ts` ループ内 | `setContext("current_tweet", ...)`, `addBreadcrumb` | `id`, `url`, `authorUsername` |
| `src/lib/summarizer.ts` | `recordAnthropicUsage` | `model`, tokens, `label: "tweet:{id}"` |

### 5-3. `slack-bot`

| 箇所 | API | 付与する主な情報 |
|------|-----|----------------|
| `src/index.ts` entrypoint | `initObservability({ service: "slack-bot" })` | — |
| `handlers/mention.ts` catch | `captureError` | `event_type`, `channel`, `sessionKey` |
| `handlers/dm.ts` catch | `captureError` | `event_type`, `channel`, `sessionKey` |
| `handlers/commands.ts` catch | `captureError` | `command`, `channel`, `sessionKey` |
| `handlers/reaction.ts` catch | `captureError` | `event_type`, `channel`, `ts`, `reaction` |

---

## 6. Sentry Slack 通知設定

### 接続方法

アプリコードから直接 Slack 投稿は行わない。Sentry の Slack Integration + Alert Rule を使う。

1. Sentry プロジェクト > Settings > Integrations > Slack でワークスペースを接続する
2. Alerts > Create Alert Rule で以下を設定する

### 推奨 Alert Rule

| 設定項目 | 値 |
|---------|-----|
| Type | Issue Alert |
| Environment | `production` |
| Condition | `An issue is first seen` または `An issue changes state to Regression` |
| Filter | Level `is` `error` or `fatal` |
| Action | Notify a Slack workspace — 運用チャンネルを指定 |

- `info` レベルの usage 記録（`agent.usage`, `anthropic.usage`）は Alert Rule の Filter 対象外にして通知しない運用を推奨する。
- コスト・トークン情報は Sentry の Issues または Discover 画面で context / breadcrumb を確認する。

### Slack 通知に表示される内容

Sentry が Slack に送る通知には以下が含まれる。詳細は Sentry 画面で確認する。

- エラーメッセージと issue へのリンク
- `service` タグ（`agent-server` / `pipeline` / `slack-bot`）
- `step` タグ（失敗箇所）
- Breadcrumbs（エラー前の操作ログ）
- Context（`agent_request`, `current_tweet`, `details` 等）

---

## 7. プライバシー・セキュリティ方針

| 送らないもの | 理由 |
|------------|------|
| プロンプト・メッセージ全文 | PII・機密情報の可能性 |
| Slack メッセージ本文 | 同上 |
| API キー・トークン | 秘密情報 |
| GitHub 認証情報を含む URL | `agent-server/lib/logger.ts` でも redact 済み |
| Spider / Anthropic レスポンス全文 | 内容が大量かつ機密の可能性。snippet（先頭 500 文字）のみ許容 |

送信してよいもの: エラーメッセージ、HTTP status、request_id、tweet id、tweet URL、文字数、トークン数、所要時間、session key。
