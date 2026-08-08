import type { Headline } from "./fetch-headlines";

/**
 * Summarizes a batch of headlines into a handful of short, market-relevant
 * bullet points using Claude Haiku - cheap and fast, which is all this
 * task needs (it's synthesis of short text, not deep analysis).
 *
 * Returns an array of plain-text bullet strings, or a single explanatory
 * string if something goes wrong - the email template handles either case.
 */
export async function summarizeHeadlines(
  headlines: Headline[],
  apiKey: string
): Promise<string[]> {
  if (headlines.length === 0) {
    return ["No headlines retrieved today - check the RSS feed sources."];
  }

  const headlineList = headlines
    .slice(0, 40) // cap total input size - more than this doesn't add much signal
    .map((h) => `- [${h.source}] ${h.title}`)
    .join("\n");

  const prompt = `You are writing a concise pre-market briefing for a professional investor based in Stockholm. Based on these overnight headlines, write 3-5 short bullet points covering the most market-relevant themes: macro data releases, central bank news, major corporate news, and geopolitical events that could move markets. Skip anything not relevant to investors (celebrity news, sports, etc).

Rules:
- One bullet per line, no markdown formatting (no dashes, asterisks, or numbers - just plain sentences)
- Maximum 15 words per bullet
- Be factual and neutral, no speculation
- If nothing genuinely market-moving happened, say so in one line rather than padding with minor items

Headlines:
${headlineList}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return ["Could not generate a news summary today (API error)."];
    }

    const data = await res.json();
    const text = (data.content ?? [])
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("\n")
      .trim();

    if (!text) return ["No summary generated."];

    return text
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);
  } catch {
    return ["Could not generate a news summary today (request failed)."];
  }
}