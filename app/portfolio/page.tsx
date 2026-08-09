"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/app/components/Nav";

type Holding = {
  id: string;
  ticker: string;
  name: string | null;
  asset_type: "stock" | "etf";
  exchange: string | null;
  currency: string;
  shares: number;
  cost_basis: number | null;
  account: string | null;
  notes: string | null;
  date_added: string;
};

const EMPTY_FORM = {
  ticker: "",
  name: "",
  asset_type: "stock" as "stock" | "etf",
  exchange: "",
  currency: "SEK",
  shares: "",
  cost_basis: "",
  account: "",
  notes: "",
};

export default function PortfolioPage() {
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("portfolio_access_key");
    if (stored) setAccessKey(stored);
  }, []);

  const authHeaders = useCallback(
    () => ({
      "Content-Type": "application/json",
      "x-portfolio-key": accessKey ?? "",
    }),
    [accessKey]
  );

  const loadHoldings = useCallback(async () => {
    if (!accessKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const data = await res.json();
      setHoldings(data.holdings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load holdings");
    } finally {
      setLoading(false);
    }
  }, [accessKey, authHeaders]);

  useEffect(() => {
    if (accessKey) loadHoldings();
  }, [accessKey, loadHoldings]);

  function handleUnlock() {
    window.localStorage.setItem("portfolio_access_key", keyInput);
    setAccessKey(keyInput);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(h: Holding) {
    setEditingId(h.id);
    setForm({
      ticker: h.ticker,
      name: h.name ?? "",
      asset_type: h.asset_type,
      exchange: h.exchange ?? "",
      currency: h.currency,
      shares: String(h.shares),
      cost_basis: h.cost_basis != null ? String(h.cost_basis) : "",
      account: h.account ?? "",
      notes: h.notes ?? "",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      ...form,
      shares: parseFloat(form.shares),
      cost_basis: form.cost_basis ? parseFloat(form.cost_basis) : null,
    };

    try {
      const res = editingId
        ? await fetch(`/api/portfolio/${editingId}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          })
        : await fetch("/api/portfolio", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

      if (!res.ok) throw new Error((await res.json()).error || "Save failed");

      resetForm();
      loadHoldings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this holding?")) return;
    try {
      const res = await fetch(`/api/portfolio/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      loadHoldings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (!accessKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-lg font-medium">Portfolio access</h1>
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

  const totalPositions = holdings.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Nav />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-medium">Portfolio holdings</h1>
            <p className="text-sm text-slate-400">
              {totalPositions} position{totalPositions === 1 ? "" : "s"}
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="mb-8 grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:grid-cols-4"
        >
          <input
            required
            placeholder="Ticker (e.g. AAPL, SCHD)"
            value={form.ticker}
            onChange={(e) => setForm({ ...form, ticker: e.target.value })}
            className="col-span-2 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-slate-500 sm:col-span-1"
          />
          <input
            placeholder="Name (optional)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-slate-500 sm:col-span-1"
          />
          <select
            value={form.asset_type}
            onChange={(e) =>
              setForm({ ...form, asset_type: e.target.value as "stock" | "etf" })
            }
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
          >
            <option value="stock">Stock</option>
            <option value="etf">ETF</option>
          </select>
          <input
            placeholder="Exchange (OMX, NASDAQ...)"
            value={form.exchange}
            onChange={(e) => setForm({ ...form, exchange: e.target.value })}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
          />
          <input
            required
            type="number"
            step="any"
            placeholder="Shares"
            value={form.shares}
            onChange={(e) => setForm({ ...form, shares: e.target.value })}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
          />
          <input
            type="number"
            step="any"
            placeholder="Cost basis / share"
            value={form.cost_basis}
            onChange={(e) => setForm({ ...form, cost_basis: e.target.value })}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
          />
          <input
            placeholder="Currency"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
          />
          <input
            placeholder="Account (ISK, KF...)"
            value={form.account}
            onChange={(e) => setForm({ ...form, account: e.target.value })}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
          />
          <input
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="col-span-2 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-slate-500 sm:col-span-2"
          />
          <div className="col-span-2 flex gap-2 sm:col-span-4">
            <button
              type="submit"
              className="rounded bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-950 hover:bg-white"
            >
              {editingId ? "Save changes" : "Add holding"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded border border-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:border-slate-500"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Shares</th>
                <th className="px-3 py-2 text-right">Cost basis</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && holdings.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                    No holdings yet. Add your first position above.
                  </td>
                </tr>
              )}
              {holdings.map((h) => (
                <tr key={h.id} className="border-b border-slate-900 hover:bg-slate-900/50">
                  <td className="px-3 py-2 font-mono">{h.ticker}</td>
                  <td className="px-3 py-2 text-slate-400">{h.asset_type}</td>
                  <td className="px-3 py-2 text-right font-mono">{h.shares}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {h.cost_basis ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{h.currency}</td>
                  <td className="px-3 py-2 text-slate-400">{h.account ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => startEdit(h)}
                      className="mr-3 text-slate-400 hover:text-slate-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}