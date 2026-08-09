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

type SeriesPoint = { date: string; portfolioPct: number | null; benchmarkPct: number | null };

type CurrencyBlock = {
  currency: string;
  benchmarkName: string | null;
  series: SeriesPoint[];
  currentValue: number | null;
  currentCostBasis: number | null;
  unrealizedPnlPct: number | null;
  note: string | null;
};

type PerformanceData = { currencies: CurrencyBlock[]; note?: string };

function fmtMoney(n: number, currency: string): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export default function PerformancePage() {
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState<PerformanceData | null>(null);
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
      const res = await fetch("/api/performance/portfolio", {
        headers: { "x-portfolio-key": accessKey },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load performance data");
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
          <h1 className="text-lg font-medium">Performance access</h1>
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
      <Nav />
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <header>
          <h1 className="text-xl font-medium">Portfolio performance</h1>
          <p className="text-sm text-slate-400">
            Value over time vs. a default benchmark index, by currency
          </p>
        </header>

        {loading && <p className="text-slate-500">Loading…</p>}
        {error && (
          <div className="rounded border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {data?.note && <p className="text-slate-400">{data.note}</p>}

        {data?.currencies.map((block) => (
          <section
            key={block.currency}
            className="rounded-lg border border-slate-800 bg-slate-900 p-5 space-y-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-medium">{block.currency} holdings</h2>
              {block.benchmarkName && (
                <span className="text-xs text-slate-500">vs. {block.benchmarkName}</span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Current value</div>
                <div className="font-mono text-lg">
                  {block.currentValue !== null ? fmtMoney(block.currentValue, block.currency) : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Cost basis</div>
                <div className="font-mono text-lg">
                  {block.currentCostBasis !== null
                    ? fmtMoney(block.currentCostBasis, block.currency)
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Unrealized P&amp;L</div>
                <div
                  className={`font-mono text-lg ${
                    block.unrealizedPnlPct === null
                      ? "text-slate-500"
                      : block.unrealizedPnlPct >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {block.unrealizedPnlPct !== null ? fmtPct(block.unrealizedPnlPct) : "—"}
                </div>
              </div>
            </div>

            {block.note && <p className="text-xs text-amber-400">{block.note}</p>}

            {block.series.length > 1 && (
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={block.series} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      minTickGap={40}
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                      width={45}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
                      labelStyle={{ color: "#94a3b8" }}
                      formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="portfolioPct"
                      name="Your portfolio"
                      stroke="#38bdf8"
                      dot={false}
                      strokeWidth={2}
                      connectNulls
                    />
                    {block.benchmarkName && (
                      <Line
                        type="monotone"
                        dataKey="benchmarkPct"
                        name={block.benchmarkName}
                        stroke="#f59e0b"
                        dot={false}
                        strokeWidth={2}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}