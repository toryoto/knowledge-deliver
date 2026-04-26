import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY } from "./config";
import type { XTweet } from "./x-client";

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `ツイートとリンク先の内容を以下の構造で日本語で要約してください:

【主旨】1〜2文でツイートの主張・話題を説明
【内容】記事・スレッドの要点を箇条書きで（3〜6項目）
【背景・意義】なぜこれが重要か・文脈を1〜2文で

リンク先がない場合は【内容】を省略し、【主旨】と【背景・意義】のみ出力してください。`;

export async function summarize(tweet: XTweet, webContent: string | null): Promise<string> {
  const userContent = webContent
    ? `ツイート:\n${tweet.text}\n\nリンク先の内容:\n${webContent}`
    : `ツイート:\n${tweet.text}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content[0];
  if (block.type !== "text") return "";
  return block.text.trim();
}
