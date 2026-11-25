// A FigDot draft from a row of a Grist "Figures" table (FD04, D23). One file,
// with no import, copied as is into two places, so that both compute the same:
//   - the collection that receives the drafts: source/grist-draft.mjs, which each
//     figure's compute.mjs calls (the build);
//   - the Grist widget "FigDot — brouillons" (the preview, in a browser).
//
// A draft holds words and a pointer, never a number: the numbers of the drawing
// and of the subtitle are read from the data table it names, by column and row
// (D22, and PLR's answer in FD04: "lus dans la table"). This file chooses, orders
// and places; it does not add, divide or count. A total or a share is a column of
// the Grist table (a formula there), not a computation here.

// Column ids of the Figures table (labels in Grist may be anything). FD06 (D24, D42):
// « sous_titre » (the explanatory subtitle, was « phrase »), « option » (was « regle »),
// « lien_source » (the link to the source's origin). The old ids are still read, so that
// a document made before FD06 keeps working: OLD_COLUMNS gives, for each, its new id.
export const COLUMNS = ["figure", "iteration", "titre", "sous_titre", "option", "perimetre", "unite", "source", "lien_source", "sans_adresse", "forme", "spec", "table_source", "charte", "statut", "note"];
export const OLD_COLUMNS = { phrase: "sous_titre", regle: "option" };
// a cell under its new id, else under its old one
const cell = (row, k) => { const old = Object.keys(OLD_COLUMNS).find(o => OLD_COLUMNS[o] === k);
  return row?.[k] != null && String(row[k]).trim() !== "" ? row[k] : old ? row?.[old] : row?.[k]; };
export const STATUS = { draft: "brouillon", send: "à envoyer", sent: "envoyé" };
const FORMS = { barres: "bars", matrice: "matrix" };

const blank = v => v == null || String(v).trim() === "";
const slugOk = s => /^[a-z0-9][a-z0-9-]*$/.test(s);

// A row -> a draft, or an Error listing every fault, in words.
export function readDraft(row) {
  const faults = [];
  const need = (k, what) => { const v = cell(row, k); if (blank(v)) faults.push(`${what} est vide (colonne ${k})`); return blank(v) ? null : String(v).trim(); };
  const opt = k => (blank(cell(row, k)) ? null : String(cell(row, k)).trim());
  const figure = need("figure", "l'identifiant de la figure");
  if (figure && !slugOk(figure)) faults.push(`l'identifiant « ${figure} » : minuscules, chiffres et tirets seulement`);
  const d = {
    figure, iteration: Number(row?.iteration) || 1,
    title: need("titre", "le titre"), subtitle: need("sous_titre", "le sous-titre (ex-phrase de résultat)"),
    perimeter: need("perimetre", "le périmètre"), source: need("source", "la source, en mots"),
    link: opt("lien_source"), no_link: opt("sans_adresse"), option: opt("option"), unit: opt("unite"),
    table: need("table_source", "la table source"), charte: need("charte", "la charte"),
    status: blank(row?.statut) ? STATUS.draft : String(row.statut).trim(), note: blank(row?.note) ? null : String(row.note),
  };
  const form = need("forme", "la forme");
  d.kind = form ? FORMS[form] ?? (Object.values(FORMS).includes(form) ? form : null) : null;
  if (form && !d.kind) faults.push(`la forme « ${form} » n'est ni « barres » ni « matrice »`);
  let spec = row?.spec;
  if (typeof spec === "string") { try { spec = blank(spec) ? {} : JSON.parse(spec); } catch (e) { faults.push(`la spec n'est pas du JSON : ${e.message}`); spec = {}; } }
  d.spec = spec && typeof spec === "object" ? spec : {};
  if (d.kind === "bars") { for (const k of ["label", "value"]) if (blank(d.spec[k])) faults.push(`la spec des barres n'a pas de colonne « ${k} »`); }
  if (d.kind === "matrix") { for (const k of ["row", "col", "value"]) if (blank(d.spec[k])) faults.push(`la spec de la matrice n'a pas de colonne « ${k} »`);
    if (!d.spec.scale?.bins || !d.spec.scale?.labels) faults.push("la spec de la matrice n'a pas d'échelle (scale.bins, scale.labels)"); }
  const hex = JSON.stringify(d.spec).match(/#[0-9a-fA-F]{3,6}\b/);
  if (hex) faults.push(`la spec écrit une couleur (${hex[0]}) : une couleur est une référence de la charte, « theme:data.highlight » par exemple`);
  for (const [name, v] of Object.entries(d.spec.values || {})) {
    if (blank(v?.column)) faults.push(`la valeur « ${name} » ne dit pas sa colonne`);
    if (v?.row == null && v?.rank == null) faults.push(`la valeur « ${name} » ne dit ni sa ligne (row, un libellé) ni son rang (rank)`);
  }
  if (d.link && d.no_link) faults.push("la source a un lien (lien_source) et un motif d'absence de lien (sans_adresse) : l'un ou l'autre");
  if (d.link && !/^https?:\/\/\S+$/.test(d.link)) faults.push(`le lien de la source « ${d.link} » n'est pas une adresse http(s)`);
  for (const m of String(d.subtitle || "").matchAll(/\{(\w+)(?::\.\d)?\}/g)) if (!(d.spec.values || {})[m[1]]) faults.push(`le sous-titre demande {${m[1]}}, que la spec ne relie à aucune cellule (values.${m[1]})`);
  if (faults.length) { const e = new Error(`brouillon ${figure ?? "?"} : ${faults.join(" ; ")}`); e.faults = faults; throw e; }
  return d;
}

// The spec the engine draws with (contract §5): the form's own keys, with defaults.
export function engineSpec(d) {
  const s = d.spec;
  if (d.kind === "bars") return { kind: "bars",
    classes: s.classes ?? { bar: { color: s.color ?? "theme:data.highlight", ...(s.legend ? { legend: s.legend } : {}) } },
    ...(s.mark ? { mark: s.mark } : {}), ...(s.tail_header ? { tail_header: s.tail_header } : {}) };
  return { kind: "matrix", scale: { palette: s.scale.palette ?? "theme:data.sequential", bins: s.scale.bins, labels: s.scale.labels },
    states: s.states ?? {}, ...(s.empty_state ? { empty_state: s.empty_state } : {}),
    show_values: s.show_values !== false, ...(s.cell_stroke ? { cell_stroke: s.cell_stroke } : {}) };
}

// What a figure.json carries for its draft; the same object in the widget.
export const figureMeta = d => ({ format: "figdot.figure/2", title: d.title, form: "spec", ...(d.unit ? { unit: d.unit } : {}), charte: d.charte,
  draft: { figure: d.figure, iteration: d.iteration, subtitle: d.subtitle, option: d.option, perimeter: d.perimeter,
    source: d.source, ...(d.link ? { link: d.link } : {}), ...(d.no_link ? { no_link: d.no_link } : {}), table: d.table, kind: d.kind, spec: d.spec } });

// A cell read as a number: a number as is, an empty cell as "not measured" (null),
// anything else that is not a number is an error, never a zero.
const num = (v, where) => {
  if (typeof v === "number") return v;
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${where} : « ${v} » n'est pas un nombre`);
  return n;
};

// Rows of the data table -> what the form draws, and the values of the sentence.
export function place(draft, rows) {
  const s = draft.spec;
  const has = c => rows.length === 0 || c in rows[0];
  for (const c of [s.label, s.value, s.row, s.col, s.class].filter(Boolean)) if (!has(c)) throw new Error(`la table ${draft.table} n'a pas de colonne ${c}`);
  if (draft.kind === "bars") {
    let list = rows.map(r => ({ label: String(r[s.label] ?? ""), value: num(r[s.value], `${s.value}, ligne « ${r[s.label]} »`), cls: s.class ? String(r[s.class]) : "bar", row: r }));
    if (s.sort === "desc") list = [...list].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    else if (s.sort === "asc") list = [...list].sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
    const values = pick(draft, list.map(x => x.row), s.label);
    return { values, encoded: { rows: list.map(({ label, value, cls }) => ({ label, value, cls, ...(s.missing ? { missing_text: s.missing } : {}) })) },
      table: { headers: s.headers ?? [s.label, s.value], rows: list.map(x => [x.label, x.value]) } };
  }
  const rowsL = [], colsL = [], at = new Map();
  for (const r of rows) {
    const a = String(r[s.row]), b = String(r[s.col]);
    if (!rowsL.includes(a)) rowsL.push(a);
    if (!colsL.includes(b)) colsL.push(b);
    if (at.has(`${a}\u0000${b}`)) throw new Error(`la table ${draft.table} a deux lignes pour « ${a} » et « ${b} »`);
    at.set(`${a}\u0000${b}`, num(r[s.value], `${s.value}, « ${a} », « ${b} »`));
  }
  const cells = rowsL.map(a => colsL.map(b => {
    const v = at.get(`${a}\u0000${b}`);
    if (v != null) return { value: v };
    if (!s.empty_state) throw new Error(`la matrice n'a pas de valeur pour « ${a} », « ${b} » : déclarez son état (empty_state et states)`);
    return { state: s.empty_state };
  }));
  return { values: pick(draft, rows, s.row), encoded: { rows: rowsL, cols: colsL, cells },
    table: { headers: s.headers ?? [s.row, s.col, s.value], rows: rows.map(r => [String(r[s.row]), String(r[s.col]), num(r[s.value], s.value)]) } };
}

// Each value of the sentence is one cell: its row by label (row; and col, for a
// matrix) or by rank in the order drawn (rank, from 1), its column. A number when the column is the value
// column or the spec says { as: "number" }; text otherwise.
function pick(draft, ordered, labelCol) {
  const s = draft.spec, out = {};
  for (const [name, v] of Object.entries(s.values || {})) {
    // a matrix cell is named by its row and its column: { row, col, column }
    const r = v.rank != null ? ordered[v.rank - 1]
      : ordered.find(x => String(x[labelCol]) === String(v.row) && (v.col == null || String(x[s.col]) === String(v.col)));
    if (!r) throw new Error(`la valeur « ${name} » vise ${v.rank != null ? `le rang ${v.rank}` : `la ligne « ${v.row} »${v.col != null ? `, colonne « ${v.col} »` : ""}`}, absente de la table ${draft.table}`);
    if (!(v.column in r)) throw new Error(`la valeur « ${name} » vise la colonne ${v.column}, absente de la table ${draft.table}`);
    const asNumber = v.as ? v.as === "number" : v.column === s.value;
    out[name] = asNumber ? num(r[v.column], `la valeur « ${name} »`) : String(r[v.column] ?? "");
    if (out[name] == null) throw new Error(`la valeur « ${name} » est une cellule vide : une phrase ne dit pas un nombre absent`);
  }
  return out;
}

// compute (contract §4), for every figure of a drafts collection and for the widget.
// source.tables[<table id>] = { rows, as_of, files? }.
export default function compute({ source, figure, figdot }) {
  const d = { ...figure.draft, title: figure.title };
  const t = source.tables?.[d.table];
  if (!t) throw new Error(`no snapshot of table ${d.table}: import it first`);
  const { values, encoded, table } = place(d, t.rows);
  const html = figdot.fillTemplate(d.subtitle, values, { bold: true });
  return {
    subtitle: { html, text: figdot.stripTags(html) },
    perimeter: d.perimeter,
    ...(d.option ? { option_label: d.option } : {}),
    sources: [{ words: d.source, as_of: t.as_of ?? null, ...(d.link ? { link: d.link } : {}), ...(d.no_link ? { no_link: d.no_link } : {}), ...(t.files ? { files: t.files } : {}) }],
    encoded, table,
  };
}
