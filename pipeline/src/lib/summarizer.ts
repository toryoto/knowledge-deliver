import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY } from "./config";
import type { XTweet } from "./x-client";

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `リンク先のWebページ、またはユーザーに渡された「X Article 本文 (API note_tweet)」の内容を中心に、日本語で要約してください。X Article 本文がある場合はそちらを最優先の要約材料にし、ツイート短い本文は導入・フック扱いに留める。ツイートは「なぜこのURL／記事が紹介されているか」の文脈に留め、本文のボリュームはリンク先または Article 本文を詳しく扱うこと。

【ツイートの文脈】1文で引用・紹介の意図や話題のフックに触れる（短く。要約の主体ではない）
【リンク先の内容】（Article 本文・Web のいずれか／両方）事実・論点・手順・数値・結論を中心に、各項目を箇条書き5〜8項目で具体的に。ツイート本文の反復に頼らず、閲覧者が原文をあまり読まなくても分かる粒度でまとめる

要約用本文（Article もリンクも）がない、または空に近い場合は【リンク先の内容】相当は書かず、【ツイートの文脈】で本文の要点を1〜5文にまとめ、【背景・意義】を付けてよい。

重要：まとめはSlackに投稿するので、アスタリスクの大文字などは使用せず、改行と##による章立てを有効利用して可読性を高めること`;

export async function summarize(tweet: XTweet, webContent: string | null): Promise<string> {
  const userContent = webContent
    ? `ツイート:\n${tweet.text}\n\n要約用の本文（Article / リンク先）:\n${webContent}`
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
