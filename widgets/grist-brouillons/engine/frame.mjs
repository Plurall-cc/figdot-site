// The frame of an exported figure: everything an image must carry once it
// travels without its page (FD01 P1), in the four modules of FD06 (D24): the
// framing (title, explanatory subtitle), the drawing(s), the legend and the notes,
// the mentions (unit and option: variables and options; perimeter; sources and
// their dates), and the collection's credit line. Every colour, size, stroke and spacing is a
// theme token; every label comes from the collection's locale (FD03, A1).
import { textWidth, wrapRuns, wrapText, htmlToRuns } from "./text.mjs";
import { familyFor } from "./theme-core.mjs";
import { esc, n1, rect, line } from "./svg.mjs";
import { EN } from "./locale.mjs";

// The modules that may go with the drawing (D25, FD06), and what each carries.
// The drawing always stays; so does the link to the full figure, when its address
// is known. Without a list, every module: the image of FD05, to the byte.
export const MODULES = ["cadrage", "variables", "legende", "sources"];
const MENTION_MODULE = { unit: "variables", option: "variables", perimeter: "legende", sources: "sources", source: "sources" };
// "cadrage,sources" -> Set; "" -> the drawing alone; an unknown module is an error
export function parseModules(list) {
  if (list == null) return null;
  const ids = String(list).split(",").map(x => x.trim()).filter(Boolean);
  const bad = ids.filter(x => !MODULES.includes(x));
  if (bad.length) throw new Error(`module inconnu : ${bad.join(", ")} (modules : ${MODULES.join(", ")} ; aucun : la visualisation seule)`);
  return new Set(ids);
}

// The mentions under the drawing, in order: unit, option, perimeter, then either
// the sources, one line each with its own date (FD03, A2), or the single source
// in words followed by the date sentence (`dating`), as before FD03.
export function footerMentions(result, locale = EN) {
  const L = locale.labels, ms = [];
  if (result.unit) ms.push({ key: "unit", label: L.unit, lines: [result.unit] });
  if (result.option_label) ms.push({ key: "option", label: L.option, lines: [result.option_label] });
  if (result.perimeter) ms.push({ key: "perimeter", label: L.perimeter, lines: [result.perimeter] });
  if (result.sources) ms.push({ key: "sources", label: result.sources.length > 1 ? L.sources : L.source,
    lines: result.sources.map(s => `${s.words} (${s.as_of ? locale.formatDate(s.as_of) : L.source_undated})`) });
  else ms.push({ key: "source", label: L.source, lines: [`${result.source_words}. ${result.dating}`] });
  return ms;
}

// The same mentions as one line of text, for <desc> and for the R5 test. In
// English with a single source it is, character for character, the FD01 line:
// "Unit: … Rule: … Perimeter: … Source: …. Data as of …".
export function ruleLine(result, locale = EN) {
  const ms = footerMentions(result, locale);
  return locale.typo(ms.map(m => m.label + locale.colon + m.lines.join(locale.listSep)).join(". ")
    + (result.sources ? "." : ""));
}

function runsSvg(lines, x, y0, size, lead, fill, weights) {
  return lines.map((runs, i) => `<text x="${n1(x)}" y="${n1(y0 + i * lead)}" font-size="${size}" fill="${fill}">`
    + runs.map(r => `<tspan font-weight="${r.bold ? weights.bold : weights.regular}"${r.fill ? ` fill="${r.fill}"` : ""}>${esc(r.text)}</tspan>`).join("")
    + `</text>`).join("");
}

// show: a Set of MODULES, or null for all of them. link: the address of the full
// figure (D25), printed last, small; required when a module is left out.
export function composeExport({ meta, result, drawings, theme, width, target = "internal", credit, locale = EN, show = null, link = null }) {
  const has = m => !show || show.has(m);
  if (show && MODULES.some(m => !show.has(m)) && !link) throw new Error("une image dont un module est décoché porte le lien vers la figure complète (D25) : donnez son adresse (--site)");
  const T = theme, S = T.space, Z = T.type.size, W = T.type.weight, C = T.color, L = T.type.line_height;
  const X = T.frame.text, I = role => C[role];   // the inks of the frame's texts (composition.text, FD04)
  const pad = S.pad, inner = width - pad * 2;
  const typo = locale.typo;
  const title = typo(meta.title);
  const bits = [];
  let y = pad;

  const lineBlock = (lines, size, lead, fill, weights, x = pad) => {
    y += size;                                   // baseline of the first line
    bits.push(runsSvg(lines, x, y, size, lead, fill, weights));
    y += (lines.length - 1) * lead + (lead - size);
  };

  if (has("cadrage")) {
    const titleLead = Math.round(Z.title * L.title);
    lineBlock(wrapRuns(T, [{ text: title, bold: true }], inner, Z.title, W), Z.title, titleLead, C.title,
      { regular: W.bold, bold: W.bold });
    y += S.inline;
    const sentLead = Math.round(Z.sentence * L.text);
    lineBlock(wrapRuns(T, htmlToRuns(result.subtitle.html), inner, Z.sentence, W), Z.sentence, sentLead, I(X.sentence), W);
    y += S.block;
  }

  for (const d of drawings) {
    if (d.width > inner + 0.5) throw new Error(`drawing ${d.width}px wider than the frame's ${inner}px`);
    const inside = d.svg.replace(/^<svg /, `<svg x="${n1(pad)}" y="${n1(y)}" `);
    bits.push(inside);
    y += d.height + S.block;
  }

  // Legend entries: [label, fill, stroke?] for a swatch, or an object
  // { label, fill?, stroke?, shape: "box" | "line", width? } (FD03, A4): a line
  // is drawn as a stroke across the swatch, for a boundary or a trace.
  const legend = drawings.flatMap(d => d.legend || [])
    .map(e => (Array.isArray(e) ? { label: e[0], fill: e[1], stroke: e[2], shape: "box" } : { shape: "box", ...e }));
  if (legend.length && has("legende")) {
    const sw = S.swatch, gapAfter = S.inline / 2, gapItem = S.block;
    let lx = pad;
    const lineH = Math.max(sw, Z.label) + S.inline;
    for (const e of legend) {
      const label = typo(e.label);
      const w = sw + gapAfter + textWidth(T, label, Z.label, W.regular);
      if (lx > pad && lx + w > pad + inner) { lx = pad; y += lineH; }
      if (e.shape === "line") {
        if (!e.stroke) throw new Error(`legend "${e.label}": a line needs a stroke colour`);
        bits.push(line(lx, y + sw / 2, lx + sw, y + sw / 2, { stroke: e.stroke, "stroke-width": e.width ?? T.stroke.strong }));
      } else {
        bits.push(rect(lx, y, sw, sw, { fill: e.fill, stroke: e.stroke || (e.fill === C.paper ? I(T.figure.text.secondary) : e.fill), "stroke-width": T.stroke.regular }));
      }
      bits.push(`<text x="${n1(lx + sw + gapAfter)}" y="${n1(y + sw - 1)}" font-size="${Z.label}" fill="${I(T.figure.text.secondary)}">${esc(label)}</text>`);
      lx += w + gapItem;
    }
    y += lineH + S.inline;
  }

  const smallLead = Math.round(Z.small * L.text);
  const notes = has("legende") ? result.notes || [] : [];
  for (const n of notes) {
    lineBlock(wrapText(T, typo(n), inner, Z.small, W.regular).map(t => [{ text: t }]), Z.small, smallLead, I(X.note), W);
    y += S.inline;
  }

  footer();

  if (credit && has("sources")) {
    y += S.inline / 2;
    lineBlock(wrapText(T, typo(credit), inner, Z.small, W.regular).map(t => [{ text: t }]), Z.small, smallLead, I(X.credit), W);
  }
  if (link) {
    // the discreet link to the full figure (D25): always there once its address is known
    y += S.inline / 2;
    const room = inner;
    const lines = wrapText(T, link, room, Z.small, W.regular);
    y += Z.small;
    bits.push(lines.map((t, i) => `<text x="${n1(pad)}" y="${n1(y + i * smallLead)}" font-size="${Z.small}" fill="${I(X.credit)}" data-fit="${n1(room)}">${esc(t)}</text>`).join(""));
    y += (lines.length - 1) * smallLead + (smallLead - Z.small);
  }
  y += S.block;
  bits.push(rect(pad, y, inner, T.frame.rule_height, { fill: C.rule_bar }));
  const height = Math.ceil(y + T.frame.rule_height + pad);

  // The mentions (FD03, A3), one per line, the label set apart from its text.
  //  "columns": labels in a column of their own, every text aligned after it;
  //             the sources one under the other in the text column.
  //  "inline":  each mention a paragraph that starts with its label in bold and
  //             wraps to the left margin; each further source on its own line.
  function footer() {
    const ms = footerMentions(result, locale).filter(m => has(MENTION_MODULE[m.key])).map(m => ({ ...m, label: typo(m.label + locale.colon.trimEnd()), lines: m.lines.map(typo) }));
    if (!ms.length) return;
    const layout = T.frame.footer || "columns";
    const labelFill = I(X.mention_label), textFill = I(X.mention_text), gapMention = Math.round(S.inline / 2);
    const labelW = Math.max(...ms.map(m => textWidth(T, m.label, Z.small, W.bold)));
    const room = inner - labelW - S.inline;
    if (layout === "columns" && room >= inner * 0.5) {
      for (const m of ms) {
        const lines = m.lines.flatMap(l => wrapText(T, l, room, Z.small, W.regular));
        const y0 = y + Z.small;
        bits.push(runsSvg([[{ text: m.label, bold: true }]], pad, y0, Z.small, smallLead, labelFill, W));
        lineBlock(lines.map(t => [{ text: t }]), Z.small, smallLead, textFill, W, pad + labelW + S.inline);
        y += gapMention;
      }
    } else if (layout === "columns" || layout === "inline") {
      for (const m of ms) {
        const [first, ...rest] = m.lines;
        const lines = wrapRuns(T, [{ text: m.label, bold: true, fill: labelFill }, { text: " " + first }], inner, Z.small, W)
          .map(l => l.map(r => (r.bold ? { ...r, fill: labelFill } : r)));
        for (const r of rest) lines.push(...wrapText(T, r, inner, Z.small, W.regular).map(t => [{ text: t }]));
        lineBlock(lines, Z.small, smallLead, textFill, W);
        y += gapMention;
      }
    } else throw new Error(`theme ${T.name}: frame.footer "${layout}" is neither "columns" nor "inline"`);
    y -= gapMention;
  }

  const desc = typo(result.subtitle.text) + " " + ruleLine(result, locale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${height}" `
    + `viewBox="0 0 ${n1(width)} ${height}" font-family="${esc(familyFor(T, target))}" data-target="${esc(target)}" `
    + `role="img" aria-label="${esc(title + ". " + typo(result.subtitle.text))}">`
    + `<title>${esc(title)}</title><desc>${esc(desc)}</desc>`
    + rect(0, 0, width, height, { fill: C.paper })
    + bits.join("") + `</svg>`;
}
