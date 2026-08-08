import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getServiceSupabase } from "@/lib/supabase/server";
import { dailyReturns, pearsonCorrelation } from "@/lib/risk/calc";
import { buildReportHtml, type ReportData } from "@/lib/email/template";

const yahooFinance = new YahooFinance();

export const maxDuration = 120;

const INDICES = [
  { symbol: "^GSPC", name: "S&P 500 (US)" },
  { symbol: "^IXIC", name: "Nasdaq (US)" },
  { symbol: "^N225", name: "Nikkei 225 (Japan)" },
  { symbol: "^HSI", name: "Hang Seng (Hong Kong)" },
  { symbol: "^GDAXI", name: "DAX (Germany)" },
  { symbol: "^FTSE", name: "FTSE 100 (UK)" },
  { symbol: "^OMX", name: "OMX Stockholm 30" },
];

async function fetchIndexChange(symbol: string): Promise<number | null> {
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - 10);
    const result = await yahooFinance.chart(symbol, { period1, interval: "1d" });
    const closes = result.quotes.filter((q) => q.close !== null).map((q) => q.close as number);
    if (closes.length < 2) return null;
    const latest = closes[closes.length - 1];
    const prior = closes[closes.length - 2];
    if (prior === 0) return null;
    return (latest - prior) / prior;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.REPORT_RECIPIENT_EMAIL;
  if (!resendApiKey || !recipient) {
    return NextResponse.json(
      { error: "RESEND_API_KEY or REPORT_RECIPIENT_EMAIL not set" },
      { status: 500 }
    );
  }

  const supabase = getServiceSupabase();

  // --- Overnight indices ---
  const indices = await Promise.all(
    INDICES.map(async (idx) => ({
      name: idx.name,
      changePct: await fetchIndexChange(idx.symbol),
    }))
  );

  // --- Top ranked candidates (most recent scoring run) ---
  const { data: latestDateRow } = await supabase
    .from("factor_scores")
    .select("as_of_date")
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let candidates: ReportData["candidates"] = [];
  if (latestDateRow) {
    const { data: scoreRows } = await supabase
      .from("factor_scores")
      .select("ticker, composite_score, data_completeness")
      .eq("as_of_date", latestDateRow.as_of_date)
      .not("composite_score", "is", null)
      .gte("data_completeness", 0.5)
      .order("composite_score", { ascending: false })
      .limit(8);

    if (scoreRows && scoreRows.length > 0) {
      const tickers = scoreRows.map((r) => r.ticker);
      const { data: universeRows } = await supabase
        .from("universe")
        .select("ticker, name, sector")
        .in("ticker", tickers);
      const universeByTicker = new Map((universeRows ?? []).map((r) => [r.ticker, r]));

      candidates = scoreRows.map((r) => ({
        ticker: r.ticker,
        name: universeByTicker.get(r.ticker)?.name ?? null,
        sector: universeByTicker.get(r.ticker)?.sector ?? null,
        compositeScore: r.composite_score as number,
        dataCompleteness: r.data_completeness as number,
      }));
    }
  }

  // --- Portfolio risk flags ---
  const riskFlags: string[] = [];
  let portfolioNote: string | null = null;

  const { data: holdings } = await supabase.from("portfolio").select("*");

  if (!holdings || holdings.length === 0) {
    portfolioNote = "No holdings logged in your portfolio tracker.";
  } else {
    const tickers = holdings.map((h) => h.ticker);

    const { data: priceRows } = await supabase
      .from("price_history")
      .select("ticker, date, close")
      .in("ticker", tickers)
      .order("date", { ascending: true });

    const seriesByTicker = new Map<string, { date: string; close: number }[]>();
    for (const row of priceRows ?? []) {
      if (row.close === null) continue;
      const arr = seriesByTicker.get(row.ticker) ?? [];
      arr.push({ date: row.date, close: row.close });
      seriesByTicker.set(row.ticker, arr);
    }

    // Correlation flags
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
        const corr = pearsonCorrelation(dailyReturns(closesA), dailyReturns(closesB));
        if (corr !== null && corr > 0.7) {
          riskFlags.push(
            `${tA} and ${tB} are highly correlated (${corr.toFixed(2)}) - limited diversification benefit between them.`
          );
        }
      }
    }

    // Sector concentration flag (by position count)
    const { data: universeRows } = await supabase
      .from("universe")
      .select("ticker, sector")
      .in("ticker", tickers);
    const sectorByTicker = new Map((universeRows ?? []).map((r) => [r.ticker, r.sector]));
    const sectorCounts: Record<string, number> = {};
    for (const t of tickers) {
      const sector = sectorByTicker.get(t) ?? "Unknown";
      sectorCounts[sector] = (sectorCounts[sector] ?? 0) + 1;
    }
    for (const [sector, count] of Object.entries(sectorCounts)) {
      const share = count / tickers.length;
      if (share >= 0.5 && sector !== "Unknown") {
        riskFlags.push(
          `${Math.round(share * 100)}% of your positions are in ${sector} - concentrated sector exposure.`
        );
      }
    }
  }

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const dataQualityNote =
    "Price history is still building up since the pipeline was recently deployed - momentum, volatility, and correlation figures will sharpen over the coming weeks as more daily data accumulates.";

  const html = buildReportHtml({
    dateLabel,
    indices,
    candidates,
    riskFlags,
    portfolioNote,
    dataQualityNote,
  });

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Morning Market Brief <onboarding@resend.dev>",
      to: [recipient],
      subject: `Morning Market Brief - ${dateLabel}`,
      html,
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    return NextResponse.json({ error: `Resend error: ${errText}` }, { status: 500 });
  }

  return NextResponse.json({
    sent: true,
    candidatesCount: candidates.length,
    riskFlagsCount: riskFlags.length,
  });
}