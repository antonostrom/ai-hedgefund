import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();
import { getServiceSupabase } from "@/lib/supabase/server";

// Allow this to run longer than default - fetching hundreds of tickers takes
// a while even in parallel batches. Requires a Vercel plan that supports
// extended function duration (Pro or above) for the cron invocation.
export const maxDuration = 300;

const CONCURRENCY = 10;      // parallel requests per batch
const BATCH_DELAY_MS = 500;  // pause between batches to stay polite to Yahoo's undocumented rate limits

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchDailyBar(ticker: string) {
  // Pull the last 5 trading days and keep only the most recent - this way a
  // missed day (holiday, a run that failed) self-heals on the next run
  // instead of leaving a permanent gap.
  const result = await yahooFinance.chart(ticker, {
    period1: daysAgo(10),
    interval: "1d",
  });
  return result.quotes.slice(-5); // last few bars
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  const { data: tickers, error: universeError } = await supabase
    .from("universe")
    .select("ticker, currency")
    .eq("active", true);

  if (universeError || !tickers) {
    return NextResponse.json({ error: universeError?.message ?? "No universe data" }, { status: 500 });
  }

  const results = { succeeded: 0, failed: 0, failedTickers: [] as string[] };
  const batches = chunk(tickers, CONCURRENCY);

  for (const batch of batches) {
    await Promise.all(
      batch.map(async ({ ticker, currency }) => {
        try {
          const bars = await fetchDailyBar(ticker);
          const rows = bars
            .filter((b) => b.close != null)
            .map((b) => ({
              ticker,
              date: b.date.toISOString().slice(0, 10),
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
              adj_close: b.adjclose ?? b.close,
              volume: b.volume,
              currency: currency ?? null,
            }));

          if (rows.length === 0) throw new Error("No data returned");

          const { error } = await supabase
            .from("price_history")
            .upsert(rows, { onConflict: "ticker,date" });

          if (error) throw error;
          results.succeeded++;
        } catch (err) {
          results.failed++;
          results.failedTickers.push(ticker);
          console.error(`FAILED: ${ticker}:`, err instanceof Error ? err.message : err);
        }
      })
    );
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  return NextResponse.json(results);
}
