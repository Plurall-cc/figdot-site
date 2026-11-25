// The pure part of themes and chart-family profiles: no file system, no Node
// module. It runs in a browser as it runs in Node (FD04, lot 0 c).
//
// A chart-family profile (FD04, D21; docs/chart-family-profile.md) has three tiers:
//   1. tokens       tokens.json, a Design Tokens file (format module 2025.10):
//                   colours, fonts, dimensions, under the design system's own names;
//   2. style        profile.json "style": what the figure uses, by role, each a
//                   reference "{group.token}" into the tokens or a value of its own;
//                   palettes by use are ordered lists of references;
//   3. composition  profile.json "composition": what the charter may set in the
//                   frame (margins, title colour, rule bar, mentions layout, narrow
//                   widths). Never the sentence, numbers, rule, perimeter or sources.
// The engine draws from one internal theme object (the shape theme.json files had
// before FD04). compileProfile turns tokens + profile into that object; the
// former theme.json files are read through the same table (legacyToProfile).

export const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
const set = (obj, path, v) => {
  const ks = path.split("."); let o = obj;
  for (const k of ks.slice(0, -1)) o = (o[k] ??= {});
  const k = ks[ks.length - 1];
  // two places may fill the same group (data.categorical and the rest of data): merged, never overwritten
  o[k] = o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) && v && typeof v === "object" && !Array.isArray(v) ? { ...o[k], ...v } : v;
};

export const REQUIRED = [
  "color.ink", "color.ink_2", "color.ink_3", "color.line", "color.line_soft", "color.paper",
  "color.accent", "color.title", "color.rule_bar",
  "data.categorical", "data.sequential", "data.diverging", "data.highlight", "data.muted",
  "data.not_measured.fill", "data.not_measured.stroke", "data.not_classified.fill", "data.not_classified.stroke",
  "type.family", "type.family_public", "type.size.title", "type.size.sentence", "type.size.label",
  "type.size.small", "type.weight.regular", "type.weight.medium", "type.weight.bold",
  "type.line_height.title", "type.line_height.text", "type.metrics",
  "space.pad", "space.block", "space.inline", "space.row", "space.bar", "space.swatch",
  "stroke.hairline", "stroke.regular", "stroke.strong",
  "frame.rule_height",
];

// What the engine used to fix in its own code (FD04 inventory, a), now read from
// the charter. The defaults are the former fixed values: a theme that says nothing
// draws exactly as before.
export const DEFAULTS = {
  figure: {
    legend: "legend",                         // "legend" only: the engine does not label directly yet
    text: { label: "ink_2", value: "ink", secondary: "ink_3" },
    mark: { dash: "2 3", color: "ink_3" },
    bars: { label_share: 0.34 },
    matrix: { gap: 1, label_share: 0.32, min_cell: 14, ink_switch: 0.35 },
    trace: { width: 2, point: 3.5 },          // a line drawn by a figure of its own (a curve) and its points
  },
  frame: {
    narrow: 640,
    text: { sentence: "ink", note: "ink_2", mention_label: "ink_2", mention_text: "ink_3", credit: "ink_3" },
  },
};

// ---------- where each value of the internal theme sits in a profile ----------
// [internal path, profile path]. The most specific path wins.
export const PLACES = [
  ["color.title", "composition.title.color"],
  ["color.rule_bar", "composition.rule_bar.color"],
  ["space.pad", "composition.pad"],
  ["frame.rule_height", "composition.rule_bar.height"],
  ["frame.footer", "composition.footer"],
  ["frame.narrow", "composition.narrow"],
  ["frame.text", "composition.text"],
  ["brand", "composition.brand"],
  ["data.categorical", "style.palettes.categorical"],
  ["data.sequential", "style.palettes.sequential"],
  ["data.diverging", "style.palettes.diverging"],
  ["color", "style.color"],
  ["data", "style.data"],
  ["type", "style.type"],
  ["space", "style.space"],
  ["stroke", "style.stroke"],
  ["figure", "style.figure"],
];
const META = ["format", "name", "description", "publishable", "source", "extends", "resolved_from"];

const isPair = v => v && typeof v === "object" && !Array.isArray(v) && "value" in v && "from" in v;
const isLeaf = v => v == null || typeof v !== "object" || Array.isArray(v) || isPair(v);

// Move every value of `obj` from one side of the table to the other.
function relocate(obj, table) {
  const out = {};
  const walk = (node, path) => {
    const deeper = table.some(([from]) => from.startsWith(path + "."));
    if (!deeper || isLeaf(node)) {
      const rule = table.filter(([from]) => path === from || path.startsWith(from + "."))
        .sort((a, b) => b[0].length - a[0].length)[0];
      if (!rule) throw new Error(`no place for "${path}"`);
      set(out, rule[1] + path.slice(rule[0].length), node);
      return;
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  for (const [k, v] of Object.entries(obj)) {
    if (META.includes(k)) { out[k] = v; continue; }
    walk(v, k);
  }
  return out;
}
const backwards = PLACES.map(([a, b]) => [b, a]);
export const legacyToProfile = raw => relocate(raw, PLACES);

// ---------- Design Tokens (format module 2025.10) ----------
// La clé sous laquelle FigDot range ce qu'il ajoute à un jeton ($extensions). UNE SEULE constante, ici :
// elle sera renommée avant la publication du code (D61), et ce renommage ne doit toucher que cette ligne
// (et les fichiers de jetons, qui sont des données). tests/extension-key.test.mjs refuse la chaîne ailleurs.
export const FIGDOT_EXT = "cc.plurall.figdot";
const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif",
  "ui-monospace", "ui-rounded", "emoji", "math", "fangsong", "-apple-system", "BlinkMacSystemFont"]);

// Every token of a document: path -> { type, value, ext, description }. A group's
// $type passes to its tokens (§5.2.2). A name starting with "$" is a property.
export function tokenTable(doc) {
  const out = new Map();
  const walk = (node, path, type) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if ("$value" in node) { out.set(path, { type: node.$type ?? type, value: node.$value, ext: node.$extensions?.[FIGDOT_EXT], description: node.$description }); return; }
    const t = node.$type ?? type;
    for (const [k, v] of Object.entries(node)) if (!k.startsWith("$")) walk(v, path ? `${path}.${k}` : k, t);
  };
  walk(doc || {}, "", undefined);
  return out;
}

// Two token documents, the later winning token by token (resolver module §6.2):
// a token is replaced whole, a group merged key by key.
export function mergeTokens(a, b) {
  if (!b) return a;
  if (!a) return b;
  const leaf = v => !v || typeof v !== "object" || Array.isArray(v) || "$value" in v;
  if (leaf(a) || leaf(b)) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? mergeTokens(a[k], v) : v;
  return out;
}

const hex2 = n => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, "0").toUpperCase();
export function colorHex(v, where = "colour") {
  if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) return v;     // not the 2025.10 form; the validator says so
  if (v && typeof v === "object") {
    if (typeof v.hex === "string" && /^#[0-9a-fA-F]{6}$/.test(v.hex)) return v.hex;
    if (v.colorSpace === "srgb" && Array.isArray(v.components) && v.components.length === 3) return "#" + v.components.map(hex2).join("");
    throw new Error(`${where}: only sRGB colours (or a "hex" value) are read; got colorSpace ${v.colorSpace}`);
  }
  throw new Error(`${where}: not a colour: ${JSON.stringify(v)}`);
}
export const hexColor = hex => ({ colorSpace: "srgb", components: [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) / 255 * 10000) / 10000), hex });

export function cssFamily(v, ext) {
  if (ext?.css) return ext.css;                                    // the exact stack, when the charter keeps one
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(n => (GENERIC.has(n) ? n : `"${n}"`)).join(", ");
  throw new Error(`not a font family: ${JSON.stringify(v)}`);
}
const WEIGHTS = { thin: 100, hairline: 100, "extra-light": 200, "ultra-light": 200, light: 300, normal: 400, regular: 400, book: 400,
  medium: 500, "semi-bold": 600, "demi-bold": 600, bold: 700, "extra-bold": 800, "ultra-bold": 800, black: 900, heavy: 900 };

// A token's value as the engine uses it.
export function tokenValue(tok, path) {
  const { type, value } = tok;
  switch (type) {
    case "color": return colorHex(value, `token ${path}`);
    case "dimension":
      if (typeof value === "number") return value;
      if (value?.unit === "px") return value.value;
      if (value?.unit === "rem") return value.value * 16;           // 1rem = 16px, the browsers' default
      throw new Error(`token ${path}: a dimension in ${value?.unit} is not read (px or rem)`);
    case "fontFamily": return cssFamily(value, tok.ext);
    case "fontWeight": return typeof value === "number" ? value : WEIGHTS[value] ?? (() => { throw new Error(`token ${path}: font weight "${value}" unknown`); })();
    default: return value;
  }
}

// "{color.blue}" -> its value, following aliases (§7.1.1, §7.2.2), refusing loops (§7.2.3).
export function resolveRef(table, ref, seen = []) {
  const path = ref.slice(1, -1);
  if (seen.includes(path)) throw new Error(`token reference loops: ${[...seen, path].join(" -> ")}`);
  const tok = table.get(path);
  if (!tok) throw new Error(`no token ${ref}`);
  if (typeof tok.value === "string" && /^\{[^{}]+\}$/.test(tok.value)) {
    const target = table.get(tok.value.slice(1, -1));
    const r = resolveRef(table, tok.value, [...seen, path]);
    return { ...r, type: tok.type ?? target?.type };
  }
  return { value: tokenValue(tok, path), from: tok.ext?.from ?? tok.description ?? `token ${path}`, type: tok.type };
}
export const isRef = v => typeof v === "string" && /^\{[^{}]+\}$/.test(v);

// tokens + profile (both already merged along `extends`) -> the internal theme,
// with { value, from } wherever a provenance is known.
export function compileProfile(profile, tokens) {
  const table = tokenTable(tokens);
  const ref = (v, path) => { try { return resolveRef(table, v); } catch (e) { throw new Error(`${path}: ${e.message}`); } };
  const res = (v, path) => {
    if (isRef(v)) { const r = ref(v, path); return { value: r.value, from: r.from }; }
    if (isPair(v)) { if (isRef(v.value)) return { value: ref(v.value, path).value, from: v.from }; return v; }
    if (Array.isArray(v)) return v.map((x, i) => res(x, `${path}[${i}]`));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, res(x, `${path}.${k}`)]));
    return v;
  };
  const body = {};
  for (const k of ["style", "composition"]) if (profile[k]) body[k] = res(profile[k], k);
  const raw = relocate(body, backwards);
  for (const k of META) if (k in profile && k !== "extends") raw[k] = profile[k];
  return raw;
}

// Objects merge key by key; a leaf, a list (a palette) or a { value, from } pair
// is replaced whole (FD03, A6; kept by FD04 for palettes: a ramp is replaced whole).
export function mergeTheme(base, over) {
  if (isLeaf(base) || isLeaf(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in base ? mergeTheme(base[k], v) : v;
  return out;
}

export function flatten(node, path, prov) {
  if (isPair(node)) { prov[path] = node.from; return flatten(node.value, path, prov); }
  if (Array.isArray(node)) return node.map((v, i) => flatten(v, `${path}.${i}`, prov));
  if (node && typeof node === "object") {
    const o = {};
    for (const [k, v] of Object.entries(node)) o[k] = flatten(v, path ? `${path}.${k}` : k, prov);
    return o;
  }
  return node;
}

// The internal theme, ready to draw: values flattened, provenance listed,
// defaults filled in, required tokens checked.
export function finishTheme(raw) {
  const provenance = {};
  const t = flatten(raw, "", provenance);
  t.provenance = provenance;
  t.figure = mergeTheme(DEFAULTS.figure, t.figure || {});
  t.frame = mergeTheme(DEFAULTS.frame, t.frame || {});
  t.type = t.type || {};
  t.type.files = t.type.files || [];
  const missing = REQUIRED.filter(p => get(t, p) == null);
  if (missing.length) throw new Error(`theme ${t.name}: missing tokens ${missing.join(", ")}`);
  return t;
}

// A colour reference from a collection: "theme:<path>" or a declared hex the
// collection owns. Anything else is an error, never a silent default.
export function resolveColor(theme, ref) {
  if (typeof ref !== "string") throw new Error(`colour reference must be a string: ${JSON.stringify(ref)}`);
  if (ref.startsWith("theme:")) {
    const path = ref.slice(6), v = get(theme, path);
    if (typeof v !== "string") {
      // a palette asked for beyond its end: said plainly, never recycled (FD03, HALT 1, answer 3)
      const m = /^(.*)\.(\d+)$/.exec(path), list = m && get(theme, m[1]);
      if (Array.isArray(list)) throw new Error(`theme ${theme.name} has ${list.length} colours in ${m[1]}; ${ref} asks for colour ${Number(m[2]) + 1}. `
        + `A figure with more classes than the palette must say so: use fewer classes, another theme, or colours of its own in the collection's palettes`);
      throw new Error(`theme ${theme.name} has no colour at ${ref}`);
    }
    return v;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(ref)) return ref;
  throw new Error(`unknown colour reference: ${ref}`);
}

// Text family for a target. A font whose licence is not established for public
// use is referenced only in internal outputs (FD01 HALT 1, Q6).
export const familyFor = (theme, target) =>
  target === "public" && !theme.type.public_font_ok ? theme.type.family_public : theme.type.family;

// The theme as one target sees it (FD03, A8).
export function forTarget(theme, target) {
  if (familyFor(theme, target) === theme.type.family) return theme;
  const metrics = theme.type.metrics_public;
  if (!metrics) throw new Error(`theme ${theme.name}: the public target writes in ${theme.type.family_public}, `
    + `but the theme has no advance widths for that family (type.metrics_public). Measure them: figdot metrics --theme ${theme.name} --write`);
  const family = theme.type.family_public;
  return { ...theme, type: { ...theme.type, family, metrics, public_font_ok: true, numeric: undefined, metrics_numeric: undefined,
    files: theme.type.files.filter(f => family.includes(f.family)),
    web_files: (theme.type.web_files || []).filter(f => family.includes(f.family)) } };
}
