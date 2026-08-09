import { getServiceSupabase } from "@/lib/supabase/server";

export type SectorAggregate = {
  sector: string;
  avgScore: number;
  positions: number;
  priorAvgScore: number | null;
  delta: number | null;
};

export type SectorRotationResult = {
  currentDate: string | null;
  priorDate: string | null;
  sectors: SectorAggregate[];
};

async function fetchSectorAverages(
  supabase: ReturnType<typeof getServiceSupabase>,
  date: string
): Promise<Map<string, { sum: number; count: number }>> {
  const { data: scoreRows } = await supabase
    .from("factor_scores")
    .select("ticker, composite_score")
    .eq("as_of_date", date)
    .not("composite_score", "is", null);

  const agg = new Map<string, { sum: number; count: number }>();
  if (!scoreRows || scoreRows.length === 0) return agg;

  const tickers = scoreRows.map((r) => r.ticker);
  const { data: universeRows } = await supabase
    .from("universe")
    .select("ticker, sector")
    .in("ticker", tickers);
  const sectorByTicker = new Map(
    (universeRows ?? []).map((r) => [r.ticker, r.sector ?? "Unknown"])
  );

  for (const row of scoreRows) {
    const sector = sectorByTicker.get(row.ticker) ?? "Unknown";
    const entry = agg.get(sector) ?? { sum: 0, count: 0 };
    entry.sum += row.composite_score as number;
    entry.count += 1;
    agg.set(sector, entry);
  }
  return agg;
}

/**
 * Aggregates factor scores by sector for the most recent scoring run, and
 * compares against the run closest to 4 weeks earlier (if one exists) to
 * compute a rotation delta. Returns priorDate: null and delta: null on
 * every sector until there's enough weekly history to compare against -
 * this is expected early on, not a bug.
 */
export async function computeSectorRotation(
  supabase: ReturnType<typeof getServiceSupabase>
): Promise<SectorRotationResult> {
  const { data: dateRows } = await supabase
    .from("factor_scores")
    .select("as_of_date")
    .order("as_of_date", { ascending: false });

  if (!dateRows || dateRows.length === 0) {
    return { currentDate: null, priorDate: null, sectors: [] };
  }

  const distinctDates = Array.from(new Set(dateRows.map((r) => r.as_of_date as string)));
  const currentDate = distinctDates[0];
  const currentMs = new Date(currentDate).getTime();

  // Look for a prior snapshot roughly 4 weeks back (14-42 day window gives
  // some flex around exactly-28-days, since scoring runs weekly on Sundays)
  let priorDate: string | null = null;
  let bestDiff = Infinity;
  for (const d of distinctDates.slice(1)) {
    const diffDays = (currentMs - new Date(d).getTime()) / 86400000;
    if (diffDays >= 14 && diffDays <= 42) {
      const diffFromTarget = Math.abs(diffDays - 28);
      if (diffFromTarget < bestDiff) {
        bestDiff = diffFromTarget;
        priorDate = d;
      }
    }
  }

  const currentAgg = await fetchSectorAverages(supabase, currentDate);
  const priorAgg = priorDate
    ? await fetchSectorAverages(supabase, priorDate)
    : new Map<string, { sum: number; count: number }>();

  const sectors: SectorAggregate[] = [];
  for (const [sector, { sum, count }] of currentAgg.entries()) {
    const avgScore = sum / count;
    const priorEntry = priorAgg.get(sector);
    const priorAvgScore = priorEntry ? priorEntry.sum / priorEntry.count : null;
    const delta = priorAvgScore !== null ? avgScore - priorAvgScore : null;
    sectors.push({ sector, avgScore, positions: count, priorAvgScore, delta });
  }
  sectors.sort((a, b) => b.avgScore - a.avgScore);

  return { currentDate, priorDate, sectors };
}