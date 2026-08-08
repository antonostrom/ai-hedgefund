// Email clients don't support external stylesheets or most modern CSS, so
// everything here is inline styles and table-based layout - not because
// it's good practice, but because it's the only thing that renders
// consistently across Gmail, Outlook, and mobile mail apps.

type IndexSnapshot = {
  name: string;
  changePct: number | null;
};

type Candidate = {
  ticker: string;
  name: string | null;
  sector: string | null;
  compositeScore: number;
  dataCompleteness: number;
};

type RiskFlag = string;

export type ReportData = {
  dateLabel: string;
  indices: IndexSnapshot[];
  candidates: Candidate[];
  riskFlags: RiskFlag[];
  technicalFlags: string[];
  newsSummary: string[];
  portfolioNote: string | null;
  dataQualityNote: string | null;
};

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "";
  const color = n >= 0 ? "#16a34a" : "#dc2626";
  return `<span style="color:${color}">${sign}${(n * 100).toFixed(1)}%</span>`;
}

export function buildReportHtml(data: ReportData): string {
  const indexRows = data.indices
    .map(
      (i) => `
      <tr>
        <td style="padding:6px 12px 6px 0; color:#334155; font-size:14px;">${i.name}</td>
        <td style="padding:6px 0; font-size:14px; text-align:right;">${fmtPct(i.changePct)}</td>
      </tr>`
    )
    .join("");

  const candidateRows = data.candidates
    .map(
      (c) => `
      <tr>
        <td style="padding:8px 12px 8px 0; font-family:monospace; font-size:13px; color:#0f172a;">${c.ticker}</td>
        <td style="padding:8px 12px 8px 0; font-size:13px; color:#334155;">${c.name ?? "—"}</td>
        <td style="padding:8px 12px 8px 0; font-size:13px; color:#64748b;">${c.sector ?? "—"}</td>
        <td style="padding:8px 0; font-size:13px; text-align:right; font-family:monospace; color:#0f172a;">${c.compositeScore.toFixed(2)}</td>
      </tr>`
    )
    .join("");

  const riskFlagsHtml =
    data.riskFlags.length > 0
      ? `<ul style="margin:0; padding-left:18px; color:#334155; font-size:14px;">${data.riskFlags
          .map((f) => `<li style="margin-bottom:6px;">${f}</li>`)
          .join("")}</ul>`
      : `<p style="color:#64748b; font-size:14px; margin:0;">No flags today.</p>`;

  const technicalFlagsHtml =
    data.technicalFlags.length > 0
      ? `<ul style="margin:0; padding-left:18px; color:#334155; font-size:14px;">${data.technicalFlags
          .map((f) => `<li style="margin-bottom:6px;">${f}</li>`)
          .join("")}</ul>`
      : `<p style="color:#64748b; font-size:14px; margin:0;">No overbought/oversold or trend signals on your holdings today.</p>`;

  const newsSummaryHtml =
    data.newsSummary.length > 0
      ? `<ul style="margin:0; padding-left:18px; color:#334155; font-size:14px;">${data.newsSummary
          .map((line) => `<li style="margin-bottom:6px;">${line}</li>`)
          .join("")}</ul>`
      : `<p style="color:#64748b; font-size:14px; margin:0;">No news summary available today.</p>`;

  return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden;">
          <tr>
            <td style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
              <h1 style="margin:0; font-size:20px; color:#0f172a;">Morning Market Brief</h1>
              <p style="margin:4px 0 0; font-size:13px; color:#64748b;">${data.dateLabel}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px;">
              <h2 style="margin:0 0 12px; font-size:14px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b;">Overnight Markets</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${indexRows}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 24px;">
              <h2 style="margin:0 0 12px; font-size:14px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b;">Macro &amp; News</h2>
              ${newsSummaryHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 24px;">
              <h2 style="margin:0 0 12px; font-size:14px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b;">Top Ranked Candidates</h2>
              ${
                data.candidates.length > 0
                  ? `<table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:11px; text-transform:uppercase; color:#94a3b8; padding-bottom:4px;">Ticker</td>
                        <td style="font-size:11px; text-transform:uppercase; color:#94a3b8; padding-bottom:4px;">Name</td>
                        <td style="font-size:11px; text-transform:uppercase; color:#94a3b8; padding-bottom:4px;">Sector</td>
                        <td style="font-size:11px; text-transform:uppercase; color:#94a3b8; padding-bottom:4px; text-align:right;">Score</td>
                      </tr>
                      ${candidateRows}
                    </table>`
                  : `<p style="color:#64748b; font-size:14px; margin:0;">No scored candidates available yet.</p>`
              }
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 24px;">
              <h2 style="margin:0 0 12px; font-size:14px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b;">Portfolio Risk Flags</h2>
              ${riskFlagsHtml}
              ${
                data.portfolioNote
                  ? `<p style="margin:12px 0 0; font-size:13px; color:#94a3b8;">${data.portfolioNote}</p>`
                  : ""
              }
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 24px;">
              <h2 style="margin:0 0 12px; font-size:14px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b;">Technical Signals</h2>
              ${technicalFlagsHtml}
            </td>
          </tr>

          ${
            data.dataQualityNote
              ? `<tr>
                  <td style="padding:0 32px 24px;">
                    <div style="background-color:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:12px 16px; font-size:13px; color:#92400e;">
                      ${data.dataQualityNote}
                    </div>
                  </td>
                </tr>`
              : ""
          }

          <tr>
            <td style="padding:16px 32px; background-color:#f8fafc; border-top:1px solid #e2e8f0;">
              <p style="margin:0; font-size:12px; color:#94a3b8;">
                Generated automatically. Not investment advice - you make the trading decisions.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}