import { SPIDER_API_KEY, SPIDER_SCRAPE_REQUEST } from "./config";

const SPIDER_SCRAPE_URL = "https://api.spider.cloud/scrape";
const FETCH_TIMEOUT_MS = 45_000;
const MAX_TEXT_LENGTH = 10_000;

type SpiderScrapeResponse = Array<{
  content?: string;
  markdown?: string;
  error?: string;
}>;

async function fetchWithSpider(url: string): Promise<string | null> {
  if (!SPIDER_API_KEY) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(SPIDER_SCRAPE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SPIDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        return_format: "markdown",
        request: SPIDER_SCRAPE_REQUEST,
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = (await res.json()) as SpiderScrapeResponse;
    const item = data?.[0];
    const text = item?.markdown ?? item?.content ?? "";
    return text.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithFallback(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const html = await res.text();
    // Strip HTML tags and collapse whitespace
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function shouldSkip(url: string): boolean {
  return (
    url.includes("pic.twitter.com") ||
    url.includes("x.com/") ||
    url.includes("twitter.com/")
  );
}

export async function fetchUrlContent(url: string): Promise<string | null> {
  if (shouldSkip(url)) return null;

  const text = (await fetchWithSpider(url)) ?? (await fetchWithFallback(url));
  if (!text) return null;

  return text.slice(0, MAX_TEXT_LENGTH);
}

export async function fetchUrlsContent(urls: string[]): Promise<string | null> {
  if (urls.length === 0) return null;

  const results = await Promise.all(urls.map(fetchUrlContent));
  const combined = results.filter(Boolean).join("\n\n---\n\n");
  return combined || null;
}
