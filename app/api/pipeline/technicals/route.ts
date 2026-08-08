import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sma, rsi, macd } from "@/lib/pipeline/technicals";

export const maxDuration = 120;

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
    .eq("active", true);

  if (universeError || !universeRows) {
    return NextResponse.json({ error: universeError?.message ?? "No universe data" }, { status: 500 });
  }
  const tickerSet = new Set(universeRows.map((r) => r.ticker));

  const priceRows = await fetchAllPriceHistory(supabase);

  const seriesByTicker = new Map<string, { date: string; close: number }[]>();
  for (const row of priceRows) {
    if (!tickerSet.has(row.ticker) || row.close === null) continue;
    const arr = seriesByTicker.get(row.ticker) ?? [];
    arr.push({ date: row.date, close: row.close });
    seriesByTicker.set(row.ticker, arr);
  }

  const rows = [];
  for (const [ticker, series] of seriesByTicker.entries()) {
    if (series.length === 0) continue;
    const closes = series.map((s) => s.close);
    const latestDate = series[series.length - 1].date;
    const latestClose = closes[closes.length - 1];

    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);
    const { macd: macdVal, signal: macdSignal, histogram: macdHistogram } = macd(closes);

    const trend = sma50 !== null ? (latestClose > sma50 ? "above_sma50" : "below_sma50") : null;
    const rsiSignal =
      rsi14 === null ? null : rsi14 > 70 ? "overbought" : rsi14 < 30 ? "oversold" : "neutral";

    rows.push({
      ticker,
      as_of_date: latestDate,
      sma20,
      sma50,
      sma200,
      rsi14,
      macd: macdVal,
      macd_signal: macdSignal,
      macd_histogram: macdHistogram,
      trend,
      rsi_signal: rsiSignal,
    });
  }

  let upserted = 0;
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from("technicals")
      .upsert(batch, { onConflict: "ticker,as_of_date" });
    if (error) {
      return NextResponse.json(
        { error: error.message, upsertedBeforeFailure: upserted },
        { status: 500 }
      );
    }
    upserted += batch.length;
  }

  return NextResponse.json({ tickersProcessed: rows.length, upserted });
}