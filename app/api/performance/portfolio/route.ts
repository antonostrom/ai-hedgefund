import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/auth";
import { BENCHMARKS, buildHoldingSeries, normalizeToPct } from "@/lib/performance/calc";

const yahooFinance = new YahooFinance();

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  const { data: holdings, error: holdingsError } = await supabase.from("portfolio").select("*");
  if (holdingsError) {
    return NextResponse.json({ error: holdingsError.message }, { status: 500 });
  }
  if (!holdings || holdings.length === 0) {
    return NextResponse.json({ currencies: [], note: "No holdings in portfolio yet." });
  }

  const tickers = holdings.map((h) => h.ticker);
  const { data: priceRows, error: priceError } = await supabase
    .from("price_history")
    .select("ticker, date, close")
    .in("ticker", tickers)
    .order("date", { ascending: true });
  if (priceError) {
    return NextResponse.json({ error: priceError.message }, { status: 500 });
  }

  const pricesByTicker = new Map<string, { date: string; close: number }[]>();
  for (const row of priceRows ?? []) {
    if (row.close === null) continue;
    const arr = pricesByTicker.get(row.ticker) ?? [];
    arr.push({ date: row.date, close: row.close });
    pricesByTicker.set(row.ticker, arr);
  }

  // Group holdings by currency - never mixed, never summed together
  const holdingsByCurrency = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const arr = holdingsByCurrency.get(h.currency) ?? [];
    arr.push(h);
    holdingsByCurrency.set(h.currency, arr);
  }

  const results = [];

  for (const [currency, group] of holdingsByCurrency.entries()) {
    // Union of all dates across this currency's holdings
    const dateSet = new Set<string>();
    for (const h of group) {
      for (const p of pricesByTicker.get(h.ticker) ?? []) dateSet.add(p.date);
    }
    const allDates = Array.from(dateSet).sort();

    if (allDates.length === 0) {
      results.push({
        currency,
        benchmarkName: null,
        series: [],
        currentValue: null,
        currentCostBasis: null,
        unrealizedPnlPct: null,
        note: "No price history available yet for this currency's holdings.",
      });
      continue;
    }

    // Sum each holding's forward-filled value series into one portfolio series
    let portfolioValues = new Array(allDates.length).fill(0);
    let costBasisTotal = 0;
    let costBasisComplete = true;

    for (const h of group) {
      const series = buildHoldingSeries(
        allDates,
        pricesByTicker.get(h.ticker) ?? [],
        h.shares,
        h.date_added
      );
      portfolioValues = portfolioValues.map((v, i) => v + series[i]);

      if (h.cost_basis !== null) {
        costBasisTotal += h.cost_basis * h.shares;
      } else {
        costBasisComplete = false;
      }
    }

    const portfolioPct = normalizeToPct(portfolioValues);
    const currentValue = portfolioValues[portfolioValues.length - 1] || null;
    const unrealizedPnlPct =
      currentValue !== null && costBasisComplete && costBasisTotal > 0
        ? ((currentValue - costBasisTotal) / costBasisTotal) * 100
        : null;

    // Benchmark index, if one is configured for this currency
    let benchmarkName: string | null = null;
    const benchmarkByDate = new Map<string, number>();
    const benchmark = BENCHMARKS[currency];
    if (benchmark) {
      try {
        const period1 = new Date(allDates[0]);
        const result = await yahooFinance.chart(benchmark.symbol, { period1, interval: "1d" });
        const closes = result.quotes
          .filter((q) => q.close !== null)
          .map((q) => ({ date: q.date.toISOString().slice(0, 10), close: q.close as number }));
        const values = closes.map((c) => c.close);
        const pctValues = normalizeToPct(values);
        closes.forEach((c, i) => {
          if (pctValues[i] !== null) benchmarkByDate.set(c.date, pctValues[i] as number);
        });
        benchmarkName = benchmark.name;
      } catch {
        benchmarkName = null; // benchmark fetch failed - portfolio line still shown, just no comparison
      }
    }

    const series = allDates.map((date, i) => ({
      date,
      portfolioPct: portfolioPct[i],
      benchmarkPct: benchmarkByDate.get(date) ?? null,
    }));

    results.push({
      currency,
      benchmarkName,
      series,
      currentValue,
      currentCostBasis: costBasisComplete ? costBasisTotal : null,
      unrealizedPnlPct,
      note: costBasisComplete
        ? null
        : "Cost basis missing on one or more holdings - unrealized P&L not shown for this currency.",
    });
  }

  return NextResponse.json({ currencies: results });
}