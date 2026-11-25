// Spec form "matrix": rows x columns of cells. A cell carries either a number,
// coloured on a binned scale of the theme (or of the collection), or a named
// state ("closed", "not reported", ...) drawn with the state's own fill and
// stroke. A state is never a number and never a zero.
//
// encoded: { rows: [label], cols: [label], cells: [[{ value } | { state }]] }
// spec:    { kind: "matrix", scale: { palette, bins: [upper bounds], labels: [..] },
//            states: { <state>: { fill, stroke, legend } }, empty_state, show_values,
//            cell_stroke }
// cell_stroke (optional colour reference) outlines every numbered cell and its
// legend swatch, so that a bin coloured like the paper (the middle of a diverging
// palette) stays visible. Without it, numbered cells have no outline.
import { textWidth, ellipsis } from "../text.mjs";
import { resolveColor, familyFor, get } from "../theme-core.mjs";
import { esc, n1, text, rect } from "../svg.mjs";
import { EN } from "../locale.mjs";

// relative luminance, to choose ink or paper on a cell
function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

// Values and labels go through the collection's locale (FD03, A1).
export function drawMatrix(encoded, spec, theme, { width, target = "internal", locale = EN }) {
  const T = theme, S = T.space, Z = T.type.size, W = T.type.weight, C = T.color;
  // set by the charter (FD04): gap between cells, share of the labels, smallest cell, ink switch, inks
  const M = T.figure.matrix, X = T.figure.text, gap = M.gap;
  const fmt = v => locale.formatNumber(v);
  const num = T.type.numeric ? { style: `font-variant-numeric:${T.type.numeric}` } : {};
  const { cells } = encoded;
  const rows = encoded.rows.map(locale.typo), cols = encoded.cols.map(locale.typo);
  const fs = Z.label, fsSmall = Z.small;
  const palette = (() => {
    const ref = spec.scale.palette;
    if (Array.isArray(ref)) return ref.map(r => resolveColor(T, r));
    const v = get(T, String(ref).replace(/^theme:/, ""));
    if (!Array.isArray(v)) throw new Error(`matrix: ${ref} is not a palette`);
    return v;
  })();
  const bins = spec.scale.bins;
  if (bins.length > palette.length) throw new Error(`matrix: ${bins.length} bins, palette has ${palette.length} colours`);
  // spread the bins over the palette, lightest to darkest
  const binColour = i => palette[Math.round(i * (palette.length - 1) / Math.max(1, bins.length - 1))];
  const binOf = v => { const i = bins.findIndex(b => v <= b); return i < 0 ? bins.length - 1 : i; };
  const states = spec.states || {};
  const cellStroke = spec.cell_stroke ? resolveColor(T, spec.cell_stroke) : null;
  const stateStyle = s => {
    if (!states[s]) throw new Error(`matrix: state "${s}" is not declared in the spec`);
    return { fill: resolveColor(T, states[s].fill), stroke: resolveColor(T, states[s].stroke) };
  };

  const labelRoom = Math.min(Math.max(...rows.map(r => textWidth(T, r, fs, W.regular)), 40), width * M.label_share);
  const labelW = labelRoom + S.inline;
  const cellW = Math.floor((width - labelW) / cols.length);
  if (cellW < M.min_cell) throw new Error(`matrix: ${cols.length} columns do not fit in ${width}px`);
  const colRoom = cellW - 2 * gap;
  const colHeaderFits = cols.every(c => textWidth(T, c, fsSmall, W.regular) <= colRoom);
  const headH = colHeaderFits ? Math.ceil(fsSmall * T.type.line_height.text) + S.inline
    : Math.ceil(Math.max(...cols.map(c => textWidth(T, c, fsSmall, W.regular)))) + S.inline;
  const cellH = Math.max(S.row - 2, fs + S.inline);
  const height = headH + rows.length * cellH + 2;

  const parts = [];
  cols.forEach((c, j) => {
    const cx = labelW + j * cellW + cellW / 2;
    parts.push(colHeaderFits
      ? text(cx, headH - S.inline, c, { "font-size": fsSmall, fill: C[X.secondary], "text-anchor": "middle", "data-fit": n1(colRoom) })
      : text(0, 0, c, { "font-size": fsSmall, fill: C[X.secondary], transform: `translate(${n1(cx + fsSmall / 3)},${n1(headH - S.inline / 2)}) rotate(-90)` }));
  });
  rows.forEach((r, i) => {
    const y = headH + i * cellH;
    const label = ellipsis(T, r, labelRoom, fs, W.regular);
    parts.push(text(0, y + cellH / 2 + fs * 0.35, label, { "font-size": fs, fill: C[X.label], "data-fit": n1(labelRoom) }));
    cols.forEach((c, j) => {
      const cell = (cells[i] || [])[j] || { state: spec.empty_state };
      const x = labelW + j * cellW;
      if (cell.state) {
        const st = stateStyle(cell.state);
        parts.push(rect(x + gap, y + gap, cellW - 2 * gap, cellH - 2 * gap, { fill: st.fill, stroke: st.stroke, "stroke-width": T.stroke.regular }));
        return;
      }
      const fill = binColour(binOf(cell.value));
      parts.push(rect(x + gap, y + gap, cellW - 2 * gap, cellH - 2 * gap,
        cellStroke ? { fill, stroke: cellStroke, "stroke-width": T.stroke.regular } : { fill }));
      if (spec.show_values) {
        const s = fmt(cell.value);
        if (textWidth(T, s, fsSmall, W.regular, { numeric: true }) <= cellW - 4)
          parts.push(text(x + cellW / 2, y + cellH / 2 + fsSmall * 0.35, s, {
            "font-size": fsSmall, "text-anchor": "middle", fill: lum(fill) > M.ink_switch ? C[X.value] : C.paper, ...num }));
      }
    });
  });

  const legend = bins.map((b, i) => cellStroke ? [spec.scale.labels[i], binColour(i), cellStroke] : [spec.scale.labels[i], binColour(i)])
    .concat(Object.entries(states).filter(([, s]) => s.legend)
      .map(([k, s]) => [s.legend, stateStyle(k).fill, stateStyle(k).stroke]));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${n1(height)}" `
    + `viewBox="0 0 ${n1(width)} ${n1(height)}" font-family="${esc(familyFor(T, target))}">`
    + parts.join("") + `</svg>`;
  return { svg, width, height, legend };
}
