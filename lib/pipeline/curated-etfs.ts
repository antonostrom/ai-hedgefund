// Hand-picked dividend/income ETFs. Unlike stocks, these aren't "scanned" -
// there's no meaningful universe-wide filter for ETFs the way there is for
// stocks (P/E, ROIC etc don't apply). This list is the selection step itself.
//
// Add/remove tickers here as your own conviction changes. Ticker format is
// Yahoo Finance's - note the exchange suffix on non-US listings.

export type CuratedEtf = {
  ticker: string;
  name: string;
  region: string;
  currency: string;
};

export const CURATED_DIVIDEND_ETFS: CuratedEtf[] = [
  // US - broad dividend / quality
  { ticker: "SCHD", name: "Schwab US Dividend Equity ETF", region: "US", currency: "USD" },
  { ticker: "VYM", name: "Vanguard High Dividend Yield ETF", region: "US", currency: "USD" },
  { ticker: "VIG", name: "Vanguard Dividend Appreciation ETF", region: "US", currency: "USD" },
  { ticker: "HDV", name: "iShares Core High Dividend ETF", region: "US", currency: "USD" },
  { ticker: "DGRO", name: "iShares Core Dividend Growth ETF", region: "US", currency: "USD" },
  { ticker: "SPYD", name: "SPDR Portfolio S&P 500 High Dividend ETF", region: "US", currency: "USD" },

  // US - covered call / income (higher yield, different risk profile - flag distinctly in reports)
  { ticker: "JEPI", name: "JPMorgan Equity Premium Income ETF", region: "US", currency: "USD" },
  { ticker: "JEPQ", name: "JPMorgan Nasdaq Equity Premium Income ETF", region: "US", currency: "USD" },
  { ticker: "QYLD", name: "Global X Nasdaq 100 Covered Call ETF", region: "US", currency: "USD" },

  // Europe / global ex-US
  { ticker: "VHYL.L", name: "Vanguard FTSE All-World High Dividend Yield UCITS ETF", region: "Europe", currency: "USD" },
  { ticker: "IDVY.L", name: "iShares Euro Dividend UCITS ETF", region: "Europe", currency: "EUR" },
  { ticker: "FUSD.L", name: "Fidelity US Quality Income UCITS ETF", region: "US", currency: "USD" },
  { ticker: "TDIV.AS", name: "VanEck Morningstar Developed Markets Dividend Leaders", region: "Global", currency: "EUR" },

  // Nordics
  { ticker: "XACTHDIV.ST", name: "Xact Högutdelande", region: "Nordics", currency: "SEK" },

  // Global broad
  { ticker: "VEA", name: "Vanguard FTSE Developed Markets ETF", region: "Global ex-US", currency: "USD" },
  { ticker: "VXUS", name: "Vanguard Total International Stock ETF", region: "Global ex-US", currency: "USD" },
];
