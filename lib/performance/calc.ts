// Default benchmark per currency - the index a holding in that currency
// gets compared against. Not exhaustive; a currency without an entry here
// just shows portfolio performance with no benchmark line, rather than
// guessing at an inappropriate comparison.
export const BENCHMARKS: Record<string, { symbol: string; name: string }> = {
  SEK: { symbol: "^OMX", name: "OMX Stockholm 30" },
  USD: { symbol: "^GSPC", name: "S&P 500" },
  EUR: { symbol: "^STOXX50E", name: "Euro Stoxx 50" },
  GBP: { symbol: "^FTSE", name: "FTSE 100" },
  NOK: { symbol: "^OSEBX", name: "Oslo Bors Benchmark" },
  DKK: { symbol: "^OMXC25", name: "OMX Copenhagen 25" },
};

export type PricePoint = { date: string; close: number };

/**
 * Builds a forward-filled value series for one holding: for each date in
 * `allDates` on/after the holding's inclusion start (max of date_added and
 * its first available price), uses the most recent known close (carrying
 * forward through gaps) multiplied by shares. Before inclusion start,
 * contributes 0 - the holding "didn't exist in the portfolio yet."
 */
export function buildHoldingSeries(
  allDates: string[],
  prices: PricePoint[],
  shares: number,
  dateAdded: string
): number[] {
  if (prices.length === 0) return allDates.map(() => 0);
  const priceMap = new Map(prices.map((p) => [p.date, p.close]));
  const firstPriceDate = prices[0].date;
  const inclusionStart = dateAdded > firstPriceDate ? dateAdded : firstPriceDate;

  let lastKnownClose: number | null = null;
  return allDates.map((date) => {
    if (date < inclusionStart) return 0;
    if (priceMap.has(date)) lastKnownClose = priceMap.get(date)!;
    return lastKnownClose !== null ? lastKnownClose * shares : 0;
  });
}

/** Normalizes a value series to % change from its first non-zero value. Returns nulls before that point. */
export function normalizeToPct(values: number[]): (number | null)[] {
  const baseIdx = values.findIndex((v) => v > 0);
  if (baseIdx === -1) return values.map(() => null);
  const base = values[baseIdx];
  return values.map((v, i) => (i < baseIdx ? null : ((v - base) / base) * 100));
}