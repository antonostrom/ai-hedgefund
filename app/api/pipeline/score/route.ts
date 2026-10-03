import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { zScoreMap, averageSkipNull } from "@/lib/pipeline/stats";

export const maxDuration = 300;

type PriceRange = {
  ticker: string;
  first_close: number;
  first_date: string;
  last_close: number;
  last_date: string;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  // Only score individual stocks - ETFs don't have meaningful P/E, ROE,
  // etc. and need a different (yield/expense-ratio based) approach later.
  const { data: universeRows, error: universeError } = await supabase
    .from("universe")
    .select("ticker")
    .eq("active", true)
    .eq("asset_type", "stock");

  if (universeError || !universeRows) {
    return NextResponse.json({ error: universeError?.message ?? "No universe data" }, { status: 500 });
  }
  const tickers = universeRows.map((r) => r.ticker);

  const { data: fundamentalsRows, error: fundamentalsError } = await supabase
    .from("fundamentals")
    .select("*")
    .in("ticker", tickers);

  if (fundamentalsError) {
    return NextResponse.json({ error: fundamentalsError.message }, { status: 500 });
  }
  const fundamentalsByTicker = new Map(
    (fundamentalsRows ?? []).map((r) => [r.ticker as string, r])
  );

  // --- Momentum: total return over whatever price history is available ---
  // Computed via a Postgres function (get_price_range) rather than pulling
  // price_history's full ~330,000+ rows over the network and reducing them
  // in JS - that approach worked fine when the table was small, but after
  // the 2-year backfill it made this route slow enough to risk the 5-minute
  // function timeout. The database already has what it needs locally; this
  // just asks for the two numbers per ticker that actually matter.
  const { data: priceRanges, error: priceRangeError } = await supabase.rpc(
    "get_price_range",
    { ticker_list: tickers }
  );
  if (priceRangeError) {
    return NextResponse.json({ error: priceRangeError.message }, { status: 500 });
  }
  const priceRangeByTicker = new Map(
    ((priceRanges ?? []) as PriceRange[]).map((r) => [r.ticker, r])
  );

  const momentumRaw: Record<string, number | null> = {};
  for (const ticker of tickers) {
    const range = priceRangeByTicker.get(ticker);
    // Require at least 2 distinct trading days to compute a return at all.
    // NOTE: with the pipeline freshly deployed, this window will be short
    // (a few days) until price_history has accumulated more history -
    // momentum scores will sharpen up over the following weeks as more
    // daily runs land. This isn't a bug, just an early-data limitation.
    if (!range || range.first_date === range.last_date || range.first_close === 0) {
      momentumRaw[ticker] = null;
      continue;
    }
    momentumRaw[ticker] = (range.last_close - range.first_close) / range.first_close;
  }

  // A negative P/E, EV/EBITDA, or price/book isn't a "very cheap" reading -
  // it's an accounting artifact of a loss-making company or negative book
  // equity. Before this fix, a negative value got z-scored and then
  // inverted (since lower is normally "better" for these) into a strongly
  // POSITIVE score - the opposite of what the number actually means. The
  // fix: treat a negative value on these specific metrics as missing data
  // rather than as a valuation signal. FCF yield is untouched since a
  // negative FCF yield is a real, meaningfully bad reading, not an
  // artifact - it doesn't need this treatment.
  function positiveOrNull(v: number | null | undefined): number | null {
    return v !== null && v !== undefined && v > 0 ? v : null;
  }

  // --- Build raw metric maps from fundamentals ---
  const trailingPe: Record<string, number | null> = {};
  const evToEbitda: Record<string, number | null> = {};
  const fcfYield: Record<string, number | null> = {};
  const priceToBook: Record<string, number | null> = {};
  const roe: Record<string, number | null> = {};
  const profitMargin: Record<string, number | null> = {};
  const debtToEquity: Record<string, number | null> = {};
  const revenueGrowth: Record<string, number | null> = {};
  const earningsGrowth: Record<string, number | null> = {};

  for (const ticker of tickers) {
    const f = fundamentalsByTicker.get(ticker);
    trailingPe[ticker] = positiveOrNull(f?.trailing_pe);
    evToEbitda[ticker] = positiveOrNull(f?.ev_to_ebitda);
    fcfYield[ticker] = f?.fcf_yield ?? null;
    priceToBook[ticker] = positiveOrNull(f?.price_to_book);
    roe[ticker] = f?.return_on_equity ?? null;
    profitMargin[ticker] = f?.profit_margin ?? null;
    debtToEquity[ticker] = positiveOrNull(f?.debt_to_equity);
    revenueGrowth[ticker] = f?.revenue_growth ?? null;
    earningsGrowth[ticker] = f?.earnings_growth ?? null;
  }

  // --- Z-score each metric across the universe ---
  // invert: true means "lower raw value = better", so we flip the sign
  const zTrailingPe = zScoreMap(trailingPe, true);
  const zEvToEbitda = zScoreMap(evToEbitda, true);
  const zFcfYield = zScoreMap(fcfYield, false);
  const zPriceToBook = zScoreMap(priceToBook, true);
  const zRoe = zScoreMap(roe, false);
  const zProfitMargin = zScoreMap(profitMargin, false);
  const zDebtToEquity = zScoreMap(debtToEquity, true);
  const zRevenueGrowth = zScoreMap(revenueGrowth, false);
  const zEarningsGrowth = zScoreMap(earningsGrowth, false);
  const zMomentum = zScoreMap(momentumRaw, false);

  const asOfDate = new Date().toISOString().slice(0, 10);
  const rows = [];

  for (const ticker of tickers) {
    const valueScore = averageSkipNull([
      zTrailingPe[ticker],
      zEvToEbitda[ticker],
      zFcfYield[ticker],
      zPriceToBook[ticker],
    ]);
    const qualityScore = averageSkipNull([
      zRoe[ticker],
      zProfitMargin[ticker],
      zDebtToEquity[ticker],
    ]);
    const growthScore = averageSkipNull([
      zRevenueGrowth[ticker],
      zEarningsGrowth[ticker],
    ]);
    const momentumScore = zMomentum[ticker];

    const categoryScores = [valueScore, qualityScore, growthScore, momentumScore];
    const nonNullCount = categoryScores.filter((v) => v !== null).length;
    const compositeScore = averageSkipNull(categoryScores);
    const dataCompleteness = nonNullCount / 4;

    rows.push({
      ticker,
      as_of_date: asOfDate,
      value_score: valueScore,
      quality_score: qualityScore,
      growth_score: growthScore,
      momentum_score: momentumScore,
      composite_score: compositeScore,
      data_completeness: dataCompleteness,
    });
  }

  // Batch upserts, 500 at a time
  let upserted = 0;
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from("factor_scores")
      .upsert(batch, { onConflict: "ticker,as_of_date" });
    if (error) {
      return NextResponse.json(
        { error: error.message, upsertedBeforeFailure: upserted },
        { status: 500 }
      );
    }
    upserted += batch.length;
  }

  return NextResponse.json({
    asOfDate,
    tickersScored: rows.length,
    upserted,
  });
}