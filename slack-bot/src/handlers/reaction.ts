import type { App } from "@slack/bolt";
import { captureError } from "observability";
import { SLACK_DIGEST_CHANNEL_ID, SAVE_REACTION_EMOJI } from "../config";
import { askAgent } from "../agent-client";

export function registerReactionHandler(app: App): void {
  if (!SLACK_DIGEST_CHANNEL_ID) {
    app.logger.warn("SLACK_DIGEST_CHANNEL_ID is not set — reaction handler disabled");
    return;
  }

  app.event("reaction_added", async ({ event, client, logger }) => {
    logger.info(
      `reaction_added: emoji=${event.reaction}, channel=${event.item.channel}, type=${event.item.type}`
    );

    if (!SAVE_REACTION_EMOJI.includes(event.reaction)) return;
    if (event.item.type !== "message") return;
    if (event.item.channel !== SLACK_DIGEST_CHANNEL_ID) {
      logger.info(
        `channel mismatch: got=${event.item.channel} expected=${SLACK_DIGEST_CHANNEL_ID}`
      );
      return;
    }

    logger.info(`bookmark triggered: ts=${event.item.ts}`);

    try {
      // ts にスレッド子メッセージの ts を渡すと Slack はそのスレッド全体を返す。
      // limit:1 では root メッセージしか取れないため、find で対象メッセージを特定する。
      const result = await client.conversations.replies({
        channel: event.item.channel,
        ts: event.item.ts,
        limit: 200,
      });

      const message = result.messages?.find((m) => m.ts === event.item.ts);
      if (!message) {
        logger.warn(`message not found: ts=${event.item.ts}`);
        return;
      }

      logger.info(`message fetched, sending to agent`);

      const today = new Date().toISOString().slice(0, 10);
      const prompt = [
        `以下のSlackメッセージをMarkdown形式でObsidianのVaultに保存してください。`,
        ``,
        `# 保存先ルール`,
        `- 保存先: VaultのX Postディレクトリ配下の適切なカテゴリフォルダ`,
        `- カテゴリ一覧: AI / Web3 / Business / Career / CS`,
        `- 内容から最も適切なカテゴリを1つ選択し、そのフォルダに保存する`,
        `- フォルダが存在しない場合は作成する`,
        `- ファイル名のフォーマット: ${today}-{title} (titleは内容を表す英単語またはローマ字)`,
        ``,
        `# Slackメッセージ`,
        JSON.stringify(message, null, 2),
      ].join("\n");

      await askAgent(prompt, "import-x-post");
    } catch (err) {
      logger.error("reaction handler failed", err);
      captureError(err, {
        event_type: "reaction_added",
        channel: event.item.channel,
        ts: event.item.ts,
        reaction: event.reaction,
      }, { step: "slack.reaction" });
    }
  });
}
