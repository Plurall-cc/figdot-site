// Spec form "bars": one horizontal bar per row, coloured by a class the
// collection names, an optional reference mark, a value column with its header,
// and rows that were not measured shown as words, never as a zero-length bar.
//
// encoded: { rows: [{ label, value, cls, missing_text, extra? }] }
// spec:    { kind: "bars", classes: { <cls>: { color, legend } }, mark: { at, label },
//            tail_header, missing_class, extra?: { header, unit?, decimals? } }
//
// FD10 : `extra`, une seconde colonne de nombres à droite, pour une mesure d'une autre nature que celle dessinée (une
// barre par pays, une colonne de personnes), avec son en-tête et son unité ; jamais dessinée en barre ; une valeur
// absente (null) s'écrit « non mesuré », jamais 0. Avec un repère, le dessin rend `markSides` : combien de lignes
// mesurées sont sous le repère, dessus, au-dessus, et combien ne sont pas mesurées, pour que la phrase de compute le
// dise et qu'un test le compare. Sans `extra`, le SVG est celui d'avant FD10, à l'octet (tools/fd10-reference.mjs).
import { textWidth, ellipsis, wrapText } from "../text.mjs";
import { resolveColor, familyFor } from "../theme-core.mjs";
import { esc, n1, text, rect, line } from "../svg.mjs";
import { EN } from "../locale.mjs";

// Values and labels are written through the collection's locale (FD03, A1): one
// number format for the whole engine, the locale's typography on every label.
// The legend lists the classes actually drawn, not every class declared (A4).
// The charter sets the narrow width (composition.narrow, 640 by default: below the width
// exports are drawn at, 672, so that no output moved), the share of the width left to
// labels, the inks of label, value and secondary text, and the reference mark (FD04).
export function drawBars(encoded, spec, theme, { width, target = "internal", locale = EN }) {
  const T = theme, S = T.space, Z = T.type.size, W = T.type.weight, C = T.color;
  const F = T.figure, ink = role => C[role], NARROW = T.frame.narrow, share = F.bars.label_share;
  const fmt = v => locale.formatNumber(v);
  // numbers in a column: the theme's numeric variant (tabular figures), and its widths
  const num = T.type.numeric ? { style: `font-variant-numeric:${T.type.numeric}` } : {};
  const rows = (encoded.rows || []).map(r => ({ ...r, label: locale.typo(r.label),
    missing_text: r.missing_text == null ? null : locale.typo(r.missing_text) }));
  const fs = Z.label, fsSmall = Z.small;
  const classes = spec.classes || {};
  const colourOf = cls => {
    if (!classes[cls]) throw new Error(`bars: row class "${cls}" is not declared in the spec`);
    return resolveColor(T, classes[cls].color);
  };

  // Narrow (FD03, HALT 2 answer 4): at 640 px or less, when a label would be cut,
  // each label goes on its own line(s) above its bar and is never cut. Wider, the
  // layout is the one before FD03, unchanged to the byte.
  const longest = Math.max(...rows.map(r => textWidth(T, r.label, fs, W.regular)));
  let stacked = width <= NARROW && longest > width * share;
  let labelRoom = stacked ? width : Math.min(Math.max(longest, 40), width * share);
  let labelW = stacked ? 0 : labelRoom + S.inline;
  const tailTexts = rows.filter(r => r.value != null).map(r => fmt(r.value));
  const tailRoom = Math.max(textWidth(T, spec.tail_header || "", fsSmall, W.regular),
                            ...tailTexts.map(s => textWidth(T, s, fs, W.bold, { numeric: true })), 10);
  const tailW = tailRoom + S.inline * 2;
  // FD10 : la seconde colonne, son en-tête et son unité (sur une seconde ligne d'en-tête)
  const X = spec.extra || null, xdec = X?.decimals;
  const extraText = r => (r.extra == null ? null : locale.formatNumber(r.extra, xdec == null ? {} : { decimals: xdec }));
  if (X) for (const r of rows) if (r.extra !== undefined && r.extra !== null && !Number.isFinite(r.extra)) throw new Error(`bars: row "${r.label}": extra is not a number (null when it is not measured)`);
  const extraRoom = X ? Math.max(textWidth(T, X.header, fsSmall, W.regular), X.unit ? textWidth(T, X.unit, fsSmall, W.regular) : 0,
    ...rows.map(r => (r.extra == null ? textWidth(T, locale.labels.not_measured, fsSmall, W.regular) : textWidth(T, extraText(r), fs, W.regular, { numeric: true }))), 10) : 0;
  const extraW = X ? extraRoom + S.inline * 2 : 0;
  let barW = width - labelW - tailW - extraW;
  // FD10 : avec une seconde colonne, à la largeur étroite, les libellés montent au-dessus des barres si la place manque
  if (X && !stacked && barW < 60 && width <= NARROW) { stacked = true; labelRoom = width; labelW = 0; barW = width - tailW - extraW; }
  if (barW < 60) throw new Error(`bars: ${width}px leaves ${Math.round(barW)}px for the bars`);

  // a mark position may come with the data (a threshold the figure declares)
  const mark = spec.mark ? { ...spec.mark, ...(encoded.mark || {}) } : null;
  if (mark && mark.at == null) throw new Error("bars: a mark needs a position");
  const max = Math.max(...rows.map(r => r.value ?? 0), mark ? mark.at : 0, 1);
  const x = v => labelW + (v / max) * barW;
  const rowH = Math.max(S.row, S.bar + S.inline);
  const headH = Math.ceil(fsSmall * T.type.line_height.text) * (X?.unit ? 2 : 1) + S.inline;
  // row geometry: top, bottom, centre of the bar band, label lines and their baselines
  const lead = Math.ceil(fs * T.type.line_height.text);
  let yy = headH;
  const geo = rows.map((r, i) => {
    if (!stacked) { const y0 = headH + i * rowH; return { y0, y1: y0 + rowH, cy: y0 + rowH / 2 }; }
    const lines = wrapText(T, r.label, width, fs, W.regular);
    const band = S.bar + S.inline / 2;
    const g = { lines, base: lines.map((_, k) => yy + fs + k * lead), y0: yy, band0: yy + lines.length * lead, cy: yy + lines.length * lead + band / 2 };
    g.y1 = g.band0 + band + S.inline / 2;
    yy = g.y1;
    return g;
  });
  const height = (stacked ? yy : headH + rows.length * rowH) + S.inline;

  const parts = [];
  const ink3 = ink(F.text.secondary);
  if (X) {
    const xx = labelW + barW + tailW + S.inline, small = Math.ceil(fsSmall * T.type.line_height.text);
    parts.push(text(xx, headH - S.inline - (X.unit ? small : 0), locale.typo(X.header), { "font-size": fsSmall, fill: ink3, "data-fit": n1(extraRoom) }));
    if (X.unit) parts.push(text(xx, headH - S.inline, locale.typo(X.unit), { "font-size": fsSmall, fill: ink3, "data-fit": n1(extraRoom) }));
    rows.forEach((r, i) => {
      const { cy } = geo[i], t = extraText(r);
      parts.push(t == null ? text(xx, cy + fsSmall * 0.35, locale.labels.not_measured, { "font-size": fsSmall, fill: ink3, "data-fit": n1(extraRoom) })
        : text(xx, cy + fs * 0.35, t, { "font-size": fs, fill: ink(F.text.value), "data-fit": n1(extraRoom), ...num }));
    });
  }
  if (spec.tail_header) parts.push(text(labelW + barW + S.inline, headH - S.inline, locale.typo(spec.tail_header),
    { "font-size": fsSmall, fill: ink3, "data-fit": n1(tailRoom) }));
  rows.forEach((r, i) => {
    const { cy } = geo[i];
    if (stacked) {
      geo[i].lines.forEach((l, k) => parts.push(text(0, geo[i].base[k], l, { "font-size": fs, fill: ink(F.text.label), "data-fit": n1(width) })));
    } else {
    const label = ellipsis(T, r.label, labelRoom, fs, W.regular);
    const labelSvg = text(0, cy + fs * 0.35, label, { "font-size": fs, fill: ink(F.text.label), "data-fit": n1(labelRoom) });
    // A cut label keeps its full form as an accessible title.
    parts.push(label === r.label ? labelSvg
      : labelSvg.replace(/<\/text>$/, `<title>${esc(r.label)}</title></text>`));
    }
    if (r.value == null) {
      parts.push(text(labelW, cy + fsSmall * 0.35, r.missing_text || locale.labels.not_measured,
        { "font-size": fsSmall, fill: ink3 }));
      return;
    }
    parts.push(rect(labelW, cy - S.bar / 2, x(r.value) - labelW, S.bar, { fill: colourOf(r.cls) }));
    parts.push(text(labelW + barW + S.inline, cy + fs * 0.35, fmt(r.value),
      { "font-size": fs, "font-weight": W.bold, fill: ink(F.text.value), "data-fit": n1(tailRoom), ...num }));
  });
  if (mark) {
    const mx = x(mark.at);
    // drawn across measured rows only: a row with no measure has no scale to mark
    rows.forEach((r, i) => {
      if (r.value == null) return;
      const { y0, y1 } = stacked ? { y0: geo[i].band0, y1: geo[i].y1 } : geo[i];
      parts.push(line(mx, i === 0 && !stacked ? headH - S.inline / 2 : y0, mx, y1,
        { stroke: ink(F.mark.color), "stroke-width": T.stroke.regular, "stroke-dasharray": F.mark.dash }));
    });
    // FD10 : avec une seconde colonne (les barres sont plus étroites), le libellé du repère reste dans la zone des barres.
    // Sans elle, rien ne change : aucun SVG d'avant FD10 ne bouge (une collection qui n'est pas lue ici comprise).
    const mw = mark.label ? textWidth(T, locale.typo(mark.label), fsSmall, W.regular) : 0;
    const lx = X && mw <= barW ? Math.min(Math.max(mx, labelW + mw / 2), labelW + barW - mw / 2) : mx;
    if (mark.label) parts.push(text(lx, headH - S.inline, locale.typo(mark.label),
      { "font-size": fsSmall, fill: ink3, "text-anchor": "middle" }));
  }
  const drawn = new Set(rows.filter(r => r.value != null).map(r => r.cls));
  const legend = Object.entries(classes).filter(([k, c]) => c.legend && drawn.has(k))
    .map(([k]) => [classes[k].legend, colourOf(k)]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${n1(height)}" `
    + `viewBox="0 0 ${n1(width)} ${n1(height)}" font-family="${esc(familyFor(T, target))}">`
    + parts.join("") + `</svg>`;
  // FD10 : de part et d'autre du repère, les lignes mesurées ; les autres comptées à part
  const markSides = mark ? { below: rows.filter(r => r.value != null && r.value < mark.at).length, at: rows.filter(r => r.value != null && r.value === mark.at).length,
    above: rows.filter(r => r.value != null && r.value > mark.at).length, not_measured: rows.filter(r => r.value == null).length } : null;
  return { svg, width, height, legend, ...(markSides ? { markSides } : {}) };
}
