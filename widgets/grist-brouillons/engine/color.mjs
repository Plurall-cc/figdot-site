// Colour measures, pure (no Node module): WCAG 2.x contrast, CIE76 colour
// difference in CIELAB, and colour-vision simulation (Machado, Oliveira and
// Fernandes 2009, severity 1.0). Moved from tools/theme-report.mjs in FD04, for
// the profile validator (capabilities.mjs).
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const unlin = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const L = h => { const [r, g, b] = hexRgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const M = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
export const simulate = (h, kind) => {
  if (kind === "normal") return h;
  const c = hexRgb(h).map(lin);
  const o = M[kind].map(row => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])));
  return "#" + o.map(v => Math.round(unlin(v) * 255).toString(16).padStart(2, "0")).join("");
};
export const lab = h => {
  const [r, g, b] = hexRgb(h).map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b,
        Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
export const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };


// ---------- OKLab (Björn Ottosson, 2020), pour dériver des couleurs (D63, FD05) ----------
// Un mélange en OKLab garde une teinte et une clarté qui varient régulièrement : c'est ce qu'il faut pour
// intercaler une marche dans une rampe ou un gris entre l'encre et le papier.
export const toOklab = h => {
  const [r, g, b] = hexRgb(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
export const fromOklab = ([L_, a, b]) => {
  const l = (L_ + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L_ - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L_ - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return "#" + rgb.map(v => Math.round(Math.min(1, Math.max(0, unlin(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
};
// t = 0 : a ; t = 1 : b
export const mix = (a, b, t) => { const p = toOklab(a), q = toOklab(b); return fromOklab(p.map((v, i) => v + (q[i] - v) * t)); };
