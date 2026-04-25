import type { App } from "@slack/bolt";
import { askAgent } from "../agent-client";

function toSessionKey(channelId: string, threadTs?: string): string {
  return threadTs ? `${channelId}:${threadTs}` : channelId;
}

export function registerCommandHandlers(app: App): void {
  app.command("/note", async ({ command, ack, respond, logger }) => {
    await ack();
    const content = command.text.trim();
    if (!content) {
      await respond("使い方: `/note 追記したい内容`");
      return;
    }

    const prompt = `今日のデイリーノートに以下を追記してください: ${content}`;
    const sessionKey = toSessionKey(command.channel_id, command.thread_ts);

    try {
      const text = await askAgent(prompt, sessionKey);
      await respond({ response_type: "ephemeral", text });
    } catch (error) {
      logger.error("/note failed", error);
      await respond("エージェント呼び出しに失敗しました。時間をおいて再試行してください。");
    }
  });

  app.command("/daily", async ({ command, ack, respond, logger }) => {
    await ack();
    const sessionKey = toSessionKey(command.channel_id, command.thread_ts);

    try {
      const text = await askAgent("今日のデイリーノートを表示してください", sessionKey);
      await respond({ response_type: "ephemeral", text });
    } catch (error) {
      logger.error("/daily failed", error);
      await respond("エージェント呼び出しに失敗しました。時間をおいて再試行してください。");
    }
  });

  app.command("/search", async ({ command, ack, respond, logger }) => {
    await ack();
    const query = command.text.trim();
    if (!query) {
      await respond("使い方: `/search 検索キーワード`");
      return;
    }

    const prompt = `以下のキーワードでノートを検索してください: ${query}`;
    const sessionKey = toSessionKey(command.channel_id, command.thread_ts);

    try {
      const text = await askAgent(prompt, sessionKey);
      await respond({ response_type: "ephemeral", text });
    } catch (error) {
      logger.error("/search failed", error);
      await respond("エージェント呼び出しに失敗しました。時間をおいて再試行してください。");
    }
  });
}
