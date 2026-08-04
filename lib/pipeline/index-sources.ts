import * as cheerio from "cheerio";

// Pulls index constituent tickers from Wikipedia's list pages. These tables
// occasionally change structure (column order, added columns) - if a scraper
// starts returning zero or garbage rows, check the page manually and adjust
// the column index below. This is a "run occasionally and eyeball the output"
// script, not something you'd want failing silently inside a nightly cron.

export type ConstituentRow = {
  ticker: string;
  name: string;
  sector?: string;
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (research pipeline; personal use)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

// S&P 500 - Wikipedia "List of S&P 500 companies", first wikitable,
// columns: Symbol, Security, GICS Sector, GICS Sub-Industry, ...
export async function fetchSP500(): Promise<ConstituentRow[]> {
  const html = await fetchHtml("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies");
  const $ = cheerio.load(html);
  const rows: ConstituentRow[] = [];
  $("table.wikitable").first().find("tbody tr").each((_, el) => {
    const cells = $(el).find("td");
    if (cells.length < 3) return;
    const ticker = $(cells[0]).text().trim();
    const name = $(cells[1]).text().trim();
    const sector = $(cells[2]).text().trim();
    if (ticker) rows.push({ ticker: ticker.replace(".", "-"), name, sector });
  });
  return rows;
}

// Nasdaq-100 - Wikipedia "Nasdaq-100", constituents table.
// Column order has shifted before - verify Ticker/Company columns if this returns 0 rows.
export async function fetchNasdaq100(): Promise<ConstituentRow[]> {
  const html = await fetchHtml("https://en.wikipedia.org/wiki/Nasdaq-100");
  const $ = cheerio.load(html);
  const rows: ConstituentRow[] = [];
  $("table.wikitable").each((_, table) => {
    const headerText = $(table).find("th").first().text().trim().toLowerCase();
    if (!headerText.includes("company") && !headerText.includes("ticker")) return;
    $(table).find("tbody tr").each((_, el) => {
      const cells = $(el).find("td");
      if (cells.length < 2) return;
      const name = $(cells[0]).text().trim();
      const ticker = $(cells[1]).text().trim();
      if (ticker && ticker.length <= 6) rows.push({ ticker, name });
    });
  });
  return rows;
}

// STOXX Europe 600 - Wikipedia doesn't maintain a clean full constituent
// table reliably. Recommend maintaining this one as a curated list instead
// of scraping - see NOTE in seed-universe.ts. Stubbed here for structure.
export async function fetchStoxx600(): Promise<ConstituentRow[]> {
  console.warn(
    "fetchStoxx600: no reliable free source for full constituents - " +
      "add tickers manually to lib/pipeline/curated-europe.ts instead"
  );
  return [];
}

// FTSE 100 - Wikipedia "FTSE 100 Index", constituents table.
export async function fetchFTSE100(): Promise<ConstituentRow[]> {
  const html = await fetchHtml("https://en.wikipedia.org/wiki/FTSE_100_Index");
  const $ = cheerio.load(html);
  const rows: ConstituentRow[] = [];
  $("table.wikitable").each((_, table) => {
    const headerText = $(table).find("th").text().toLowerCase();
    if (!headerText.includes("ticker") && !headerText.includes("epic")) return;
    $(table).find("tbody tr").each((_, el) => {
      const cells = $(el).find("td");
      if (cells.length < 2) return;
      const name = $(cells[0]).text().trim();
      const ticker = $(cells[1]).text().trim();
      if (ticker) rows.push({ ticker: `${ticker}.L`, name });
    });
  });
  return rows;
}

// Nikkei 225 - Wikipedia "Nikkei 225" constituents table.
export async function fetchNikkei225(): Promise<ConstituentRow[]> {
  const html = await fetchHtml("https://en.wikipedia.org/wiki/Nikkei_225");
  const $ = cheerio.load(html);
  const rows: ConstituentRow[] = [];
  $("table.wikitable").each((_, table) => {
    const headerText = $(table).find("th").text().toLowerCase();
    if (!headerText.includes("code") && !headerText.includes("ticker")) return;
    $(table).find("tbody tr").each((_, el) => {
      const cells = $(el).find("td");
      if (cells.length < 2) return;
      const code = $(cells[0]).text().trim();
      const name = $(cells[1]).text().trim();
      if (code) rows.push({ ticker: `${code}.T`, name });
    });
  });
  return rows;
}
