// Nordic and continental European large-caps, maintained by hand rather than
// scraped - there's no clean free source for full STOXX 600 constituents.
// This is a starting set covering the names most likely relevant to a
// Stockholm-based investor; extend freely.

export type CuratedStock = {
  ticker: string;   // Yahoo Finance format
  name: string;
  country: string;
  sector?: string;
};

export const CURATED_EUROPE: CuratedStock[] = [
  // Sweden - OMX Stockholm large cap
  { ticker: "VOLV-B.ST", name: "Volvo B", country: "Sweden", sector: "Industrials" },
  { ticker: "ATCO-A.ST", name: "Atlas Copco A", country: "Sweden", sector: "Industrials" },
  { ticker: "INVE-B.ST", name: "Investor B", country: "Sweden", sector: "Financials" },
  { ticker: "ERIC-B.ST", name: "Ericsson B", country: "Sweden", sector: "Information Technology" },
  { ticker: "HM-B.ST", name: "H&M B", country: "Sweden", sector: "Consumer Discretionary" },
  { ticker: "SAND.ST", name: "Sandvik", country: "Sweden", sector: "Industrials" },
  { ticker: "SEB-A.ST", name: "SEB A", country: "Sweden", sector: "Financials" },
  { ticker: "SWED-A.ST", name: "Swedbank A", country: "Sweden", sector: "Financials" },
  { ticker: "SHB-A.ST", name: "Handelsbanken A", country: "Sweden", sector: "Financials" },
  { ticker: "ESSITY-B.ST", name: "Essity B", country: "Sweden", sector: "Consumer Staples" },
  { ticker: "EQT.ST", name: "EQT", country: "Sweden", sector: "Financials" },
  { ticker: "EVO.ST", name: "Evolution", country: "Sweden", sector: "Consumer Discretionary" },
  { ticker: "SKF-B.ST", name: "SKF B", country: "Sweden", sector: "Industrials" },
  { ticker: "ALFA.ST", name: "Alfa Laval", country: "Sweden", sector: "Industrials" },
  { ticker: "HEXA-B.ST", name: "Hexagon B", country: "Sweden", sector: "Information Technology" },

  // Norway
  { ticker: "EQNR.OL", name: "Equinor", country: "Norway", sector: "Energy" },
  { ticker: "DNB.OL", name: "DNB Bank", country: "Norway", sector: "Financials" },
  { ticker: "MOWI.OL", name: "Mowi", country: "Norway", sector: "Consumer Staples" },
  { ticker: "TEL.OL", name: "Telenor", country: "Norway", sector: "Communication Services" },
  { ticker: "NHY.OL", name: "Norsk Hydro", country: "Norway", sector: "Materials" },

  // Denmark
  { ticker: "NOVO-B.CO", name: "Novo Nordisk B", country: "Denmark", sector: "Health Care" },
  { ticker: "DSV.CO", name: "DSV", country: "Denmark", sector: "Industrials" },
  { ticker: "MAERSK-B.CO", name: "Maersk B", country: "Denmark", sector: "Industrials" },
  { ticker: "ORSTED.CO", name: "Orsted", country: "Denmark", sector: "Utilities" },
  { ticker: "CARL-B.CO", name: "Carlsberg B", country: "Denmark", sector: "Consumer Staples" },

  // Finland
  { ticker: "NOKIA.HE", name: "Nokia", country: "Finland", sector: "Information Technology" },
  { ticker: "KNEBV.HE", name: "KONE", country: "Finland", sector: "Industrials" },
  { ticker: "SAMPO.HE", name: "Sampo", country: "Finland", sector: "Financials" },
  { ticker: "WRT1V.HE", name: "Wartsila", country: "Finland", sector: "Industrials" },
  { ticker: "NDA-FI.HE", name: "Nordea Bank", country: "Finland", sector: "Financials" },

  // Germany (DAX 40 core names)
  { ticker: "SAP.DE", name: "SAP", country: "Germany", sector: "Information Technology" },
  { ticker: "SIE.DE", name: "Siemens", country: "Germany", sector: "Industrials" },
  { ticker: "ALV.DE", name: "Allianz", country: "Germany", sector: "Financials" },
  { ticker: "DTE.DE", name: "Deutsche Telekom", country: "Germany", sector: "Communication Services" },
  { ticker: "MBG.DE", name: "Mercedes-Benz Group", country: "Germany", sector: "Consumer Discretionary" },

  // France (CAC 40 core names)
  { ticker: "MC.PA", name: "LVMH", country: "France", sector: "Consumer Discretionary" },
  { ticker: "OR.PA", name: "L'Oreal", country: "France", sector: "Consumer Staples" },
  { ticker: "TTE.PA", name: "TotalEnergies", country: "France", sector: "Energy" },
  { ticker: "SAN.PA", name: "Sanofi", country: "France", sector: "Health Care" },
  { ticker: "AI.PA", name: "Air Liquide", country: "France", sector: "Materials" },

  // Switzerland
  { ticker: "NESN.SW", name: "Nestle", country: "Switzerland", sector: "Consumer Staples" },
  { ticker: "ROG.SW", name: "Roche", country: "Switzerland", sector: "Health Care" },
  { ticker: "NOVN.SW", name: "Novartis", country: "Switzerland", sector: "Health Care" },
  { ticker: "UBSG.SW", name: "UBS Group", country: "Switzerland", sector: "Financials" },

  // Netherlands
  { ticker: "ASML.AS", name: "ASML", country: "Netherlands", sector: "Information Technology" },
  { ticker: "ADYEN.AS", name: "Adyen", country: "Netherlands", sector: "Information Technology" },
  { ticker: "AD.AS", name: "Ahold Delhaize", country: "Netherlands", sector: "Consumer Staples" },
];