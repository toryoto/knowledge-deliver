export type ParsedTweetForVault = {
  authorUsername: string;
  tweetText: string;
  summary?: string;
  xUrl: string;
};

type Block = {
  type: string;
  text?: { type: string; text: string };
  elements?: Array<{ type: string; text?: string; url?: string }>;
};

function extractUrlFromMrkdwn(text: string): string | null {
  // Slack mrkdwn link format: <https://...|label>
  const match = text.match(/<(https?:\/\/[^|>]+)[|>]/);
  return match?.[1] ?? null;
}

function extractUsername(text: string): string | null {
  // Format: *Display Name* (@username)
  const match = text.match(/\(@([a-zA-Z0-9_]+)\)/);
  return match?.[1] ?? null;
}

export function parseTweetFromBlocks(blocks: unknown[] | undefined): ParsedTweetForVault | null {
  if (!Array.isArray(blocks) || blocks.length < 4) return null;

  const b = blocks as Block[];

  // Block 3: context — must contain x-post-v1 marker
  const contextBlock = b[3];
  if (contextBlock?.type !== "context") return null;

  const contextElement = contextBlock.elements?.[0];
  const contextText = contextElement?.text ?? "";
  if (!contextText.includes("x-post-v1")) return null;

  // Extract xUrl from Block 3
  const xUrl =
    contextElement?.url ??
    extractUrlFromMrkdwn(contextText);
  if (!xUrl) return null;

  // Block 0: author
  const authorBlock = b[0];
  if (authorBlock?.type !== "section") return null;
  const authorText = authorBlock.text?.text ?? "";
  const authorUsername = extractUsername(authorText);
  if (!authorUsername) return null;

  // Block 1: tweet text
  const tweetBlock = b[1];
  if (tweetBlock?.type !== "section") return null;
  const tweetText = tweetBlock.text?.text ?? "";

  // Block 2: summary (optional, only present for link tweets)
  let summary: string | undefined;
  const block2 = b[2];
  if (block2?.type === "section" && block2.text?.text) {
    summary = block2.text.text;
  }

  return { authorUsername, tweetText, summary, xUrl };
}
