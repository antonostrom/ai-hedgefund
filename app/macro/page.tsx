"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import Nav from "@/app/components/Nav";

type Kpi = {
  key: string;
  label: string;
  unit: string;
  current: number | null;
  change1d: number | null;
  change1w: number | null;
  change1m: number | null;
  interpretation: { label: string; tone: "calm" | "watch" | "alert" } | null;
  note: string | null;
};

type MacroData = {
  kpis: Kpi[];
  yieldCurve: { currentSpread: number; interpretation: { label: string; tone: string } } | null;
  yieldCurveSeries: { date: string; spread: number }[];
  vixSeries: { date: string; value: number }[];
  asOf: string;
};

function fmtVal(n: number, unit: string): string {
  if (unit === "percent") return `${n.toFixed(2)}%`;
  if (unit === "usd") return `$${n.toFixed(2)}`;
  return n.toFixed(2);
}

function fmtChange(n: number | null): string {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function toneColor(tone: string): string {
  if (tone === "alert") return "text-red-400";
  if (tone === "watch") return "text-amber-400";
  return "text-green-400";
}

export default function MacroPage() {
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState<MacroData | null>(null);
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
      const res = await fetch("/api/macro", { headers: { "x-portfolio-key": accessKey } });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load macro data");
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
          <h1 className="text-lg font-medium">Macro dashboard access</h1>
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
          <h1 className="text-xl font-medium">Macro dashboard</h1>
          <p className="text-sm text-slate-400">
            Market-based risk &amp; sentiment signals — not economic data (see note below)
          </p>
        </header>

        {loading && <p className="text-slate-500">Loading…</p>}
        {error && (
          <div className="rounded border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {data.kpis.map((k) => (
                <div key={k.key} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{k.label}</div>
                  {k.current !== null ? (
                    <>
                      <div className="mt-1 font-mono text-2xl">{fmtVal(k.current, k.unit)}</div>
                      <div className="mt-1 flex gap-4 text-xs text-slate-400">
                        <span>1D {fmtChange(k.change1d)}</span>
                        <span>1W {fmtChange(k.change1w)}</span>
                        <span>1M {fmtChange(k.change1m)}</span>
                      </div>
                      {k.interpretation && (
                        <div className={`mt-2 text-xs ${toneColor(k.interpretation.tone)}`}>
                          {k.interpretation.label}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-1 text-sm text-amber-400">{k.note}</div>
                  )}
                </div>
              ))}

              {data.yieldCurve && (
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Yield Curve (10Y − 3M)
                  </div>
                  <div className="mt-1 font-mono text-2xl">
                    {data.yieldCurve.currentSpread.toFixed(2)}%
                  </div>
                  <div className={`mt-2 text-xs ${toneColor(data.yieldCurve.interpretation.tone)}`}>
                    {data.yieldCurve.interpretation.label}
                  </div>
                </div>
              )}
            </div>

            {data.yieldCurveSeries.length > 1 && (
              <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                  Yield curve trend (10Y − 3M, last 90 days)
                </h2>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <LineChart data={data.yieldCurveSeries}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} minTickGap={40} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={45} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
                        labelStyle={{ color: "#94a3b8" }}
                        formatter={(value: any) => `${Number(value).toFixed(2)}%`}
                      />
                      <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="spread" stroke="#38bdf8" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Red dashed line marks zero — below it, the curve is inverted.
                </p>
              </section>
            )}

            {data.vixSeries.length > 1 && (
              <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
                  VIX trend (last 90 days)
                </h2>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <LineChart data={data.vixSeries}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} minTickGap={40} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} width={45} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
                        labelStyle={{ color: "#94a3b8" }}
                      />
                      <ReferenceLine y={20} stroke="#f59e0b" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="value" stroke="#a78bfa" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Amber dashed line marks 20 — a commonly cited threshold for "above-average" volatility.
                </p>
              </section>
            )}

            <div className="rounded border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs text-slate-500">
              These are market-based signals derived from index/ETF prices — not official economic data
              (CPI, unemployment, PMI, GDP). Interpretations describe historical associations, not
              predictions. Adding real economic indicators would need a separate data source (e.g. FRED)
              and is a natural next phase, not built yet.
            </div>
          </>
        )}
      </div>
    </div>
  );
}