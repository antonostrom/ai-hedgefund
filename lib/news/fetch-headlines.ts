import * as cheerio from "cheerio";
import { NEWS_FEEDS } from "./rss-sources";

export type Headline = {
  title: string;
  source: string;
  pubDate: string | null;
  link: string;
};

async function fetchFeed(feed: { url: string; source: string }): Promise<Headline[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "Mozilla/5.0 (personal news aggregator)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    const headlines: Headline[] = [];
    $("item").each((_, el) => {
      const title = $(el).find("title").first().text().trim();
      const link = $(el).find("link").first().text().trim();
      const pubDate = $(el).find("pubDate").first().text().trim() || null;
      if (title) headlines.push({ title, source: feed.source, pubDate, link });
    });

    return headlines.slice(0, 15); // cap per source so one feed can't dominate
  } catch {
    return [];
  }
}

/** Fetches all configured RSS feeds in parallel. A feed that fails or times out just contributes zero headlines - doesn't block the others. */
export async function fetchAllHeadlines(): Promise<Headline[]> {
  const results = await Promise.all(NEWS_FEEDS.map(fetchFeed));
  return results.flat();
}