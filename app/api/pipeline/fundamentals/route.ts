import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getServiceSupabase } from "@/lib/supabase/server";

const yahooFinance = new YahooFinance();

export const maxDuration = 300;

const CONCURRENCY = 8;       // quoteSummary is a heavier call than chart(), so a bit lower than the prices route
const BATCH_DELAY_MS = 700;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  const { data: tickers, error: universeError } = await supabase
    .from("universe")
    .select("ticker")
    .eq("active", true);

  if (universeError || !tickers) {
    return NextResponse.json({ error: universeError?.message ?? "No universe data" }, { status: 500 });
  }

  const results = { succeeded: 0, failed: 0, failedTickers: [] as string[] };
  const batches = chunk(tickers, CONCURRENCY);

  for (const batch of batches) {
    await Promise.all(
      batch.map(async ({ ticker }) => {
        try {
          const summary = await yahooFinance.quoteSummary(ticker, {
            modules: ["summaryDetail", "defaultKeyStatistics", "financialData"],
          });

          const sd = summary.summaryDetail;
          const ks = summary.defaultKeyStatistics;
          const fd = summary.financialData;

          const marketCap = sd?.marketCap ?? null;
          const freeCashFlow = fd?.freeCashflow ?? null;
          const fcfYield =
            marketCap && freeCashFlow ? freeCashFlow / marketCap : null;

          const row = {
            ticker,
            market_cap: marketCap,
            trailing_pe: sd?.trailingPE ?? null,
            forward_pe: sd?.forwardPE ?? null,
            peg_ratio: ks?.pegRatio ?? null,
            price_to_book: ks?.priceToBook ?? null,
            ev_to_ebitda: ks?.enterpriseToEbitda ?? null,
            price_to_sales: sd?.priceToSalesTrailing12Months ?? null,
            return_on_equity: fd?.returnOnEquity ?? null,
            return_on_assets: fd?.returnOnAssets ?? null,
            profit_margin: fd?.profitMargins ?? null,
            operating_margin: fd?.operatingMargins ?? null,
            revenue_growth: fd?.revenueGrowth ?? null,
            earnings_growth: fd?.earningsGrowth ?? null,
            debt_to_equity: fd?.debtToEquity ?? null,
            free_cash_flow: freeCashFlow,
            fcf_yield: fcfYield,
            dividend_yield: sd?.dividendYield ?? null,
            beta: ks?.beta ?? null,
          };

          const hasAnyData = Object.values(row).some(
            (v, i) => i > 0 && v !== null
          );
          if (!hasAnyData) throw new Error("No fundamentals data returned");

          const { error } = await supabase
            .from("fundamentals")
            .upsert(row, { onConflict: "ticker" });

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