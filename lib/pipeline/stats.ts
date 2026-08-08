// Cross-sectional z-score helpers. "Cross-sectional" means we're comparing
// each ticker against the rest of the universe at a single point in time -
// not against its own history. A z-score of +1.5 on `value_score` means
// "this stock looks cheap relative to the other ~600 names scored today,"
// not "cheap relative to where it usually trades."

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Computes a z-score map for a single metric across the universe.
 * `invert: true` for metrics where LOWER is better (e.g. P/E, debt/equity) -
 * this flips the sign so a high z-score always means "good" regardless of
 * the underlying metric's natural direction.
 */
export function zScoreMap(
  rawValues: Record<string, number | null>,
  invert = false
): Record<string, number | null> {
  const clean = Object.values(rawValues).filter(
    (v): v is number => v !== null && Number.isFinite(v)
  );
  const m = mean(clean);
  const sd = stdDev(clean);

  const out: Record<string, number | null> = {};
  for (const [ticker, value] of Object.entries(rawValues)) {
    if (value === null || !Number.isFinite(value) || !Number.isFinite(sd) || sd === 0) {
      out[ticker] = null;
      continue;
    }
    const z = (value - m) / sd;
    out[ticker] = invert ? -z : z;
  }
  return out;
}

/** Averages an array of (possibly null) numbers, skipping nulls. Returns null if all are null. */
export function averageSkipNull(values: (number | null)[]): number | null {
  const clean = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (clean.length === 0) return null;
  return mean(clean);
}