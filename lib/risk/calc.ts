import { mean, stdDev } from "@/lib/pipeline/stats";

/** Simple day-over-day returns from a sequence of closes, ordered oldest to newest. */
export function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] === 0) continue;
    out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

/** Annualized volatility from daily returns (stdev * sqrt(252)). Null if too few data points to be meaningful. */
export function annualizedVolatility(returns: number[]): number | null {
  if (returns.length < 5) return null; // arbitrary but reasonable floor - fewer than this and the number is noise
  const sd = stdDev(returns);
  if (!Number.isFinite(sd)) return null;
  return sd * Math.sqrt(252);
}

/**
 * Pearson correlation between two return series. They must be aligned by
 * date BEFORE calling this (same length, same index = same date) - this
 * function does no date matching itself.
 */
export function pearsonCorrelation(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 5) return null;
  const meanA = mean(a);
  const meanB = mean(b);
  let num = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  if (denomA === 0 || denomB === 0) return null;
  return num / Math.sqrt(denomA * denomB);
}