// Phase 1: market-based macro signals, all from Yahoo Finance tickers -
// no new API key or signup needed. Phase 2 (real economic data - CPI,
// unemployment, PMI, GDP) would need a FRED API integration and is
// intentionally not built here.
//
// NOTE on treasury yield tickers: Yahoo's ^TNX/^IRX/^FVX/^TYX tickers
// have historically shown inconsistent scaling across different data
// feeds (some divide by 10, some by 1000). As displayed on Yahoo
// Finance's own site, these come through as the direct percentage
// (e.g. 4.67 = 4.67%) - that's what this code assumes. After first
// deploy, sanity-check the displayed 10Y/3M yield values against any
// live source (e.g. cnbc.com/quotes) - if they're off by 10x or 1000x,
// the fix is a single divisor constant in the route, not a rewrite.

export type MacroKpiDef = {
  key: string;
  symbol: string;
  label: string;
  unit: "index" | "percent" | "usd";
  interpret?: (value: number) => { label: string; tone: "calm" | "watch" | "alert" } | null;
};

export const MACRO_KPIS: MacroKpiDef[] = [
  {
    key: "vix",
    symbol: "^VIX",
    label: "VIX (equity volatility)",
    unit: "index",
    interpret: (v) =>
      v >= 30
        ? { label: "Elevated - historically associated with market stress", tone: "alert" }
        : v >= 20
        ? { label: "Above average", tone: "watch" }
        : { label: "Calm", tone: "calm" },
  },
  {
    key: "yield10y",
    symbol: "^TNX",
    label: "10-Year Treasury Yield",
    unit: "percent",
  },
  {
    key: "yield3m",
    symbol: "^IRX",
    label: "3-Month Treasury Yield",
    unit: "percent",
  },
  {
    key: "dollarIndex",
    symbol: "DX-Y.NYB",
    label: "US Dollar Index",
    unit: "index",
  },
  {
    key: "gold",
    symbol: "GC=F",
    label: "Gold (safe-haven demand)",
    unit: "usd",
  },
  {
    key: "oil",
    symbol: "CL=F",
    label: "Crude Oil (growth/inflation)",
    unit: "usd",
  },
  {
    key: "highYield",
    symbol: "HYG",
    label: "High-Yield Bond ETF (risk appetite proxy)",
    unit: "usd",
  },
];

export function interpretYieldCurve(spread: number): { label: string; tone: "calm" | "watch" | "alert" } {
  if (spread < 0) {
    return {
      label: "Inverted - historically preceded US recessions by 6-24 months, though timing varies widely",
      tone: "alert",
    };
  }
  if (spread < 0.5) {
    return { label: "Flat - worth watching", tone: "watch" };
  }
  return { label: "Normal, upward-sloping", tone: "calm" };
}