import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { zScoreMap, averageSkipNull } from "@/lib/pipeline/stats";

export const maxDuration = 300;

type PriceRow = { ticker: string; date: string; close: number | null };

async function fetchAllPriceHistory(
  supabase: ReturnType<typeof getServiceSupabase>
): Promise<PriceRow[]> {
  const pageSize = 1000;
  let from = 0;
  const all: PriceRow[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("price_history")
      .select("ticker, date, close")
      .order("date", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as PriceRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  const { data: universeRows, error: universeError } = await supabase
    .from("universe")
    .select("ticker")
    .eq("active", true)
    .eq("asset_type", "stock");

  if (universeError || !universeRows) {
    return NextResponse.json({ error: universeError?.message ?? "No universe data" }, { status: 500 });
  }
  const tickers = universeRows.map((r) => r.ticker);
  const tickerSet = new Set(tickers);

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

  const priceRows = await fetchAllPriceHistory(supabase);
  const priceRange = new Map<string, { firstClose: number; firstDate: string; lastClose: number; lastDate: string }>();
  for (const row of priceRows) {
    if (!tickerSet.has(row.ticker) || row.close === null) continue;
    const existing = priceRange.get(row.ticker);
    if (!existing) {
      priceRange.set(row.ticker, {
        firstClose: row.close,
        firstDate: row.date,
        lastClose: row.close,
        lastDate: row.date,
      });
    } else {
      existing.lastClose = row.close;
      existing.lastDate = row.date;
    }
  }

  const momentumRaw: Record<string, number | null> = {};
  for (const ticker of tickers) {
    const range = priceRange.get(ticker);
    if (!range || range.firstDate === range.lastDate || range.firstClose === 0) {
      momentumRaw[ticker] = null;
      continue;
    }
    momentumRaw[ticker] = (range.lastClose - range.firstClose) / range.firstClose;
  }

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
    trailingPe[ticker] = f?.trailing_pe ?? null;
    evToEbitda[ticker] = f?.ev_to_ebitda ?? null;
    fcfYield[ticker] = f?.fcf_yield ?? null;
    priceToBook[ticker] = f?.price_to_book ?? null;
    roe[ticker] = f?.return_on_equity ?? null;
    profitMargin[ticker] = f?.profit_margin ?? null;
    debtToEquity[ticker] = f?.debt_to_equity ?? null;
    revenueGrowth[ticker] = f?.revenue_growth ?? null;
    earningsGrowth[ticker] = f?.earnings_growth ?? null;
  }

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