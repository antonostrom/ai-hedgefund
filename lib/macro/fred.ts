// FRED (Federal Reserve Economic Data) client. This is the authoritative,
// official source for series like Treasury yields that Yahoo Finance
// doesn't cleanly cover (there's no reliable 2-year yield ticker on
// Yahoo - CBOE, whose index family Yahoo mirrors for ^TNX/^IRX/^FVX/^TYX,
// never published a 2-year version).
//
// Requires a free API key from fred.stlouisfed.org - no billing, just a
// signup. This is also the natural foundation for adding real economic
// data (CPI, unemployment, PMI) later, not just rates.

export type FredPoint = { date: string; value: number };

/**
 * Fetches a FRED series as {date, value} points, oldest first. FRED marks
 * missing observations (holidays, etc.) with the literal string "." -
 * those are filtered out rather than parsed as NaN.
 */
export async function fetchFredSeries(
  seriesId: string,
  apiKey: string,
  days: number
): Promise<FredPoint[]> {
  const observationStart = new Date();
  observationStart.setDate(observationStart.getDate() - days);
  const startStr = observationStart.toISOString().slice(0, 10);

  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startStr}&sort_order=asc`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const observations = data.observations ?? [];
    return observations
      .filter((o: { value: string }) => o.value !== ".")
      .map((o: { date: string; value: string }) => ({ date: o.date, value: parseFloat(o.value) }));
  } catch {
    return [];
  }
}