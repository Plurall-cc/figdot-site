// Formatting only: no function here counts, filters or divides.
//
// Every function is bound to a locale (locale.mjs). The functions exported by
// name are the English ones, unchanged since FD01; a collection receives the
// ones bound to its own locale through `figdot` (helpers.mjs).
//
// fmtN(v)                 1234 -> "1,234" (fr: "1 234"); a string is returned as is; null -> "—"
// fmtN(v, { decimals })   exactly that many decimals: fmtN(12.345, { decimals: 1 }) -> "12.3" (fr: "12,3")
import { EN } from "./locale.mjs";

export function makeFormat(locale = EN) {
  const fmtN = (v, { decimals } = {}) => (v == null ? "—" : typeof v === "string" ? v
    : locale.formatNumber(v, { decimals }));

  // "{key}" -> value; "{key:.N}" -> the number with exactly N decimals. With
  // { bold: true }, every number (whatever its decimals) is set in <b>; a string
  // value is inserted as is. A placeholder left unfilled is an error, never a
  // sentence with a hole in it.
  function fillTemplate(tpl, vals, { bold = false } = {}) {
    const out = String(tpl ?? "").replace(/\{(\w+)(?::\.(\d))?\}/g, (m, k, dec) => {
      if (!(k in vals)) return m;
      const v = vals[k];
      if (dec != null && typeof v !== "number") throw new Error(`{${k}:.${dec}} needs a number, got ${JSON.stringify(v)}`);
      const s = fmtN(v, { decimals: dec == null ? undefined : Number(dec) });
      return bold && typeof v !== "string" ? `<b>${s}</b>` : s;
    });
    if (/\{\w+(?::\.\d)?\}/.test(out)) throw new Error(`a placeholder was not filled in: ${tpl}`);
    return out;
  }

  const joinAnd = xs => (xs || []).length <= 1 ? (xs || []).join("")
    : xs.slice(0, -1).join(", ") + ` ${locale.labels.and} ` + xs[xs.length - 1];

  const dataAsOf = (stamp, someUndated) => !stamp ? locale.labels.undated
    : locale.labels.as_of.replace("{date}", locale.formatDate(stamp)) + (someUndated ? " " + locale.labels.some_undated : "");

  return { fmtN, fillTemplate, joinAnd, stripTags, dataAsOf, formatDate: locale.formatDate, typo: locale.typo };
}

export const stripTags = html => String(html).replace(/<[^>]+>/g, "");

export const { fmtN, fillTemplate, joinAnd, dataAsOf } = makeFormat(EN);
