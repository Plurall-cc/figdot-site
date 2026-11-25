export const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const n1 = v => (Math.round(v * 10) / 10).toString();

export function attrs(o) {
  return Object.entries(o).filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
}

export const text = (x, y, s, a = {}) =>
  `<text${attrs({ x: n1(x), y: n1(y), ...a })}>${esc(s)}</text>`;

export const rect = (x, y, w, h, a = {}) =>
  `<rect${attrs({ x: n1(x), y: n1(y), width: n1(Math.max(0, w)), height: n1(Math.max(0, h)), ...a })}/>`;

export const line = (x1, y1, x2, y2, a = {}) =>
  `<line${attrs({ x1: n1(x1), y1: n1(y1), x2: n1(x2), y2: n1(y2), ...a })}/>`;
