import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/auth";

const yahooFinance = new YahooFinance();

export const maxDuration = 60;

const TOP_N = 8; // matches the daily email's candidate count
const MIN_DATA_COMPLETENESS = 0.5; // matches the email's filter

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  // Every distinct date the scoring engine has run
  const { data: dateRows } = await supabase
    .from("factor_scores")
    .select("as_of_date")
    .order("as_of_date", { ascending: true });

  if (!dateRows || dateRows.length === 0) {
    return NextResponse.json({ series: [], summary: null, note: "No scoring history yet." });
  }
  const distinctDates = Array.from(new Set(dateRows.map((r) => r.as_of_date as string)));

  if (distinctDates.length < 2) {
    return NextResponse.json({
      series: [],
      summary: null,
      note: "Need at least 2 scoring snapshots to compute a forward return. Check back after tomorrow's scoring run.",
    });
  }

  // For each consecutive pair of scoring dates, pick that day's top N and
  // measure the return achieved by holding them to the next scoring date.
  const dailyReturns: { date: string; candidateReturn: number | null; pickedTickers: string[] }[] = [];

  for (let i = 0; i < distinctDates.length - 1; i++) {
    const pickDate = distinctDates[i];
    const nextDate = distinctDates[i + 1];

    const { data: scoreRows } = await supabase
      .from("factor_scores")
      .select("ticker, composite_score, data_completeness")
      .eq("as_of_date", pickDate)
      .not("composite_score", "is", null)
      .gte("data_completeness", MIN_DATA_COMPLETENESS)
      .order("composite_score", { ascending: false })
      .limit(TOP_N);

    if (!scoreRows || scoreRows.length === 0) {
      dailyReturns.push({ date: nextDate, candidateReturn: null, pickedTickers: [] });
      continue;
    }

    const tickers = scoreRows.map((r) => r.ticker);
    const { data: priceRows } = await supabase
      .from("price_history")
      .select("ticker, date, close")
      .in("ticker", tickers)
      .in("date", [pickDate, nextDate]);

    const priceByTickerDate = new Map<string, number>();
    for (const row of priceRows ?? []) {
      if (row.close !== null) priceByTickerDate.set(`${row.ticker}|${row.date}`, row.close);
    }

    const returns: number[] = [];
    for (const ticker of tickers) {
      const p0 = priceByTickerDate.get(`${ticker}|${pickDate}`);
      const p1 = priceByTickerDate.get(`${ticker}|${nextDate}`);
      if (p0 !== undefined && p1 !== undefined && p0 > 0) {
        returns.push((p1 - p0) / p0);
      }
    }

    const candidateReturn =
      returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;

    dailyReturns.push({ date: nextDate, candidateReturn, pickedTickers: tickers });
  }

  // Benchmark: S&P 500 over the same date range
  const period1 = new Date(distinctDates[0]);
  let benchmarkByDate = new Map<string, number>();
  try {
    const result = await yahooFinance.chart("^GSPC", { period1, interval: "1d" });
    benchmarkByDate = new Map(
      result.quotes
        .filter((q) => q.close !== null)
        .map((q) => [q.date.toISOString().slice(0, 10), q.close as number])
    );
  } catch {
    // benchmark unavailable - candidate series still shown, just no comparison line
  }

  // Compound both series into cumulative % curves, and track each day's
  // benchmark return alongside the candidate return so we can compute a
  // proper "did the picks beat the market that day" win rate.
  let candidateCum = 0;
  let benchmarkCum = 0;
  let prevBenchmarkClose: number | null = null;
  const series: {
    date: string;
    candidateCumPct: number | null;
    benchmarkCumPct: number | null;
    pickedTickers: string[];
  }[] = [];
  const dailyComparisons: { candidateReturn: number; benchmarkReturn: number }[] = [];

  for (const dr of dailyReturns) {
    if (dr.candidateReturn !== null) {
      candidateCum = (1 + candidateCum / 100) * (1 + dr.candidateReturn) * 100 - 100;
    }

    const closeToday = benchmarkByDate.get(dr.date);
    let benchmarkCumPct: number | null = null;
    let benchReturnToday: number | null = null;
    if (closeToday !== undefined) {
      if (prevBenchmarkClose !== null) {
        benchReturnToday = (closeToday - prevBenchmarkClose) / prevBenchmarkClose;
        benchmarkCum = (1 + benchmarkCum / 100) * (1 + benchReturnToday) * 100 - 100;
        benchmarkCumPct = benchmarkCum;
      } else {
        benchmarkCumPct = 0; // first point, nothing to compare yet
      }
      prevBenchmarkClose = closeToday;
    }

    if (dr.candidateReturn !== null && benchReturnToday !== null) {
      dailyComparisons.push({ candidateReturn: dr.candidateReturn, benchmarkReturn: benchReturnToday });
    }

    series.push({
      date: dr.date,
      candidateCumPct: dr.candidateReturn !== null ? candidateCum : null,
      benchmarkCumPct,
      pickedTickers: dr.pickedTickers,
    });
  }

  const validReturns = dailyReturns.filter((d) => d.candidateReturn !== null);
  const winRate =
    dailyComparisons.length > 0
      ? dailyComparisons.filter((c) => c.candidateReturn > c.benchmarkReturn).length /
        dailyComparisons.length
      : null;

  const summary = {
    daysTracked: validReturns.length,
    candidateTotalReturnPct: series.length > 0 ? series[series.length - 1].candidateCumPct : null,
    benchmarkTotalReturnPct: series.length > 0 ? series[series.length - 1].benchmarkCumPct : null,
    winRateVsBenchmark: winRate,
    latestPicks: dailyReturns.length > 0 ? dailyReturns[dailyReturns.length - 1].pickedTickers : [],
  };

  return NextResponse.json({
    series,
    summary,
    note:
      validReturns.length < 5
        ? `Only ${validReturns.length} trading day(s) tracked so far - this needs several weeks to say anything meaningful about whether the ranking model has real predictive value. Tracking started when daily scoring began; this is not a retroactive backtest.`
        : null,
  });
}