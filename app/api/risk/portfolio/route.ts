import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/auth";
import { dailyReturns, annualizedVolatility, pearsonCorrelation } from "@/lib/risk/calc";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  const { data: holdings, error: holdingsError } = await supabase
    .from("portfolio")
    .select("*");

  if (holdingsError) {
    return NextResponse.json({ error: holdingsError.message }, { status: 500 });
  }
  if (!holdings || holdings.length === 0) {
    return NextResponse.json({
      holdings: [],
      note: "No holdings in portfolio yet.",
    });
  }

  const tickers = holdings.map((h) => h.ticker);

  const { data: universeRows } = await supabase
    .from("universe")
    .select("ticker, sector, country, region, currency")
    .in("ticker", tickers);
  const universeByTicker = new Map((universeRows ?? []).map((r) => [r.ticker, r]));

  const { data: priceRows, error: priceError } = await supabase
    .from("price_history")
    .select("ticker, date, close")
    .in("ticker", tickers)
    .order("date", { ascending: true });

  if (priceError) {
    return NextResponse.json({ error: priceError.message }, { status: 500 });
  }

  const seriesByTicker = new Map<string, { date: string; close: number }[]>();
  for (const row of priceRows ?? []) {
    if (row.close === null) continue;
    const arr = seriesByTicker.get(row.ticker) ?? [];
    arr.push({ date: row.date, close: row.close });
    seriesByTicker.set(row.ticker, arr);
  }

  const enrichedHoldings = holdings.map((h) => {
    const series = seriesByTicker.get(h.ticker) ?? [];
    const latestClose = series.length > 0 ? series[series.length - 1].close : null;
    const marketValue = latestClose !== null ? latestClose * h.shares : null;
    const closes = series.map((s) => s.close);
    const vol = annualizedVolatility(dailyReturns(closes));
    const u = universeByTicker.get(h.ticker);

    return {
      ticker: h.ticker,
      shares: h.shares,
      currency: h.currency,
      account: h.account,
      latest_close: latestClose,
      market_value: marketValue,
      annualized_volatility: vol,
      sector: u?.sector ?? null,
      country: u?.country ?? null,
      region: u?.region ?? null,
      price_data_points: series.length,
    };
  });

  function breakdownByCount(keyFn: (h: (typeof enrichedHoldings)[number]) => string | null) {
    const counts: Record<string, number> = {};
    for (const h of enrichedHoldings) {
      const key = keyFn(h) ?? "Unknown";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  function valueByCurrencyAndKey(
    keyFn: (h: (typeof enrichedHoldings)[number]) => string | null
  ) {
    const out: Record<string, Record<string, number>> = {};
    for (const h of enrichedHoldings) {
      if (h.market_value === null) continue;
      const key = keyFn(h) ?? "Unknown";
      out[h.currency] ??= {};
      out[h.currency][key] = (out[h.currency][key] ?? 0) + h.market_value;
    }
    return out;
  }

  const sectorExposureByCount = breakdownByCount((h) => h.sector);
  const countryExposureByCount = breakdownByCount((h) => h.country);
  const currencyExposureByCount = breakdownByCount((h) => h.currency);
  const sectorExposureByValue = valueByCurrencyAndKey((h) => h.sector);
  const countryExposureByValue = valueByCurrencyAndKey((h) => h.country);

  const largestByCurrency: Record<string, { ticker: string; market_value: number }> = {};
  for (const h of enrichedHoldings) {
    if (h.market_value === null) continue;
    const current = largestByCurrency[h.currency];
    if (!current || h.market_value > current.market_value) {
      largestByCurrency[h.currency] = { ticker: h.ticker, market_value: h.market_value };
    }
  }

  const correlations: { pair: [string, string]; correlation: number | null }[] = [];
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const tA = tickers[i];
      const tB = tickers[j];
      const seriesA = seriesByTicker.get(tA) ?? [];
      const seriesB = seriesByTicker.get(tB) ?? [];

      const datesA = new Map(seriesA.map((s) => [s.date, s.close]));
      const datesB = new Map(seriesB.map((s) => [s.date, s.close]));
      const commonDates = [...datesA.keys()].filter((d) => datesB.has(d)).sort();

      const closesA = commonDates.map((d) => datesA.get(d)!);
      const closesB = commonDates.map((d) => datesB.get(d)!);
      const retA = dailyReturns(closesA);
      const retB = dailyReturns(closesB);

      correlations.push({
        pair: [tA, tB],
        correlation: pearsonCorrelation(retA, retB),
      });
    }
  }

  const maxPriceDataPoints = Math.max(0, ...enrichedHoldings.map((h) => h.price_data_points));

  return NextResponse.json({
    holdings: enrichedHoldings,
    exposure: {
      by_sector_count: sectorExposureByCount,
      by_country_count: countryExposureByCount,
      by_currency_count: currencyExposureByCount,
      by_sector_value: sectorExposureByValue,
      by_country_value: countryExposureByValue,
    },
    largest_position_by_currency: largestByCurrency,
    correlations,
    data_quality_note:
      maxPriceDataPoints < 30
        ? `Only ${maxPriceDataPoints} trading days of price history available so far. Volatility and correlation figures are based on a short window and will become more reliable as the daily price pipeline accumulates more history over the coming weeks.`
        : null,
  });
}