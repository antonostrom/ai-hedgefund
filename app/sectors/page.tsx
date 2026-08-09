"use client";

import { useEffect, useState, useCallback } from "react";

type SectorAggregate = {
  sector: string;
  avgScore: number;
  positions: number;
  priorAvgScore: number | null;
  delta: number | null;
};

type SectorRotationResult = {
  currentDate: string | null;
  priorDate: string | null;
  sectors: SectorAggregate[];
};

function fmtScore(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

export default function SectorsPage() {
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState<SectorRotationResult | null>(null);
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
      const res = await fetch("/api/research/sectors", {
        headers: { "x-portfolio-key": accessKey },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sector data");
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
          <h1 className="text-lg font-medium">Sector rotation access</h1>
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
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <header>
          <h1 className="text-xl font-medium">Sector rotation</h1>
          <p className="text-sm text-slate-400">
            Average factor score by sector, from the most recent scoring run
            {data?.currentDate ? ` (${data.currentDate})` : ""}
          </p>
        </header>

        {loading && <p className="text-slate-500">Loading…</p>}
        {error && (
          <div className="rounded border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {data && !data.priorDate && data.sectors.length > 0 && (
          <div className="rounded border border-amber-900 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
            Not enough weekly scoring history yet to show rotation (change
            over time) - this needs roughly 4 weeks of Sunday scoring runs
            to compare against. Showing the current sector leaderboard
            only for now.
          </div>
        )}

        {data && data.sectors.length === 0 && (
          <p className="text-slate-500">No scored data available yet.</p>
        )}

        {data && data.sectors.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2 text-right">Positions</th>
                  <th className="px-3 py-2 text-right">Avg score</th>
                  <th className="px-3 py-2 text-right">
                    Change {data.priorDate ? `(vs ${data.priorDate})` : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.sectors.map((s) => (
                  <tr key={s.sector} className="border-b border-slate-900">
                    <td className="px-3 py-2">{s.sector}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{s.positions}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtScore(s.avgScore)}</td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        s.delta === null
                          ? "text-slate-600"
                          : s.delta > 0
                          ? "text-green-400"
                          : s.delta < 0
                          ? "text-red-400"
                          : "text-slate-400"
                      }`}
                    >
                      {s.delta === null ? "—" : fmtScore(s.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}