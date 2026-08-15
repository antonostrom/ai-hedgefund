// One-time backfill script - run manually, not part of any cron.
//   npx tsx scripts/backfill-price-history.ts
//
// Pulls ~2 years of daily price history per ticker instead of the 5-day
// window the daily cron uses. This is what actually unlocks SMA50/200,
// MACD, momentum, volatility, and correlation - all of which need deep
// history that the daily pipeline would otherwise take months to build up
// on its own.
//
// Safe to re-run: every row is upserted on (ticker, date), so running this
// again just re-confirms existing rows and fills any new gaps - it won't
// duplicate anything.

import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const YEARS_BACK = 2;
const CONCURRENCY = 6; // gentler than the daily cron's 10, since each request pulls far more data
const BATCH_DELAY_MS = 800;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log(`Fetching active universe tickers...`);
  const { data: tickers, error } = await supabase
    .from("universe")
    .select("ticker, currency")
    .eq("active", true);

  if (error || !tickers) {
    console.error("Failed to fetch universe:", error?.message);
    process.exit(1);
  }
  console.log(`  ${tickers.length} tickers to backfill\n`);

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - YEARS_BACK);

  const results = { succeeded: 0, failed: 0, failedTickers: [] as string[], totalRows: 0 };
  const batches = chunk(tickers, CONCURRENCY);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    await Promise.all(
      batch.map(async ({ ticker, currency }) => {
        try {
          const result = await yahooFinance.chart(ticker, { period1, interval: "1d" });
          const rows = result.quotes
            .filter((q) => q.close !== null)
            .map((q) => ({
              ticker,
              date: q.date.toISOString().slice(0, 10),
              open: q.open,
              high: q.high,
              low: q.low,
              close: q.close,
              adj_close: q.adjclose ?? q.close,
              volume: q.volume,
              currency: currency ?? null,
            }));

          if (rows.length === 0) throw new Error("No data returned");

          // Upsert in sub-batches of 500 (per-ticker history can exceed that for 2 years of daily bars)
          for (let i = 0; i < rows.length; i += 500) {
            const slice = rows.slice(i, i + 500);
            const { error: upsertError } = await supabase
              .from("price_history")
              .upsert(slice, { onConflict: "ticker,date" });
            if (upsertError) throw upsertError;
          }

          results.succeeded++;
          results.totalRows += rows.length;
        } catch (err) {
          results.failed++;
          results.failedTickers.push(ticker);
          console.error(`FAILED: ${ticker}:`, err instanceof Error ? err.message : err);
        }
      })
    );

    const done = (b + 1) * CONCURRENCY;
    console.log(
      `Batch ${b + 1}/${batches.length} done (~${Math.min(done, tickers.length)}/${tickers.length} tickers, ${results.totalRows} rows so far)`
    );
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log(`\nDone.`);
  console.log(`  Succeeded: ${results.succeeded}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Total rows upserted: ${results.totalRows}`);
  if (results.failedTickers.length > 0) {
    console.log(`  Failed tickers: ${results.failedTickers.join(", ")}`);
  }
  console.log(
    `\nNext step: manually trigger /api/pipeline/technicals once so SMA/RSI/MACD recompute against the new deep history immediately, rather than waiting for tomorrow's cron.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});