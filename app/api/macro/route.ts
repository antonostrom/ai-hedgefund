import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { isAuthorized } from "@/lib/auth";
import { MACRO_KPIS, interpretYieldCurve } from "@/lib/macro/kpis";
import { fetchFredSeries } from "@/lib/macro/fred";

const yahooFinance = new YahooFinance();

export const maxDuration = 60;

type Point = { date: string; close: number };

async function fetchSeries(symbol: string, days: number): Promise<Point[]> {
  const period1 = new Date();
  period1.setDate(period1.getDate() - days);
  try {
    const result = await yahooFinance.chart(symbol, { period1, interval: "1d" });
    return result.quotes
      .filter((q) => q.close !== null)
      .map((q) => ({ date: q.date.toISOString().slice(0, 10), close: q.close as number }));
  } catch {
    return [];
  }
}

function pctChange(series: Point[], tradingDaysBack: number): number | null {
  if (series.length <= tradingDaysBack) return null;
  const current = series[series.length - 1].close;
  const prior = series[series.length - 1 - tradingDaysBack].close;
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all KPI series in parallel, 90 days back (enough for a ~1-month lookback with buffer)
  const kpiSeries = await Promise.all(MACRO_KPIS.map((k) => fetchSeries(k.symbol, 90)));

  const kpis = MACRO_KPIS.map((def, i) => {
    const series = kpiSeries[i];
    if (series.length === 0) {
      return {
        key: def.key,
        label: def.label,
        unit: def.unit,
        current: null,
        change1d: null,
        change1w: null,
        change1m: null,
        interpretation: null,
        note: `Could not fetch ${def.symbol} - Yahoo Finance may be rate-limiting or the ticker changed.`,
      };
    }
    const current = series[series.length - 1].close;
    const interp = def.interpret ? def.interpret(current) : null;
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      current,
      change1d: pctChange(series, 1),
      change1w: pctChange(series, 5),
      change1m: pctChange(series, 21),
      interpretation: interp,
      note: null,
    };
  });

  // Yield curve spread (10Y - 3M), a well-known recession-timing indicator
  const tnxIdx = MACRO_KPIS.findIndex((k) => k.key === "yield10y");
  const irxIdx = MACRO_KPIS.findIndex((k) => k.key === "yield3m");
  const tnxSeries = kpiSeries[tnxIdx];
  const irxSeries = kpiSeries[irxIdx];

  let yieldCurve = null;
  let yieldCurveSeries: { date: string; spread: number }[] = [];
  if (tnxSeries.length > 0 && irxSeries.length > 0) {
    const irxByDate = new Map(irxSeries.map((p) => [p.date, p.close]));
    yieldCurveSeries = tnxSeries
      .filter((p) => irxByDate.has(p.date))
      .map((p) => ({ date: p.date, spread: p.close - (irxByDate.get(p.date) as number) }));
    if (yieldCurveSeries.length > 0) {
      const currentSpread = yieldCurveSeries[yieldCurveSeries.length - 1].spread;
      yieldCurve = { currentSpread, interpretation: interpretYieldCurve(currentSpread) };
    }
  }

  // VIX trend series for the chart
  const vixIdx = MACRO_KPIS.findIndex((k) => k.key === "vix");
  const vixSeries = kpiSeries[vixIdx].map((p) => ({ date: p.date, value: p.close }));

  // --- 2-Year Treasury Yield & the 10Y-2Y spread (FRED, not Yahoo) ---
  // Yahoo has no reliable 2-year yield ticker (CBOE never published one in
  // the ^TNX/^IRX/^FVX/^TYX family Yahoo mirrors), so this uses FRED - the
  // official source - instead. Degrades gracefully if no key is set, same
  // pattern as the news module's ANTHROPIC_API_KEY check.
  const fredApiKey = process.env.FRED_API_KEY;

  let yield2y: {
    current: number | null;
    change1d: number | null;
    change1w: number | null;
    change1m: number | null;
    note: string | null;
  } = {
    current: null,
    change1d: null,
    change1w: null,
    change1m: null,
    note: "FRED_API_KEY not configured - 2-year yield unavailable.",
  };

  let yieldCurve10y2y: { currentSpread: number; interpretation: ReturnType<typeof interpretYieldCurve> } | null = null;
  let yieldCurve10y2ySeries: { date: string; spread: number }[] = [];

  // --- Phase 2: real economic data, same FRED client, different series IDs ---
  type EconLevel = {
    current: number | null;
    priorValue: number | null;
    changePts: number | null;
    asOfDate: string | null;
    note: string | null;
  };
  const NOT_CONFIGURED_ECON: EconLevel = {
    current: null,
    priorValue: null,
    changePts: null,
    asOfDate: null,
    note: "FRED_API_KEY not configured.",
  };

  let cpiYoy: EconLevel = { ...NOT_CONFIGURED_ECON };
  let cpiYoySeries: { date: string; yoy: number }[] = [];
  let unemployment: EconLevel = { ...NOT_CONFIGURED_ECON };
  let gdpGrowth: EconLevel = { ...NOT_CONFIGURED_ECON };

  if (fredApiKey) {
    const dgs2Raw = await fetchFredSeries("DGS2", fredApiKey, 90);
    const dgs2Series: Point[] = dgs2Raw.map((p) => ({ date: p.date, close: p.value }));

    if (dgs2Series.length > 0) {
      yield2y = {
        current: dgs2Series[dgs2Series.length - 1].close,
        change1d: pctChange(dgs2Series, 1),
        change1w: pctChange(dgs2Series, 5),
        change1m: pctChange(dgs2Series, 21),
        note: null,
      };
    } else {
      yield2y = { current: null, change1d: null, change1w: null, change1m: null, note: "Could not fetch DGS2 from FRED." };
    }

    const spreadRaw = await fetchFredSeries("T10Y2Y", fredApiKey, 90);
    if (spreadRaw.length > 0) {
      yieldCurve10y2ySeries = spreadRaw.map((p) => ({ date: p.date, spread: p.value }));
      const currentSpread = yieldCurve10y2ySeries[yieldCurve10y2ySeries.length - 1].spread;
      yieldCurve10y2y = { currentSpread, interpretation: interpretYieldCurve(currentSpread) };
    }

    // CPI (CPIAUCSL) is a price INDEX, not a rate - "314.5" means nothing on
    // its own, so this reports year-over-year % change instead, which is
    // what "inflation" actually refers to. Monthly series: fetch ~800 days
    // (~26 months) so there's always a matching point 12 months back.
    const cpiRaw = await fetchFredSeries("CPIAUCSL", fredApiKey, 800);
    if (cpiRaw.length > 12) {
      for (let i = 12; i < cpiRaw.length; i++) {
        const base = cpiRaw[i - 12].value;
        if (base === 0) continue;
        cpiYoySeries.push({ date: cpiRaw[i].date, yoy: ((cpiRaw[i].value - base) / base) * 100 });
      }
      if (cpiYoySeries.length > 0) {
        const latest = cpiYoySeries[cpiYoySeries.length - 1];
        const prior = cpiYoySeries.length > 1 ? cpiYoySeries[cpiYoySeries.length - 2] : null;
        cpiYoy = {
          current: latest.yoy,
          priorValue: prior ? prior.yoy : null,
          changePts: prior ? latest.yoy - prior.yoy : null,
          asOfDate: latest.date,
          note: null,
        };
      } else {
        cpiYoy = { current: null, priorValue: null, changePts: null, asOfDate: null, note: "Not enough CPI history for a year-over-year calculation." };
      }
    } else {
      cpiYoy = { current: null, priorValue: null, changePts: null, asOfDate: null, note: "Could not fetch CPIAUCSL from FRED." };
    }

    // Unemployment rate is already a rate - no transformation needed, just
    // report the latest reading against the prior month's.
    const unrateRaw = await fetchFredSeries("UNRATE", fredApiKey, 400);
    if (unrateRaw.length > 0) {
      const latest = unrateRaw[unrateRaw.length - 1];
      const prior = unrateRaw.length > 1 ? unrateRaw[unrateRaw.length - 2] : null;
      unemployment = {
        current: latest.value,
        priorValue: prior ? prior.value : null,
        changePts: prior ? latest.value - prior.value : null,
        asOfDate: latest.date,
        note: null,
      };
    } else {
      unemployment = { current: null, priorValue: null, changePts: null, asOfDate: null, note: "Could not fetch UNRATE from FRED." };
    }

    // Real GDP growth (A191RL1Q225SBEA) is already an annualized quarterly
    // % growth rate - report the latest quarter against the prior one.
    // Quarterly series: 900 days (~12 quarters) gives generous buffer.
    const gdpRaw = await fetchFredSeries("A191RL1Q225SBEA", fredApiKey, 900);
    if (gdpRaw.length > 0) {
      const latest = gdpRaw[gdpRaw.length - 1];
      const prior = gdpRaw.length > 1 ? gdpRaw[gdpRaw.length - 2] : null;
      gdpGrowth = {
        current: latest.value,
        priorValue: prior ? prior.value : null,
        changePts: prior ? latest.value - prior.value : null,
        asOfDate: latest.date,
        note: null,
      };
    } else {
      gdpGrowth = { current: null, priorValue: null, changePts: null, asOfDate: null, note: "Could not fetch A191RL1Q225SBEA from FRED." };
    }
  }

  return NextResponse.json({
    kpis,
    yieldCurve,
    yieldCurveSeries,
    yield2y,
    yieldCurve10y2y,
    yieldCurve10y2ySeries,
    vixSeries,
    cpiYoy,
    cpiYoySeries,
    unemployment,
    gdpGrowth,
    asOf: new Date().toISOString(),
  });
}