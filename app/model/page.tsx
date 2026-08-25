"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Nav from "@/app/components/Nav";

type SeriesPoint = {
  date: string;
  candidateCumPct: number | null;
  benchmarkCumPct: number | null;
  pickedTickers: string[];
};

type Summary = {
  daysTracked: number;
  candidateTotalReturnPct: number | null;
  benchmarkTotalReturnPct: number | null;
  winRateVsBenchmark: number | null;
  latestPicks: string[];
};

type ModelData = { series: SeriesPoint[]; summary: Summary | null; note: string | null; excludeSector?: string | null };

// Common GICS sectors seen across the universe - "None" means no filter.
const SECTOR_OPTIONS = [
  "None",
  "Information Technology",
  "Financials",
  "Industrials",
  "Health Care",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Materials",
  "Real Estate",
  "Utilities",
  "Communication Services",
];

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export default function ModelPage() {
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState<ModelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excludeSector, setExcludeSector] = useState("None");

  useEffect(() => {
    const stored = window.localStorage.getItem("portfolio_access_key");
    if (stored) setAccessKey(stored);
  }, []);

  const load = useCallback(async () => {
    if (!accessKey) return;
    setLoading(true);
    setError(null);
    try {
      const url =
        excludeSector !== "None"
          ? `/api/model/performance?excludeSector=${encodeURIComponent(excludeSector)}`
          : "/api/model/performance";
      const res = await fetch(url, {
        headers: { "x-portfolio-key": accessKey },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load model performance");
    } finally {
      setLoading(false);
    }
  }, [accessKey, excludeSector]);

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
          <h1 className="text-lg font-medium">Model tracking access</h1>
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

  const s = data?.summary;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Nav />
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <header>
          <h1 className="text-xl font-medium">Model performance</h1>
          <p className="text-sm text-slate-400">
            Equal-weighted, daily-rebalanced top-8 picks vs. S&amp;P 500 — does the ranking model
            actually have an edge?
          </p>
        </header>

        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-400" htmlFor="sector-filter">
            Exclude sector:
          </label>
          <select
            id="sector-filter"
            value={excludeSector}
            onChange={(e) => setExcludeSector(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-500"
          >
            {SECTOR_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {excludeSector !== "None" && (
            <span className="text-xs text-slate-500">
              Recomputed from that day's actual picks, minus any {excludeSector} names — not a
              re-simulation with replacement stocks.
            </span>
          )}
        </div>

        {loading && <p className="text-slate-500">Loading…</p>}
        {error && (
          <div className="rounded border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {data?.note && (
          <div className="rounded border border-amber-900 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
            {data.note}
          </div>
        )}

        {s && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Days tracked</div>
              <div className="mt-1 font-mono text-2xl">{s.daysTracked}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Candidate return</div>
              <div
                className={`mt-1 font-mono text-2xl ${
                  s.candidateTotalReturnPct !== null && s.candidateTotalReturnPct >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {fmtPct(s.candidateTotalReturnPct)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">S&amp;P 500 return</div>
              <div className="mt-1 font-mono text-2xl text-slate-300">
                {fmtPct(s.benchmarkTotalReturnPct)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Win rate vs. index</div>
              <div className="mt-1 font-mono text-2xl">
                {s.winRateVsBenchmark !== null ? `${(s.winRateVsBenchmark * 100).toFixed(0)}%` : "—"}
              </div>
            </div>
          </div>
        )}

        {data && data.series.length > 1 && (
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
              Cumulative return
            </h2>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={data.series} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} minTickGap={40} />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
                    labelStyle={{ color: "#94a3b8" }}
                    formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="candidateCumPct"
                    name="Top-8 candidates (equal-weight)"
                    stroke="#38bdf8"
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmarkCumPct"
                    name="S&P 500"
                    stroke="#f59e0b"
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {s && s.latestPicks.length > 0 && (
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
              Most recent picks (currently being held forward)
            </h2>
            <div className="flex flex-wrap gap-2">
              {s.latestPicks.map((t) => (
                <span
                  key={t}
                  className="rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-300"
                >
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        <div className="rounded border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs text-slate-500">
          Methodology: each scoring run's top 8 (by composite_score, min. 50% data completeness,
          capped at 2 picks per sector) are held equally-weighted until the next scoring run, then
          re-picked from scratch. This tests whether the ranking signal itself has predictive value
          — not a real portfolio, no fees or slippage modeled, and only tracked from when daily
          scoring began (not a retroactive backtest). The sector filter above removes matching names
          from each day's actual picks before averaging — it does not simulate picking a replacement
          stock in their place.
        </div>
      </div>
    </div>
  );
}