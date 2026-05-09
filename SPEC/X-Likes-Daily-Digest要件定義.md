# X Likes Daily Digest — システム設計仕様書

## 1. 概要

### プロダクト概要

X (Twitter) のいいねをデイリーで自動収集し、リンク先の記事・ページ内容を含めてAIが構造的に要約してSlackに投稿する。
Slackの `:bookmark:` リアクションをトリガーに、対象投稿をObsidian VaultにMDファイルとして保存・git pushする。

### 設計方針

- 既存の `agent-server` / `slack-bot` / `pipeline` 構成に乗る（`pipeline` は今回実装）
- pipelineは実行完了後にコンテナを終了するステートレスなcronジョブとして設計する（**いいね増分のカーソルだけは永続ストアに保存**する）
- Vault保存は既存の `POST /agent` 経由を使い、新スキル `import-x-post` で処理する
- Slackへの投稿はpipelineが直接行う（agent-serverを経由しない）

### いいね取得の前提（API制約）

- **いいね日時（`liked_at`）を返す公式APIは存在しない。**
- ツイートの `created_at` は「投稿日時」であり「いいねした日時」ではないため、**日時フィルタだけでは増分判定に使えない**。
- そのため増分収集の最善策は、**前回ジョブで処理した集合の境界を「ツイートID」で表すカーソルとして保存し、次回はAPIのページネーションを先頭から辿って当該IDに到達するまで新規分だけを蓄積する**設計とする。

### Webページ取得の前提（Spider）

- リンク先の本文取得の主経路として **[Spider](https://spider.cloud/)**（Spider Cloud API）を用いる。
- **認証**: `Authorization: Bearer {SPIDER_API_KEY}`。APIキーは [Spider のダッシュボード](https://spider.cloud/api-keys) で発行する（従量課金・クレジット制。詳細は [Pricing](https://spider.cloud/pricing) / [API 概要](https://spider.cloud/guides/spider-api/)）。
- **単一URL取得**: `POST https://api.spider.cloud/scrape` に JSON で `url` を送り、`return_format`（例: `markdown` … LLM向けにボイラープレート除去、`text` … プレーンテキスト）と `request`（`smart` / `http` / `chrome`）を指定する。`smart` は HTTP と Chrome レンダリングをページに応じて自動選択するデフォルト。
- **フォールバック**: 自前の `fetch` + 簡易HTMLテキスト抽出は Spider 失敗時・コスト最適化用の副経路として残す。
- **SDK**: 公式 [`@spider-cloud/spider-client`](https://github.com/spider-rs/spider-clients/tree/main/javascript) の利用は任意。本パイプラインでは `fetch` で REST 呼び出ししてもよい。

---

## 2. システムアーキテクチャ

### 全体フロー

```
Railway Cron (毎日 9:00 JST)
  └─ pipeline コンテナ起動
       ├─ 永続ストアから「前回処理済みカーソル（ツイートID）」を読込
       ├─ X API: GET /2/users/:id/liked_tweets をページネーションで先頭から走査
       │     └─ カーソルIDに到達するまでのツイートのみを「新規いいね」として収集
       ├─ 各ツイートのリンク先URLをフェッチ（Spider `/scrape` 優先）→ テキスト抽出
       ├─ Anthropic API (claude-haiku-4-5): 構造化要約生成
       ├─ Slack: #ai-x-like-notification にヘッダーメッセージ投稿
       ├─ Slack: 各ツイートをヘッダーへのスレッド返信で投稿
       ├─ ジョブ成功後、カーソル更新（下記「カーソル更新ルール」）
       └─ process.exit(0) でコンテナ終了

User が Slack で :bookmark: リアクション
  └─ slack-bot: reaction_added イベント受信
       ├─ emoji === "bookmark" && channel === #ai-x-like-notification チェック
       ├─ conversations.replies() で対象ツイートメッセージを取得
       ├─ Block Kit からツイートデータをパース
       └─ POST /agent { message, source: "pipeline", sessionKey: "import-x-post" }
            └─ agent-server: import-x-post スキルで実行
                 ├─ Grep: source URLで重複チェック
                 ├─ Write: X Post/YYYY-MM-DD-{title}.md 作成
                 └─ Stop Hook: git commit & push → Obsidian Vault
```

### カーソル（増分境界）の意味

- `liked_tweets` は**いいねした順（新しいいいねが先）**に近い順序で返る想定でページネーションする。
- **カーソル** `last_processed_tweet_id`: 前回ジョブ完了時点で「既にダイジェストに載せた**いいねストリーム上の最新ツイート**」のID。初回は未設定。
- **次回ジョブ**: 先頭ページから順にツイートを見ていき、`tweet.id === last_processed_tweet_id` に**到達したら走査終了**（そのID自体は再処理しない）。到達前に取れたツイートだけが今回の対象。
- **初回（カーソルなし）**: 先頭10件のみ取得して処理し、その先頭のIDをカーソルにする。

### カーソル更新ルール（実装契約）

`liked_tweets` は**新しいいいねが先頭**に来るため、収集結果の配列 `newTweets` も同じ順（インデックス 0 = いいねストリーム上もっとも新しい1件）とみなす。

**「先頭」の意味**: 今回ジョブで「新規として処理対象になったツイート」のうち、**API 上いちばん新しいいいねに対応するツイートID**＝ `newTweets[0].id`（`newTweets.length > 0` のとき）。

**更新してよいタイミング**: Slack へのダイジェスト投稿まで**すべて成功**したあと（失敗時はカーソルを進めない）。

**新規いいねが 0 件のとき**: **カーソルを更新しない**（`store.set` を呼ばない）。前回までの `last_processed_tweet_id` をそのまま残す。こうしないと「更新値が決まらず毎回 `null` に戻す」などの曖昧実装になり、増分境界が壊れる。

```typescript
// ジョブ全体が成功した直後のイメージ
if (newTweets.length > 0) {
  await store.set(newTweets[0].id); // いいねストリームの最新側（今回処理した新規の先頭）
}
// newTweets.length === 0 のときは set しない → 正しい
```

### Slackメッセージ構造（Block Kit）

```
[ヘッダー] *X Likes Digest — 2026-04-26* (N posts)
  └─ [スレッド返信 × N件]
       ├─ [Section] *@authorName* (@authorUsername)
       ├─ [Section] ツイート本文
       ├─ [Section] 構造化要約（リンクがある場合）
       ├─ [Context] <https://x.com/...|View on X>  |  記事リンク...
       └─ [Divider]
```

各ツイートが独立したスレッド返信のため、1件ずつ `:bookmark:` でObsidianへ保存できる。

---

## 3. コンポーネント仕様

### 3-1. pipeline（新規実装）

#### ファイル構成

```
pipeline/
├── package.json
├── tsconfig.json
├── Dockerfile
├── .env.example
└── src/
    ├── index.ts                    # エントリポイント (process.exit(0)で終了)
    ├── jobs/
    │   └── collect-x-likes.ts      # ジョブ全体の制御
    ├── lib/
    │   ├── config.ts               # 環境変数バリデーション
    │   ├── x-client.ts             # X API v2 ラッパー（ページネーション＋カーソル停止）
    │   ├── like-cursor-store.ts    # カーソル読み書き（Redis等）
    │   ├── web-fetcher.ts          # Spider Cloud / フォールバックでURLフェッチ
    │   ├── summarizer.ts           # Anthropic API で構造化要約
    │   ├── slack-client.ts         # Slack Web API（投稿のみ）
    │   └── agent-client.ts         # POST /agent ラッパー (source: "pipeline")
    └── formatters/
        └── slack-message.ts        # Block Kit ペイロード生成（固定構造）
```

#### 依存パッケージ

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.x",
    "@slack/web-api": "^7.x",
    "ioredis": "^5.x"
  }
}
```

`@anthropic-ai/claude-agent-sdk` は使用しない（直接 API 呼び出しで十分）。

#### like-cursor-store.ts

- **責務**: `last_processed_tweet_id`（文字列）の get / set。
- **バックエンド**: 既存インフラの **Redis**（Railway）を利用。キー例: `x-likes-digest:last-tweet-id`。
- **更新タイミング**: §2「カーソル更新ルール」に従う。要約: **新規いいねが1件以上あるジョブが完全成功したときだけ** `newTweets[0].id` を保存する。**新規0件のときは `set` しない**。
- **整合性**: 投稿失敗時はカーソルを進めない（再実行で重複投稿しうるため、カーソル更新は「投稿成功後」のみ）。

#### x-client.ts

- エンドポイント: `GET /2/users/{X_USER_ID}/liked_tweets`
- 認証: `Authorization: Bearer {X_BEARER_TOKEN}`
- リクエストフィールド:
  - `tweet.fields=text,author_id,created_at,entities`
  - `expansions=author_id`
  - `user.fields=username,name`
  - `max_results=100`（API上限に合わせる）
- **ページネーション**: `pagination_token` をループ。`MAX_PAGES` 上限を設け、カーソル未到達で打ち切った場合はログ警告（取りこぼしリスクの明示）。
- **収集ロジック**:
  1. `cursor = await store.get()`（なければ初回モード）
  2. 各ページのツイートを**APIの並び順のまま**走査
  3. `cursor` がある場合、各ツイートについて `id === cursor` なら**そこで走査終了**（当該ツイートは結果に含めない）
  4. それ以外は「新規」として配列に追加
  5. 初回モードでは max_results=10 で1ページのみ取得し、その10件を新規とみなす
- フィルタ: **`created_at` による24時間制限は増分の主判定には使わない**（参考情報・ログ用に残してよい）
- 戻り値の型:

  ```typescript
  type XTweet = {
    id: string;
    text: string;
    authorUsername: string;
    authorName: string;
    url: string;           // https://x.com/{authorUsername}/status/{id}
    urls: string[];        // entities.urls から抽出（x.com/twitter.com は除外）
  };
  ```

#### web-fetcher.ts

- **主経路: Spider Cloud `/scrape`**
  - `POST https://api.spider.cloud/scrape`
  - ヘッダ: `Authorization: Bearer {SPIDER_API_KEY}`, `Content-Type: application/json`
  - ボディ例:
    - `url`: 対象のフルURL（スキーム必須）
    - `return_format`: `"markdown"`（要約・RAG向けに推奨）または `"text"`
    - `request`: `"smart"`（デフォルト）／静的ページ中心なら `"http"` で低コスト化、SPA・保護サイトは `"chrome"` を検討
  - レスポンスから**本文**を取り出す（フィールド名は [API リファレンス](https://spider.cloud/docs/api) に準拠。実装時に `/scrape` のレスポンス型を固定すること）
  - 非200・タイムアウト・本文空はフォールバックへ回すか `null`
- **フォールバック**（Spider失敗時・レート制限等）: 直接 `fetch` し、HTMLから簡易テキスト抽出
- `AbortController` でタイムアウト（Spider・直フェッチ共通。Spider は JS レンダリングがあり得るため **30〜60秒** 程度を検討）
- 抽出テキストは要約向けに上限文字数でトリム（例: 先頭8000〜12000文字）
- 失敗時は `null` 返却（非致命的）
- スキップ対象: `pic.twitter.com`, `x.com/`, `twitter.com/`（ツイート内URLとしての除外方針は既存どおり）
- **設定**: `SPIDER_API_KEY` は必須（本経路を使う場合）。`SPIDER_SCRAPE_REQUEST` 等で `request` モードを環境変数化してもよい。

#### summarizer.ts

- モデル: `claude-haiku-4-5`（高速・低コスト）
- プロンプトキャッシュ: システムプロンプトに `cache_control: { type: "ephemeral" }` 付与（同一ジョブ内で再利用）
- 要約の粒度・形式:
  - ツイート単体の場合: 主張・背景・意義を構造化して出力
  - リンク先記事がある場合: 記事タイトル・要点（箇条書き）・なぜ重要かを含む構造化サマリーを出力
  - 量の目安: 読んで内容が把握できる程度（箇条書き3〜6項目、または段落2〜3つ）
  - 出力は日本語

**要約プロンプト方針**:

```
ツイートとリンク先の内容を以下の構造で日本語で要約してください:

【主旨】1〜2文でツイートの主張・話題を説明
【内容】記事・スレッドの要点を箇条書きで（3〜6項目）
【背景・意義】なぜこれが重要か・文脈を1〜2文で

リンク先がない場合は【内容】を省略し、【主旨】と【背景・意義】のみ出力してください。
```

#### slack-message.ts（Block Kit固定構造）

`parseTweetFromBlocks`（slack-bot）がこの並び・フィールドを前提にするため、**変更する場合は pipeline の本ファイルと slack-bot のパーサを同時に更新**すること。

```
Block 0: [Section] *{authorName}* (@{authorUsername})
Block 1: [Section] {tweetText}（300文字超は切り詰め + "…"）
Block 2: [Section] {summary}（URLがある場合のみ）
Block 3: [Context] <{xUrl}|View on X>  ← ここに x-post-v1 マーカーを含める
Block 4: [Divider]
```

- Section の本文は Block Kit 上 `text: { type: "mrkdwn", text: "..." }` 形式とする。
- Context（Block 3）は `elements: [{ type: "mrkdwn", text: "..." }]` とし、**マーカーと X のリンクを同じ要素の `text` に含めてよい**（例: `"<https://x.com/.../status/...|View on X> x-post-v1"`）。マーカーは HTML コメント風でもプレーンテキストでもよいが、パーサは **`x-post-v1` という連続文字列の有無**で判定する。

---

#### parseTweetFromBlocks（slack-bot）— 抽出ルール

`conversations.replies` 等で得た `blocks` 配列から、1件分のダイジェスト投稿を `tweetData` に変換する。**前提**: 上記の固定インデックス（0〜4）。型は Slack の `KnownBlock[]` 等としてよい。

**対応表（どの Block から何を取るか）**

| 論理名 | Block index | Slack 上の場所 | 取り方 |
|--------|-------------|----------------|--------|
| マーカー（パイプライン生成の識別） | 3 | `blocks[3].elements[0]` | `elements[0].text` に **`x-post-v1`** が**部分文字列として**含まれること。含まなければ `null` を返しスキップ。 |
| `xUrl`（X ステータス URL） | 3 | 同上 | **`elements[0].url` が存在すればその値**。Slack の標準 `mrkdwn` 要素には `url` が無いことが多いので、その場合は **`elements[0].text` 内の Slack リンク記法**（`<` + `https://…` + `|` + ラベル + `>`）から `https://` で始まる URL を正規表現等で抽出する（`slack-message.ts` が出す URL と一致させる）。 |
| `authorUsername` | 0 | `blocks[0].text.text` | **mrkdwn 全文**から `@username` 形式を抽出（例: `\(@([a-zA-Z0-9_]+)\)` で括弧直前のユーザー名。実装では `*表示名* (@handle)` に合わせてよい）。 |
| `tweetText` | 1 | `blocks[1].text.text` | そのまま（プレーンテキスト扱い）。 |
| `summary` | 2 | `blocks[2]` が存在し `type === "section"` なら `blocks[2].text.text` | **リンク付きツイートで要約 Section を出したときだけ Block 2 がある**想定。無い場合は `summary` は `undefined` または空文字。 |

**戻り値の例（概念）**

```typescript
type ParsedTweetForVault = {
  authorUsername: string;
  tweetText: string;
  summary?: string;
  xUrl: string;
};
```

**失敗時**: マーカー不一致・必須 Block 欠落・`xUrl` が取れない場合は `null`（`reaction_added` では何もしない）。

**配置**: `slack-bot/src/handlers/reaction.ts` から呼ぶ、または `slack-bot/src/lib/parse-tweet-blocks.ts` に切り出してよい。

#### collect-x-likes.ts（ジョブ制御）

```typescript
// 順次処理（Slack rate limit 対策、Promise.all は使わない）
for (const tweet of tweets) {
  const webContent = await fetchUrls(tweet.urls);      // 並列OK
  const summary = await summarize(tweet, webContent);
  await postTweetToSlack(tweet, summary, headerTs);
}
```

#### index.ts

```typescript
await runCollectXLikesJob();
process.exit(0);   // Railway Cron でコンテナを確実に終了させる
```

---

### 3-2. slack-bot 追加実装

#### handlers/reaction.ts（新規）

```typescript
export function registerReactionHandler(app: App): void {
  app.event("reaction_added", async ({ event, client }) => {
    if (event.reaction !== SAVE_REACTION_EMOJI) return;
    if (event.item.type !== "message") return;
    if (event.item.channel !== SLACK_DIGEST_CHANNEL_ID) return;

    const result = await client.conversations.replies({
      channel: event.item.channel,
      ts: event.item.ts,
      limit: 1,
      inclusive: true,
    });

    const tweetData = parseTweetFromBlocks(result.messages?.[0]?.blocks);
    if (!tweetData) return;   // x-post-v1 マーカーがない場合はスキップ

    await askAgent(buildObsidianSavePrompt(tweetData), "import-x-post");
  });
}
```

- セッションキー `"import-x-post"` は固定（全保存操作で同一コンテキスト共有、重複チェックに活用）
- `askAgent` の結果は現状は破棄（将来: 確認DM送信も検討可）

#### index.ts 変更

```typescript
import { registerReactionHandler } from "./handlers/reaction";
// ...
registerReactionHandler(app);
```

#### config.ts 追加

```typescript
export const SLACK_DIGEST_CHANNEL_ID = process.env.SLACK_DIGEST_CHANNEL_ID ?? "";
export const SAVE_REACTION_EMOJI = process.env.SAVE_REACTION_EMOJI ?? "bookmark";
```

`SLACK_DIGEST_CHANNEL_ID` が未設定の場合、reaction handler を登録しない（早期リターン）。

---

### 3-3. Vault スキル（Obsidian Vault リポジトリ側）

#### `.claude/skills/import-x-post/SKILL.md`

```markdown
---
name: import-x-post
description: >
  X (Twitter) のいいね投稿をObsidianのノートとして保存する。
  「X投稿を保存」「ツイートを保存」などのキーワードが含まれる場合に使用する。
---

# X投稿の保存

## 保存先
- X Post/{category}/YYYY-MM-DD-{title}.md
- category: 内容から AI / Web3 / Business / Career / CS の中で最も適切なものを1つ選択
- title: ツイート内容を表す英単語またはローマ字（スペースはハイフン・最大50文字・日本語不可）
- YYYY-MM-DD: プロンプトに含まれる保存日を使用する

## フォーマット
---
title: {title}
source: https://x.com/{authorUsername}/status/{id}
date: YYYY-MM-DD
tags: #xpost
---

# {title}

## Tweet
> {ツイート本文}
> — @{authorUsername}

## Summary
{構造化要約（主旨・要点・背景）}

## Links
- [{ページタイトルまたはURL}]({url})

## 操作ルール
- Grep で source URL を確認し、一致するファイルがあれば重複作成しない
- X Post/{category}/ ディレクトリが存在しない場合は作成する
- ファイル名は ASCII のみ（日本語・記号は除去またはハイフン置換）
- タグは #xpost 固定（内容に応じて追加タグ付与可）
```

#### `CLAUDE.md` への追記（手動）

```markdown
- X Post/      : X (Twitter) いいね投稿のメモ（#xpost）
```

---

## 4. 環境変数

### `pipeline/.env.example`

```
# X Developer API (Pay-as-you-go)
X_BEARER_TOKEN=
X_USER_ID=          # 数値のユーザーID (例: 123456789)

# Redis（いいね増分カーソル保存）
REDIS_URL=redis://...

# Spider Cloud（Webスクレイプ・本文抽出）
# https://spider.cloud/api-keys
SPIDER_API_KEY=
# 任意: smart | http | chrome（未設定時は smart 相当でよい）
# SPIDER_SCRAPE_REQUEST=smart

# Anthropic
ANTHROPIC_API_KEY=

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_DIGEST_CHANNEL_ID=    # #ai-x-like-notification のチャンネルID

# Agent Server
AGENT_ENDPOINT_URL=http://localhost:3000
AGENT_REQUEST_TIMEOUT_MS=180000

LOG_LEVEL=info
```

### `slack-bot/.env.example` 追記

```
# X Likes Digest (reaction handler)
SLACK_DIGEST_CHANNEL_ID=    # pipeline と同じ値
SAVE_REACTION_EMOJI=bookmark
```

---

## 5. インフラ構成（Railway）

### サービス構成

| サービス名 | ソース | 実行方式 | 追加設定 |
|-----------|--------|---------|----------|
| pipeline | `pipeline/` | **Cron Schedule** | コンテナ起動→実行→終了、`REDIS_URL`、`SPIDER_API_KEY` |
| slack-bot | `slack-bot/` | 常時起動 | env var追加のみ |
| agent-server | `agent-server/` | 常時起動 | 変更なし |
| Redis | Railway テンプレート | 常時起動 | pipeline から参照 |

### Cron設定

```
Cron Expression: 0 0 * * *   (UTC 0:00 = JST 9:00)
Root Directory: pipeline
```

---

## 6. Slack App 設定変更

| 設定項目 | 変更内容 |
|---------|----------|
| Event Subscriptions | `reaction_added` を追加 |
| OAuth Scopes | `reactions:read` を追加 |
| 投稿先チャンネル | `#ai-x-like-notification` |

---

## 7. ルートファイルの変更

### `package.json`

```json
{
  "workspaces": ["agent-server", "slack-bot", "pipeline"]
}
```

### `docker-compose.yml`

```yaml
pipeline:
  build: ./pipeline
  environment:
    - AGENT_ENDPOINT_URL=http://agent-server:3000
    - REDIS_URL=redis://redis:6379
  env_file:
    - ./pipeline/.env
  depends_on:
    - agent-server
    - redis
```

---

## 8. 変更対象ファイル一覧

### 新規作成

| ファイル | 説明 |
|---------|------|
| `pipeline/package.json` | |
| `pipeline/tsconfig.json` | slack-bot と同構成 |
| `pipeline/Dockerfile` | oven/bun:1-alpine ベース（git不要） |
| `pipeline/.env.example` | |
| `pipeline/src/index.ts` | |
| `pipeline/src/jobs/collect-x-likes.ts` | |
| `pipeline/src/lib/config.ts` | |
| `pipeline/src/lib/x-client.ts` | カーソル停止付きページネーション |
| `pipeline/src/lib/like-cursor-store.ts` | Redis でカーソル永続化 |
| `pipeline/src/lib/web-fetcher.ts` | Spider `/scrape` 主、フォールバック |
| `pipeline/src/lib/summarizer.ts` | |
| `pipeline/src/lib/slack-client.ts` | |
| `pipeline/src/lib/agent-client.ts` | slack-bot のものをコピー (source: "pipeline") |
| `pipeline/src/formatters/slack-message.ts` | |
| `slack-bot/src/handlers/reaction.ts` | |
| `slack-bot/src/lib/parse-tweet-blocks.ts` | 任意。`parseTweetFromBlocks` を切り出す場合 |
| `{vault-repo}/.claude/skills/import-x-post/SKILL.md` | Vault リポジトリ側で作成 |

### 既存ファイル変更

| ファイル | 変更内容 |
|---------|----------|
| `package.json` | workspaces に "pipeline" 追加 |
| `docker-compose.yml` | pipeline サービス追加、`REDIS_URL` |
| `slack-bot/src/index.ts` | registerReactionHandler 呼び出し追加 |
| `slack-bot/src/config.ts` | SLACK_DIGEST_CHANNEL_ID, SAVE_REACTION_EMOJI 追加 |
| `slack-bot/.env.example` | 上記env var追加 |
| `{vault-repo}/CLAUDE.md` | X Post/ ディレクトリ説明を追記 |

---

## 9. 検証方法

1. **X API + カーソル動作確認**
   - `REDIS_URL` をセットし、カーソル未設定状態で1回実行 → 10件が収集され、Redis に newTweets[0].id が保存されること
   - 同じ状態で再実行 → 新規いいねがなければ **0件処理かつ Redis のカーソル値が前回と同一**（`set` していない）であること
   - いいねを1件追加して再実行 → 当該1件だけ増え、成功後カーソルが更新されること

2. **Spider 取得確認**
   - `SPIDER_API_KEY` をセットし、通常の記事URLで `/scrape` 経由の本文が要約に反映されること
   - `return_format`（`markdown` / `text`）と `request` モード別の品質・コスト・レイテンシを把握し、運用値を決めること

3. **ローカルcronテスト**
   - `docker compose up redis agent-server` 起動後
   - `bun pipeline/src/index.ts` を手動実行
   - `#ai-x-like-notification` にヘッダー+スレッドが投稿されることを確認
   - 要約の構造・粒度を目視確認

4. **リアクションテスト**
   - 投稿されたスレッド内ツイートに `:bookmark:` を付ける
   - `agent-server` ログで `import-x-post` スキルが実行されることを確認
   - Vault の `X Post/` にMDファイルが作成されることを確認

5. **Vault push確認**
   - Vault リポジトリで `git log` を確認
   - コミットメッセージ `auto: agent update` が生成されていること

6. **重複チェック確認**
   - 同じツイートに2回 `:bookmark:` を押す
   - 2回目はファイル作成されないことを確認（Grepで重複検出）

---

## 10. 既知の限界・運用メモ

- **新規いいね 0 件とカーソル**: その実行では **`store.set` を呼ばない**。既存の `last_processed_tweet_id` を維持する。誤って `null` で上書きしたり未設定扱いに戻すと、次回に同じいいねを再処理したり境界が壊れる。
- **カーソル未到達で `MAX_PAGES` 打ち切り**: 一度に大量にいいねした場合、API深部まで到達できず取りこぼす可能性がある。`MAX_PAGES`・アラート・手動リセット（Redisキー削除）を運用で用意する。
- **いいねの取り消し・順序の揺れ**: 公式に `liked_at` がないため、稀な並び替えや境界条件では重複・取りこぼしのリスクがある。Slack側の重複表示許容や、ツイートID単位の冪等処理を前提にする。
- **Spider障害時・クレジット切れ**: フォールバック取得に依存。プロキシ／レンダリングの都合で一部ドメインは失敗しうる。品質・取得率・利用クレジットは監視ログと Spider の usage で確認する。
- **Block Kit と `parseTweetFromBlocks`**: pipeline 側の `slack-message.ts` を変えたのにパーサを更新しないと、`xUrl` 抽出失敗やマーカー不一致で `:bookmark:` が無視される。Block 順・mrkdwn 形式は **§3-1「parseTweetFromBlocks — 抽出ルール」の対応表を単一の正とする**。
