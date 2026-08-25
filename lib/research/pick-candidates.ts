import { getServiceSupabase } from "@/lib/supabase/server";

export type DiversifiedPick = {
  ticker: string;
  compositeScore: number;
  dataCompleteness: number;
  sector: string | null;
};

/**
 * Picks the top N candidates for a given scoring date, but caps how many
 * can come from the same sector (default: 2). Without this, the raw
 * top-N-by-score list can end up dominated by one correlated theme (e.g.
 * several memory/storage semiconductor names all scoring well together) -
 * which looks like 8 diversified picks but is really one concentrated bet.
 *
 * This is a candidate-SELECTION fix, not a change to the underlying
 * z-score math - the composite_score itself is still computed the same
 * way (still not sector-neutral, see the scoring engine's known
 * limitations). This just refuses to let too many of the final picks come
 * from one sector, regardless of how the raw scores rank.
 *
 * Used by both the daily email and the model performance tracker, so what
 * gets mailed and what gets tracked always match exactly.
 */
export async function pickDiversifiedCandidates(
  supabase: ReturnType<typeof getServiceSupabase>,
  asOfDate: string,
  opts: { topN: number; maxPerSector: number; minDataCompleteness: number }
): Promise<DiversifiedPick[]> {
  const { topN, maxPerSector, minDataCompleteness } = opts;

  // Pull a larger pool than topN so there's enough depth left to fill from
  // after skipping over-cap sectors.
  const { data: scoreRows } = await supabase
    .from("factor_scores")
    .select("ticker, composite_score, data_completeness")
    .eq("as_of_date", asOfDate)
    .not("composite_score", "is", null)
    .gte("data_completeness", minDataCompleteness)
    .order("composite_score", { ascending: false })
    .limit(Math.max(topN * 15, 100));

  if (!scoreRows || scoreRows.length === 0) return [];

  const tickers = scoreRows.map((r) => r.ticker);
  const { data: universeRows } = await supabase
    .from("universe")
    .select("ticker, sector")
    .in("ticker", tickers);
  const sectorByTicker = new Map((universeRows ?? []).map((r) => [r.ticker, r.sector ?? null]));

  const picks: DiversifiedPick[] = [];
  const sectorCounts: Record<string, number> = {};

  for (const row of scoreRows) {
    if (picks.length >= topN) break;
    const sector = sectorByTicker.get(row.ticker) ?? null;
    const sectorKey = sector ?? "Unknown";
    const count = sectorCounts[sectorKey] ?? 0;
    if (count >= maxPerSector) continue; // this sector's already at its cap - skip, try the next-best stock

    sectorCounts[sectorKey] = count + 1;
    picks.push({
      ticker: row.ticker,
      compositeScore: row.composite_score as number,
      dataCompleteness: row.data_completeness as number,
      sector,
    });
  }

  return picks;
}