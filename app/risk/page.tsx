"use client";

import { useEffect, useState, useCallback } from "react";

type Holding = {
  ticker: string;
  shares: number;
  currency: string;
  account: string | null;
  latest_close: number | null;
  market_value: number | null;
  annualized_volatility: number | null;
  sector: string | null;
  country: string | null;
  region: string | null;
  price_data_points: number;
};

type Correlation = { pair: [string, string]; correlation: number | null };

type RiskData = {
  holdings: Holding[];
  exposure: {
    by_sector_count: Record<string, number>;
    by_country_count: Record<string, number>;
    by_currency_count: Record<string, number>;
    by_sector_value: Record<string, Record<string, number>>;
    by_country_value: Record<string, Record<string, number>>;
  };
  largest_position_by_currency: Record<string, { ticker: string; market_value: number }>;
  correlations: Correlation[];
  data_quality_note: string | null;
  note?: string;
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function BreakdownList({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-1">
      {entries.map(([key, count]) => (
        <div key={key} className="flex items-center justify-between text-sm">
          <span className="text-slate-300">{key}</span>
          <span className="text-slate-400">
            {count} ({pct(count / total)})
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RiskPage() {
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState<RiskData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("portfolio_access_key");
    if (stored) setAccessKey(stored);
  }, []);

  const load = useCallback(async () => {
    if (!accessKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/risk/portfolio", {
        headers: { "x-portfolio-key": accessKey },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load risk data");
    } finally {
      setLoading(false);
    }
  }, [accessKey]);

  useEffect(() => {
    if (accessKey) load();
  }, [accessKey, load]);

  function handleUnlock() {
    window.localStorage.setItem("portfolio_access_key", keyInput);
    setAccessKey(keyInput);
  }

  if (!accessKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-lg font-medium">Risk dashboard access</h1>
          <input
            type="password"
            placeholder="Access key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
          <button
            onClick={handleUnlock}
            className="w-full rounded bg-slate-100 py-2 text-sm font-medium text-slate-950 hover:bg-white"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <header>
          <h1 className="text-xl font-medium">Portfolio risk</h1>
          <p className="text-sm text-slate-400">
            Exposure, volatility, and correlation across your holdings
          </p>
        </header>

        {loading && <p className="text-slate-500">Loading…</p>}
        {error && (
          <div className="rounded border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {data?.note && <p className="text-slate-400">{data.note}</p>}

        {data?.data_quality_note && (
          <div className="rounded border border-amber-900 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
            {data.data_quality_note}
          </div>
        )}

        {data && data.holdings.length > 0 && (
          <>
            <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                Holdings
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-4">Ticker</th>
                      <th className="py-2 pr-4">Shares</th>
                      <th className="py-2 pr-4 text-right">Market value</th>
                      <th className="py-2 pr-4">Sector</th>
                      <th className="py-2 pr-4 text-right">Ann. volatility</th>
                      <th className="py-2 pr-4 text-right">Price days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.holdings.map((h) => (
                      <tr key={h.ticker} className="border-b border-slate-900">
                        <td className="py-2 pr-4 font-mono">{h.ticker}</td>
                        <td className="py-2 pr-4">{h.shares}</td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {h.market_value !== null
                            ? `${h.market_value.toFixed(2)} ${h.currency}`
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 text-slate-400">{h.sector ?? "—"}</td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {h.annualized_volatility !== null
                            ? pct(h.annualized_volatility)
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right text-slate-500">
                          {h.price_data_points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-6 sm:grid-cols-2">
              <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                  Sector exposure (by position count)
                </h2>
                <BreakdownList counts={data.exposure.by_sector_count} />
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                  Currency exposure (by position count)
                </h2>
                <BreakdownList counts={data.exposure.by_currency_count} />
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                  Country exposure (by position count)
                </h2>
                <BreakdownList counts={data.exposure.by_country_count} />
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                  Largest position per currency
                </h2>
                <div className="space-y-1">
                  {Object.entries(data.largest_position_by_currency).map(
                    ([currency, pos]) => (
                      <div
                        key={currency}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-slate-300">{currency}</span>
                        <span className="font-mono text-slate-400">
                          {pos.ticker} ({pos.market_value.toFixed(2)})
                        </span>
                      </div>
                    )
                  )}
                </div>
              </section>
            </div>

            <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                Pairwise correlation
              </h2>
              {data.correlations.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Need at least 2 holdings to compute correlation.
                </p>
              ) : (
                <div className="space-y-1">
                  {data.correlations.map(({ pair, correlation }) => (
                    <div
                      key={pair.join("-")}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-mono text-slate-300">
                        {pair[0]} / {pair[1]}
                      </span>
                      <span
                        className={`font-mono ${
                          correlation !== null && correlation > 0.7
                            ? "text-amber-400"
                            : "text-slate-400"
                        }`}
                      >
                        {correlation !== null ? correlation.toFixed(2) : "insufficient data"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}