// Text width from the advance widths a theme carries (measured on its own font
// when the theme was built). No DOM is needed to lay out a figure; the overflow
// check in a real browser is what proves the estimate held.
export const METRIC_CHARS =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"
  + " éèêàâçôûîïëüöäÉ’‘“”–—…·×€°"
  // FD03 (A1, A8): French text. Narrow no-break space (the French thousands
  // separator and the space before ; ! ? %), guillemets, ligatures, accented capitals.
  + "\u202F«»œŒæÆÀÂÄÇÈÊËÎÏÔÖÙÛÜŸù";

// The characters a number is written with. A theme that sets a numeric variant
// (type.numeric, "tabular-nums") measures them with it, in type.metrics_numeric,
// and the variant is applied to numbers in columns only (bar values, cell values):
// in running text, Inter's tabular forms would widen the hyphen too (FD03).
export const NUMERIC_CHARS = "0123456789 \u00A0\u202F.,:;%+-\u2212\u2013()";

function table(theme, weight, m = theme.type.metrics) {
  const keys = Object.keys(m).map(Number).sort((a, b) => a - b);
  // nearest measured weight
  let best = keys[0];
  for (const k of keys) if (Math.abs(k - weight) < Math.abs(best - weight)) best = k;
  return m[best];
}

// { numeric: true }: the text is a number drawn with the theme's numeric variant.
export function textWidth(theme, s, size, weight = 400, { numeric = false } = {}) {
  const t = table(theme, weight);
  const num = numeric && theme.type.numeric && theme.type.metrics_numeric ? table(theme, weight, theme.type.metrics_numeric) : null;
  const fallback = t._fallback || t["n"];
  let w = 0;
  for (const ch of String(s ?? "")) w += (num?.[ch] ?? t[ch] ?? fallback);
  return (w / 1000) * size * (theme.type.safety || 1);
}

export function ellipsis(theme, s, room, size, weight = 400) {
  let t = String(s ?? "");
  if (textWidth(theme, t, size, weight) <= room) return t;
  while (t.length > 1 && textWidth(theme, t + "…", size, weight) > room) t = t.slice(0, -1);
  return t + "…";
}

// Runs: [{ text, bold }]. Greedy wrap on spaces, by measured width. Returns lines
// of runs. A single word wider than the room stays on its own line (never cut).
// Only an ordinary space, tab or newline is a break: a no-break space (U+00A0)
// or a narrow no-break space (U+202F, the French thousands separator) never is.
export function wrapRuns(theme, runs, room, size, weights = { regular: 400, bold: 700 }) {
  const words = [];
  for (const r of runs) {
    const parts = String(r.text).split(/([ \t\n\r]+)/);
    for (const p of parts) if (p !== "") words.push({ text: p, bold: !!r.bold, space: /^[ \t\n\r]+$/.test(p) });
  }
  const lines = [];
  let line = [], width = 0;
  const w = x => textWidth(theme, x.space ? " " : x.text, size, x.bold ? weights.bold : weights.regular);
  for (const x of words) {
    if (x.space) { if (line.length) { line.push({ text: " ", bold: x.bold, space: true }); width += w(x); } continue; }
    const ww = w(x);
    if (line.length && width + ww > room) {
      while (line.length && line[line.length - 1].space) line.pop();
      lines.push(line); line = []; width = 0;
    }
    line.push(x); width += ww;
  }
  while (line.length && line[line.length - 1].space) line.pop();
  if (line.length) lines.push(line);
  // merge adjacent runs of the same weight
  return lines.map(l => l.reduce((acc, x) => {
    const last = acc[acc.length - 1];
    if (last && last.bold === x.bold) last.text += x.text; else acc.push({ text: x.text, bold: x.bold });
    return acc;
  }, []));
}

export const wrapText = (theme, s, room, size, weight = 400) =>
  wrapRuns(theme, [{ text: s, bold: weight >= 600 }], room, size, { regular: weight, bold: weight })
    .map(l => l.map(r => r.text).join(""));

// "<b>8</b> of <b>17</b> ..." -> runs. Only <b> is admitted; anything else is a
// contract violation, raised rather than drawn.
export function htmlToRuns(html) {
  const runs = [];
  const re = /<b>([\s\S]*?)<\/b>|([^<]+)|(<[^>]*>)/g;
  let m;
  while ((m = re.exec(String(html)))) {
    if (m[3]) throw new Error(`sentence markup not allowed: ${m[3]}`);
    if (m[1] != null) runs.push({ text: decode(m[1]), bold: true });
    else runs.push({ text: decode(m[2]), bold: false });
  }
  return runs;
}
const decode = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
