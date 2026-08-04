// One-time / occasional seed script. Run manually with:
//   npx tsx scripts/seed-universe.ts
//
// This is NOT part of the nightly cron - index membership changes rarely
// (quarterly rebalances at most), so re-run this by hand every few months,
// eyeball the diff, then let the daily price cron take over from there.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { fetchSP500, fetchNasdaq100, fetchFTSE100, fetchNikkei225 } from "../lib/pipeline/index-sources";
import { CURATED_EUROPE } from "../lib/pipeline/curated-europe";
import { CURATED_DIVIDEND_ETFS } from "../lib/pipeline/curated-etfs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type UniverseRow = {
  ticker: string;
  name: string | null;
  asset_type: "stock" | "etf";
  region: string | null;
  country: string | null;
  currency: string | null;
  sector: string | null;
  source: string;
};

async function main() {
  const rows: UniverseRow[] = [];

  console.log("Fetching S&P 500...");
  const sp500 = await fetchSP500();
  console.log(`  ${sp500.length} tickers`);
  for (const r of sp500) {
    rows.push({
      ticker: r.ticker,
      name: r.name,
      asset_type: "stock",
      region: "US",
      country: "United States",
      currency: "USD",
      sector: r.sector ?? null,
      source: "SP500",
    });
  }

  console.log("Fetching Nasdaq-100...");
  const nasdaq100 = await fetchNasdaq100();
  console.log(`  ${nasdaq100.length} tickers`);
  for (const r of nasdaq100) {
    rows.push({
      ticker: r.ticker,
      name: r.name,
      asset_type: "stock",
      region: "US",
      country: "United States",
      currency: "USD",
      sector: null,
      source: "NASDAQ100",
    });
  }

  console.log("Fetching FTSE 100...");
  const ftse100 = await fetchFTSE100();
  console.log(`  ${ftse100.length} tickers`);
  for (const r of ftse100) {
    rows.push({
      ticker: r.ticker,
      name: r.name,
      asset_type: "stock",
      region: "UK",
      country: "United Kingdom",
      currency: "GBP",
      sector: null,
      source: "FTSE100",
    });
  }

  console.log("Fetching Nikkei 225...");
  const nikkei = await fetchNikkei225();
  console.log(`  ${nikkei.length} tickers`);
  for (const r of nikkei) {
    rows.push({
      ticker: r.ticker,
      name: r.name,
      asset_type: "stock",
      region: "Asia",
      country: "Japan",
      currency: "JPY",
      sector: null,
      source: "NIKKEI225",
    });
  }

  console.log(`Adding ${CURATED_EUROPE.length} curated European/Nordic names...`);
  for (const r of CURATED_EUROPE) {
    rows.push({
      ticker: r.ticker,
      name: r.name,
      asset_type: "stock",
      region: r.country === "Sweden" || r.country === "Norway" || r.country === "Denmark" || r.country === "Finland" ? "Nordics" : "Europe",
      country: r.country,
      currency: null, // let the price ingestion step fill this from Yahoo metadata
      sector: r.sector ?? null,
      source: "curated_europe",
    });
  }

  console.log(`Adding ${CURATED_DIVIDEND_ETFS.length} curated dividend ETFs...`);
  for (const r of CURATED_DIVIDEND_ETFS) {
    rows.push({
      ticker: r.ticker,
      name: r.name,
      asset_type: "etf",
      region: r.region,
      country: null,
      currency: r.currency,
      sector: null,
      source: "curated_etf",
    });
  }

  // Dedupe by ticker (a name might appear in both S&P500 and Nasdaq100)
  const deduped = new Map<string, UniverseRow>();
  for (const row of rows) {
    if (!deduped.has(row.ticker)) deduped.set(row.ticker, row);
  }
  const finalRows = Array.from(deduped.values());

  console.log(`\nUpserting ${finalRows.length} unique tickers into Supabase...`);

  // Batch upserts, 500 rows at a time
  const batchSize = 500;
  for (let i = 0; i < finalRows.length; i += batchSize) {
    const batch = finalRows.slice(i, i + batchSize);
    const { error } = await supabase.from("universe").upsert(batch, { onConflict: "ticker" });
    if (error) {
      console.error(`Batch ${i / batchSize} failed:`, error.message);
    } else {
      console.log(`  Batch ${i / batchSize + 1} (${batch.length} rows) upserted`);
    }
  }

  console.log("\nDone. Check the universe table in Supabase to sanity-check the results.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
