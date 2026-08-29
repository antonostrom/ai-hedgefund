import YahooFinance from "yahoo-finance2";
import { getServiceSupabase } from "@/lib/supabase/server";
import { pickDiversifiedCandidates } from "./pick-candidates";

const yahooFinance = new YahooFinance();

export type ModelSeriesPoint = {
  date: string;
  candidateCumPct: number | null;
  benchmarkCumPct: number | null;
  pickedTickers: string[];
};

export type ModelSummary = {
  daysTracked: number;
  candidateTotalReturnPct: number | null;
  benchmarkTotalReturnPct: number | null;
  winRateVsBenchmark: number | null;
  latestPicks: string[];
};

export type ModelPerformanceResult = {
  series: ModelSeriesPoint[];
  summary: ModelSummary | null;
  note: string | null;
};

/**
 * Every distinct date the scoring engine has run, oldest first. Paginated -
 * an unpaginated query silently caps at Supabase's 1000-row default once
 * factor_scores grows past ~1.5 days of daily scoring history (roughly
 * 650 stocks scored per day), which would truncate this to only the
 * earliest dates and quietly break everything downstream.
 */
export async function fetchAllScoringDates(
  supabase: ReturnType<typeof getServiceSupabase>
): Promise<string[]> {
  const pageSize = 1000;
  let from = 0;
  const dates = new Set<string>();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("factor_scores")
      .select("as_of_date")
      .order("as_of_date", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) dates.add(row.as_of_date as string);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return Array.from(dates).sort();
}

/**
 * Daily-rebalanced top-N equal-weight portfolio vs. S&P 500. Each scoring
 * date's sector-diversified picks are held to the next scoring date, then
 * re-picked from scratch. Optionally excludes a sector from that day's
 * already-selected picks before averaging (not a re-simulation with
 * replacement stocks - see pick-candidates.ts for that distinction).
 */
export async function computeModelPerformance(
  supabase: ReturnType<typeof getServiceSupabase>,
  opts: { topN?: number; maxPerSector?: number; minDataCompleteness?: number; excludeSector?: string | null } = {}
): Promise<ModelPerformanceResult> {
  const topN = opts.topN ?? 8;
  const maxPerSector = opts.maxPerSector ?? 2;
  const minDataCompleteness = opts.minDataCompleteness ?? 0.5;
  const excludeSector = opts.excludeSector ?? null;

  const distinctDates = await fetchAllScoringDates(supabase);

  if (distinctDates.length === 0) {
    return { series: [], summary: null, note: "No scoring history yet." };
  }
  if (distinctDates.length < 2) {
    return {
      series: [],
      summary: null,
      note: "Need at least 2 scoring snapshots to compute a forward return. Check back after tomorrow's scoring run.",
    };
  }

  const dailyReturns: { date: string; candidateReturn: number | null; pickedTickers: string[] }[] = [];

  for (let i = 0; i < distinctDates.length - 1; i++) {
    const pickDate = distinctDates[i];
    const nextDate = distinctDates[i + 1];

    const picks = await pickDiversifiedCandidates(supabase, pickDate, {
      topN,
      maxPerSector,
      minDataCompleteness,
    });

    const filteredPicks = excludeSector ? picks.filter((p) => p.sector !== excludeSector) : picks;

    if (filteredPicks.length === 0) {
      dailyReturns.push({ date: nextDate, candidateReturn: null, pickedTickers: [] });
      continue;
    }

    const tickers = filteredPicks.map((p) => p.ticker);
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

  let candidateCum = 0;
  let benchmarkCum = 0;
  let prevBenchmarkClose: number | null = null;
  const series: ModelSeriesPoint[] = [];
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
        benchmarkCumPct = 0;
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

  // Use the last entry that actually has a computed return, not just the
  // literal last row - the trailing row can be null on a day where a fresh
  // scoring snapshot exists but no forward price yet exists to measure
  // against (e.g. a weekend or a same-day manual trigger). Without this,
  // the headline return shows a dash even though real data exists just one
  // row earlier - exactly what happened here.
  let lastValid: (typeof series)[number] | null = null;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].candidateCumPct !== null) {
      lastValid = series[i];
      break;
    }
  }

  const summary: ModelSummary = {
    daysTracked: validReturns.length,
    candidateTotalReturnPct: lastValid ? lastValid.candidateCumPct : null,
    benchmarkTotalReturnPct: lastValid ? lastValid.benchmarkCumPct : null,
    winRateVsBenchmark: winRate,
    latestPicks: dailyReturns.length > 0 ? dailyReturns[dailyReturns.length - 1].pickedTickers : [],
  };

  return {
    series,
    summary,
    note:
      validReturns.length < 5
        ? `Only ${validReturns.length} trading day(s) tracked so far - this needs several weeks to say anything meaningful. Tracking started when daily scoring began; this is not a retroactive backtest.`
        : null,
  };
}