// From a computed result to a framed SVG, the pure steps (FD04, lot 3): what
// compute must return, the sources, the locale's typography, the declarative
// forms, the frame. No file system: the engine runs them in Node (collection.mjs,
// buildFigure), the Grist widget in a browser. One code path, so the preview in
// the widget is the SVG the build writes.
import { BASE } from "./shapes/registry.mjs";
import { schemaErrors } from "./profile-check.mjs";
import { composeExport } from "./frame.mjs";
export { composeExport };

// The contract of FD06 (D24): a figure.json says its format; an older one is
// refused with the command that migrates it (engine/lib/migrate.mjs).
export const FIGURE_FORMAT = "figdot.figure/2";
export const MIGRATE_HINT = dir => `lancez « node <moteur>/cli.mjs migrate --collection ${dir ?? "<collection>"} » (contrat FD06)`;

// The declarative forms (FD06): a registry of shapes (shapes/registry.mjs). BASE knows
// bars and matrix, and runs in a browser; the engine in Node draws with the whole catalog.
export const SPEC_FORMS = BASE;

// A required key is refused when it is missing OR blank (FD03, A5): null, an
// empty string, a string of spaces, an empty list. "Never a blank" (contract §4).
export const blank = v => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

// What compute must return (contract §4, FD06): the four modules around the
// drawing. Missing or blank is an error. A key of the contract before FD06
// (sentence, rule_label, exportNotes) is refused with the command that migrates.
const OLD_RESULT_KEYS = { sentence: "subtitle", rule_label: "option_label", exportNotes: "notes" };
function checkResult(name, r, meta) {
  const bad = k => { throw new Error(`${name}: result has no ${k} (missing or blank)`); };
  if (!r || typeof r !== "object") bad("result");
  const old = Object.keys(OLD_RESULT_KEYS).filter(k => k in r);
  if (old.length) throw new Error(`${name} : le résultat de compute porte ${old.map(k => `« ${k} »`).join(", ")}, clés d'avant FD06 (${old.map(k => `${k} -> ${OLD_RESULT_KEYS[k]}`).join(", ")}) ; ${MIGRATE_HINT()}`);
  if (blank(r.subtitle?.html)) bad("subtitle.html");
  if (blank(r.subtitle?.text)) bad("subtitle.text");
  if (blank(r.perimeter)) bad("perimeter");
  if (r.encoded == null) bad("encoded");
  if (r.sources == null && meta.sources == null && blank(r.dating)) bad("dating");
  for (const k of ["unit", "option_label", "source_words", "source_link", "source_no_link"]) if (k in r && r[k] != null && blank(r[k])) bad(k);
}

// A link to the origin of a source (D42): an absolute http(s) address. Never made up.
const LINK = /^https?:\/\/\S+$/;
const checkLink = (name, where, l, noLink) => {
  if (l != null && !LINK.test(String(l))) throw new Error(`${name}: ${where}: link "${l}" is not an http(s) address`);
  // D65 (FD07) : « no_link » dit pourquoi la source n'a pas d'adresse publique ; il exclut un lien
  if (noLink != null && blank(noLink)) throw new Error(`${name}: ${where}: no_link is blank (give the reason there is no public address, or drop it)`);
  if (noLink != null && !blank(l)) throw new Error(`${name}: ${where}: give either a link or no_link, not both`);
};

// Either one source in words with one date sentence, or a list of sources, each
// with its own date (FD03, A2). Not both: a single date over several sources
// would again be a date that is wrong for some of them.
// A source may name the files of the collection it stands for (`files`, paths
// relative to the collection): each must exist. They are never printed.
function checkSources(name, r, checkFile) {
  if (r.sources != null) {
    if (!Array.isArray(r.sources) || !r.sources.length) throw new Error(`${name}: sources must be a non-empty list`);
    for (const [i, s] of r.sources.entries()) {
      if (blank(s?.words)) throw new Error(`${name}: source ${i + 1} has no words`);
      if (s.files != null) {
        if (!Array.isArray(s.files) || s.files.some(blank)) throw new Error(`${name}: source ${i + 1}: files must be a list of paths`);
        for (const f of s.files) if (checkFile && !checkFile(f)) throw new Error(`${name}: source ${i + 1} names ${f}, which does not exist in the collection`);
      }
      if (s.as_of != null && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(s.as_of))) throw new Error(`${name}: source ${i + 1}: as_of "${s.as_of}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
      checkLink(name, `source ${i + 1}`, s.link, s.no_link);
    }
    if (!blank(r.dating)) throw new Error(`${name}: give either sources (each with its date) or dating, not both`);
  } else if (blank(r.source_words)) throw new Error(`${name}: no source_words and no sources`);
  else checkLink(name, "source", r.source_link, r.source_no_link);
}

// The sources of a result that have neither a link to their origin (D42, FD06) nor a stated
// reason for having none (D65, FD07): refused for a published figure, a warning for a draft.
// [{ n, words }], n from 1.
export function sourcesWithoutLink(r) {
  const list = r.sources ? r.sources.map(s => ({ words: s.words, link: s.link, no_link: s.no_link })) : [{ words: r.source_words, link: r.source_link, no_link: r.source_no_link }];
  return list.map((s, i) => ({ n: i + 1, words: s.words, link: s.link, no_link: s.no_link })).filter(s => blank(s.link) && blank(s.no_link)).map(({ n, words }) => ({ n, words }));
}
export function linkMessage(title, missing, total) {
  const which = missing.map(s => `${total > 1 ? `la source n° ${s.n} ` : "la source "}(« ${s.words} »)`).join(", ");
  return `« ${title} » : ${which} ${missing.length > 1 ? "n'ont" : "n'a"} pas de lien vers ${missing.length > 1 ? "leur" : "son"} origine ; une figure publiée cite chaque source avec un lien (D42), ou dit pourquoi elle n'en a pas (D65). Donnez-lui « link » ou « no_link » (le motif : document non public, entretien, ouvrage imprimé…), ou repassez la figure en brouillon`;
}

// The locale's typography on every text the result carries (FD03, A1). English
// leaves them untouched.
function polish(r, locale) {
  const t = locale.typo;
  r.subtitle = { html: t(r.subtitle.html), text: t(r.subtitle.text) };
  for (const k of ["perimeter", "unit", "option_label", "source_words", "source_no_link", "dating"]) if (r[k] != null) r[k] = t(r[k]);
  if (r.notes) r.notes = r.notes.map(t);
  if (r.sources) r.sources = r.sources.map(s => ({ ...s, words: t(s.words), ...(s.no_link != null ? { no_link: t(s.no_link) } : {}) }));
}

// A spec may name a collection palette entry as "collection:<palette>.<key>".
function resolveSpecPalettes(spec, palettes) {
  const pal = palettes || {};
  const walk = v => {
    if (typeof v === "string" && v.startsWith("collection:")) {
      const [p, k] = v.slice(11).split(".");
      const ref = pal[p]?.[k];
      if (!ref) throw new Error(`no collection palette entry ${v}`);
      return ref;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([a, b]) => [a, walk(b)]));
    return v;
  };
  return walk(spec);
}


// compute's result, checked and completed as the frame needs it (contract §4).
export function prepareResult(name, meta, raw, locale, { checkFile } = {}) {
  const result = { ...raw };
  checkResult(name, result, meta);
  result.source_words = result.source_words || meta.source_words;
  result.source_link = result.source_link ?? meta.source_link;
  result.source_no_link = result.source_no_link ?? meta.source_no_link;
  result.unit = result.unit ?? meta.unit;
  result.sources = result.sources ?? meta.sources;
  checkSources(name, result, checkFile);
  polish(result, locale);
  return result;
}

// A declarative form (contract §5), from a registry of shapes: its spec checked against
// the shape's schema, its collection palettes resolved, its smallest width enforced.
export function drawSpec(name, encoded, spec, T, { width, target, locale, palettes, shapes = BASE }) {
  const shape = shapes[spec.kind];
  if (!shape) throw new Error(`${name}: unknown spec form ${spec.kind} (forms: ${Object.keys(shapes).join(", ")})`);
  const bad = schemaErrors(shape.schema, spec);
  if (bad.length) throw new Error(`${name} : le spec de la forme « ${shape.name} » ne convient pas : ${bad.join(" ; ")}`);
  if (width < shape.minWidth) throw new Error(`${name} : la forme « ${shape.name} » demande ${shape.minWidth} px au moins, il y en a ${Math.round(width)}`);
  return shape.draw(encoded, resolveSpecPalettes(spec, palettes), T, { width, target, locale });
}
