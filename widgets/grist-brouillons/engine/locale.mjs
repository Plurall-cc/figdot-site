// The language of a collection (FD03, A1). A collection declares its locale in
// collection.json ("locale": "fr", or { "lang": "fr", "labels": { ... } }); the
// engine then writes every frame label, every number and every date in it.
// Without a declared locale nothing changes: English labels, en-US numbers, ISO
// dates, exactly as before FD03.
//
// One function writes every number the engine prints (formatNumber): the
// helpers fmtN and fillTemplate, the values at the end of bars, the values in
// matrix cells. Formatting only: nothing here counts, filters or divides.

export const LABELS = {
  en: {
    unit: "Unit", option: "Option", perimeter: "Perimeter", source: "Source", sources: "Sources",
    as_of: "Data as of {date}.", undated: "Date of the data not recorded.",
    some_undated: "Some of what is shown is not dated.", source_undated: "date not recorded",
    not_measured: "not measured", and: "and",
    unlabelled_one: "{n} label not shown", unlabelled_other: "{n} labels not shown",
    licence: "Licence", licence_unknown: "not recorded",
  },
  fr: {
    unit: "Unité", option: "Option", perimeter: "Périmètre", source: "Source", sources: "Sources",
    as_of: "Données au {date}.", undated: "Date des données non relevée.",
    some_undated: "Une partie de ce qui est montré n’est pas datée.", source_undated: "date non relevée",
    not_measured: "non mesuré", and: "et",
    unlabelled_one: "{n} étiquette non affichée", unlabelled_other: "{n} étiquettes non affichées",
    licence: "Licence", licence_unknown: "non relevée",
  },
};
const NUMBERS = { en: "en-US", fr: "fr-FR" };
const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre"];

const NBSP = " ", NNBSP = " ";

// French typography, applied to every visible text of a "fr" collection: a
// no-break space before the colon, a narrow no-break space before ; ! ? % and
// inside « », a typographic apostrophe. Only spaces already written are made
// unbreakable: "14:30" or a URL are left alone.
const typoFr = s => String(s)
  .replace(/'/g, "’")
  .replace(/[   ]+:/g, NBSP + ":")
  .replace(/[   ]+([;!?%])/g, NNBSP + "$1")
  .replace(/«[   ]*/g, "«" + NNBSP)
  .replace(/[   ]*»/g, NNBSP + "»");

// A date as written in a frame. "YYYY-MM-DD", "YYYY-MM" or "YYYY".
function dateFr(stamp) {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(String(stamp));
  if (!m) throw new Error(`date not understood: ${stamp}`);
  const [, y, mo, d] = m;
  if (!mo) return y;
  const month = MONTHS_FR[Number(mo) - 1];
  if (!d) return `${month} ${y}`;
  const day = Number(d);
  return `${day === 1 ? "1er" : day} ${month} ${y}`;
}
const dateEn = stamp => String(stamp).slice(0, 10);

// conf: undefined | "en" | "fr" | { lang, numbers?, labels? }. A language the
// engine does not ship must give every label and its number format.
export function makeLocale(conf) {
  const c = conf == null ? { lang: "en" } : typeof conf === "string" ? { lang: conf } : conf;
  const lang = c.lang;
  if (!lang) throw new Error("locale: no lang");
  const base = LABELS[lang];
  const labels = { ...(base || {}), ...(c.labels || {}) };
  const missing = Object.keys(LABELS.en).filter(k => !labels[k] || !String(labels[k]).trim());
  if (missing.length) throw new Error(`locale ${lang}: missing labels ${missing.join(", ")}`);
  const numbers = c.numbers || NUMBERS[lang];
  if (!numbers) throw new Error(`locale ${lang}: no number format (give "numbers", for example "de-DE")`);
  const plain = new Intl.NumberFormat(numbers);
  const fixed = new Map();
  const formatNumber = (v, { decimals } = {}) => {
    if (decimals == null) return plain.format(Number(v));
    if (!fixed.has(decimals)) fixed.set(decimals, new Intl.NumberFormat(numbers, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
    return fixed.get(decimals).format(Number(v));
  };
  const fr = lang === "fr";
  return Object.freeze({
    lang, numbers, labels: Object.freeze(labels),
    formatNumber,
    formatDate: fr ? dateFr : dateEn,
    typo: fr ? typoFr : s => String(s),
    // "Unit: x" / "Unité : x"
    colon: fr ? NBSP + ": " : ": ",
    listSep: fr ? NNBSP + "; " : "; ",
  });
}

export const EN = makeLocale();
