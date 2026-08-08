// Standard technical indicator formulas. All take an array of closes
// ordered OLDEST to NEWEST and return null when there isn't enough history
// yet - same "degrade gracefully" pattern used everywhere else in this
// pipeline, since price_history is still building up.

export function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Exponential moving average series, seeded with a plain SMA for the first value. */
function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prevEma = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prevEma;
  for (let i = period; i < values.length; i++) {
    const val = values[i] * k + prevEma * (1 - k);
    out[i] = val;
    prevEma = val;
  }
  return out;
}

/** Wilder's RSI - the standard formula used by most charting platforms. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += -diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type MacdResult = {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
};

/** MACD(12,26,9) - needs roughly 35 data points before the signal line is meaningful. */
export function macd(closes: number[]): MacdResult {
  const emaFast = emaSeries(closes, 12);
  const emaSlow = emaSeries(closes, 26);
  const macdLine = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i]! - emaSlow[i]! : null
  );
  const macdValues = macdLine.filter((v): v is number => v !== null);

  if (macdValues.length === 0) return { macd: null, signal: null, histogram: null };
  const macdLatest = macdValues[macdValues.length - 1];

  if (macdValues.length < 9) return { macd: macdLatest, signal: null, histogram: null };

  const signalSeries = emaSeries(macdValues, 9);
  const signal = signalSeries[signalSeries.length - 1];
  const histogram = signal !== null ? macdLatest - signal : null;

  return { macd: macdLatest, signal, histogram };
}