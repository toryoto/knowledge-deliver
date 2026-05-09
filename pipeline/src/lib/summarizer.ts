import Anthropic from "@anthropic-ai/sdk";
import { recordAnthropicUsage } from "observability";
import { ANTHROPIC_API_KEY } from "./config";
import type { XTweet } from "./x-client";

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `あなたは、社内のSlack用に「その投稿単体を読めば、元のXや記事を開かなくても内容と文脈が追える」要約を書く。

一次情報の優先度：要約用の本文に \`article\`（X Article、タイトル・plain_text 等）があれば最優先。次に note_tweet 系の長文。次にWebリンク先。短いツイート本文は「誰が何を紹介しているか」の導入に使い、本論のかわりにしない。

厳守する方針：
- 短い3行要約にしない。全体で十分な文量（目安：合計 400〜900 字程度の日本語）にし、論旨と背景が通るようにする。Articleや長文のときは、必要ならこの目安を上回ってよい。
- Slackだけを見た人のため、## で章立てし、各章に説明的な文を書く（見出しだけの空箱にしない）。

推奨する出力の型（## の見出し文言は状況に合わせてよい。順序は保つ）：

## 何の話か
扱うテーマ、問題意識、想定される読者。ここを読めば文脈が掴める 2〜4 文。

## 主な論点・主張
中心となる主張・結論、議論の山場。2〜5 文。「何を言いたいか」が分かること。

## 補足：具体点
重要な事実、比較、手順、示された数字・固有名（必要な範囲）を、箇条書きで 5〜10 行まで。羅列ではなく、理解に効く点だけ。Articleが英語中心なら、日本語要約内で用語の軽い補足を入れてよい。

## この一言で掴む
あとでスレを追いかけやすい、会話向けの一行サマリ（1文）。

一次情報が薄い章は短くてよいが、「何の話か」と「主な論点」は手を抜かない。要約用本文がほぼ空のときは、上記のうち最後の章を短くし、短いツイート本文の説明を厚めにする。

書式：Slack向け。太字用の *（アスタリスク）は使わない。## で見出し。改行を多用。箇条書きは ・ か - で統一。`;

const SUMMARIZE_MODEL = "claude-haiku-4-5";

export const summarize = async (tweet: XTweet, webContent: string | null): Promise<string> => {
  const userContent = webContent
    ? `ツイート:\n${tweet.text}\n\n要約用の本文（Article / リンク先）:\n${webContent}`
    : `ツイート:\n${tweet.text}`;

  const response = await client.messages.create({
    model: SUMMARIZE_MODEL,
    max_tokens: 3072,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const usage = response.usage;
  recordAnthropicUsage({
    model: SUMMARIZE_MODEL,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: (usage as unknown as Record<string, unknown>).cache_creation_input_tokens as number | undefined,
    cacheReadInputTokens: (usage as unknown as Record<string, unknown>).cache_read_input_tokens as number | undefined,
    label: `tweet:${tweet.id}`,
  });

  const block = response.content[0];
  if (block.type !== "text") return "";
  return block.text.trim();
};
