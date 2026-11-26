// The validator of a chart-family profile (FD04, D21), pure: it takes the files
// already read and returns a report. Three parts:
//   1. each profile.json against the published schema (engine/schema/), and the
//      keys a composition may never set, named in clear;
//   2. each tokens.json against the rules of the Design Tokens format (2025.10);
//   3. a capability report: for each form the engine knows of (bars, matrix, map,
//      figure of its own), what the charter can carry, and if not, why.
// Thresholds are the engine's (docs/chart-family-profile.md, §5), not a collection's.
import { tokenTable, resolveRef, isRef, colorHex, FIGDOT_EXT } from "./theme-core.mjs";
import { contrast, dE, simulate, lab } from "./color.mjs";
import { THRESHOLDS, completeTheme } from "./derive.mjs";
import { BASE } from "./shapes/registry.mjs";

// ---------- 1. a small JSON Schema evaluator (the keywords the schema uses) ----------
export function schemaErrors(schema, value, root = schema, path = "") {
  const errs = [];
  const at = path || "(root)";
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], root);
    return schemaErrors(target, value, root, path);
  }
  const typeOf = v => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? "number" : typeof v);
  if (schema.anyOf) {
    if (!schema.anyOf.some(s => !schemaErrors(s, value, root, path).length)) errs.push(`${at}: ${JSON.stringify(value).slice(0, 60)} is not an accepted value (a {token} reference, { value, from }, or a value of the right kind)`);
    return errs;
  }
  if ("const" in schema && value !== schema.const) errs.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`);
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.includes(typeOf(value))) { errs.push(`${at}: expected ${types.join(" or ")}, got ${typeOf(value)}`); return errs; }
  }
  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${at}: "${value}" does not match ${schema.pattern}`);
    if (schema.minLength && value.length < schema.minLength) errs.push(`${at}: empty`);
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${at}: ${value} is below ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${at}: ${value} is above ${schema.maximum}`);
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) errs.push(`${at}: ${value} must be above ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) errs.push(`${at}: at least ${schema.minItems} item(s)`);
    if (schema.items) value.forEach((v, i) => errs.push(...schemaErrors(schema.items, v, root, `${path}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${at}: ${k} is required`);
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties?.[k];
      if (sub) errs.push(...schemaErrors(sub, v, root, path ? `${path}.${k}` : k));
      else if (schema.additionalProperties === false) errs.push(`${path ? `${path}.` : ""}${k}: not a key of the profile`);
    }
  }
  return errs;
}

// What a composition may never touch: said in words, not only as an unknown key.
export const NEVER = ["sentence", "numbers", "rule", "rules", "perimeter", "unit", "sources", "source", "notes", "table", "order", "title_text", "credit_text", "dating"];
export function profileErrors(schema, profile, file = "profile.json") {
  const errs = [];
  for (const k of Object.keys(profile.composition || {})) if (NEVER.includes(k))
    errs.push(`${file}: composition.${k}: a charter never sets the ${k} of a figure: the sentence, numbers, rule, perimeter, unit, sources, notes and table do not depend on the charter`);
  return errs.concat(schemaErrors(schema, profile).map(e => `${file}: ${e}`));
}

// ---------- 2. Design Tokens, format module 2025.10 ----------
const TYPES = ["color", "dimension", "fontFamily", "fontWeight", "duration", "cubicBezier", "number", "strokeStyle", "border", "transition", "shadow", "gradient", "typography"];
const WEIGHT_NAMES = ["thin", "hairline", "extra-light", "ultra-light", "light", "normal", "regular", "book", "medium", "semi-bold", "demi-bold", "bold", "extra-bold", "ultra-bold", "black", "heavy", "extra-black", "ultra-black"];
export function tokenErrors(doc, file = "tokens.json", { warn = [] } = {}) {
  const errs = [];
  const walk = (node, path, type) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) { errs.push(`${file}: ${path}: a group or token must be an object`); return; }
    const isToken = "$value" in node;
    const t = node.$type ?? type;
    if (node.$type && !TYPES.includes(node.$type)) errs.push(`${file}: ${path || "(root)"}: $type "${node.$type}" is not a type of the format (§8, §9)`);
    for (const k of Object.keys(node)) {
      if (k.startsWith("$")) {
        if (!["$value", "$type", "$description", "$extensions", "$deprecated", "$root", "$extends"].includes(k)) errs.push(`${file}: ${path}.${k}: unknown property`);
        continue;
      }
      if (/[{}.]/.test(k)) errs.push(`${file}: ${path ? path + "." : ""}${k}: a name may not contain { } or . (§5.1.1)`);
      if (isToken) { errs.push(`${file}: ${path}: a token cannot have children (§6.1)`); continue; }
      walk(node[k], path ? `${path}.${k}` : k, t);
    }
    if (!isToken) return;
    const v = node.$value;
    if (isRef(v)) return;                                    // checked once all names are known
    if (!t) { errs.push(`${file}: ${path}: no $type on the token or a parent group (§5.2.2)`); return; }
    if (t === "color") {
      if (typeof v === "string") warn.push(`${file}: ${path}: a colour written "${v}" is not the form of the format (an object with colorSpace and components, §8.1); FigDot reads it, other tools may not`);
      else if (!v || v.colorSpace == null || !Array.isArray(v.components)) errs.push(`${file}: ${path}: a colour is { colorSpace, components, alpha?, hex? } (§8.1)`);
      else {
        if (v.components.some(c => typeof c !== "number" || c < 0 || c > 1) && v.colorSpace === "srgb") errs.push(`${file}: ${path}: srgb components are numbers from 0 to 1`);
        if (v.hex != null && !/^#[0-9a-fA-F]{6}$/.test(v.hex)) errs.push(`${file}: ${path}: hex "${v.hex}" is not #rrggbb`);
        if (v.colorSpace === "srgb" && v.hex) {
          const back = "#" + v.components.map(c => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
          if (back.toLowerCase() !== v.hex.toLowerCase()) errs.push(`${file}: ${path}: components give ${back}, hex says ${v.hex}`);
        }
        if (v.colorSpace !== "srgb" && !v.hex) warn.push(`${file}: ${path}: colorSpace ${v.colorSpace} without hex: FigDot reads sRGB only`);
      }
    } else if (t === "dimension") {
      if (!v || typeof v.value !== "number" || !["px", "rem"].includes(v.unit)) errs.push(`${file}: ${path}: a dimension is { value, unit: "px" | "rem" } (§8.2)`);
    } else if (t === "fontFamily") {
      if (!(typeof v === "string" || (Array.isArray(v) && v.length && v.every(x => typeof x === "string")))) errs.push(`${file}: ${path}: a font family is a string or a list of strings (§8.3)`);
      const css = node.$extensions?.[FIGDOT_EXT]?.css;
      if (css && Array.isArray(v)) {
        const names = css.split(",").map(s => s.trim().replace(/^["']|["']$/g, ""));
        if (JSON.stringify(names) !== JSON.stringify(v)) errs.push(`${file}: ${path}: the CSS stack kept in $extensions names other families than $value`);
      }
    } else if (t === "fontWeight") {
      if (!((typeof v === "number" && v >= 1 && v <= 1000) || WEIGHT_NAMES.includes(v))) errs.push(`${file}: ${path}: a font weight is a number from 1 to 1000 or a name (§8.4)`);
    } else if (t === "number") {
      if (typeof v !== "number") errs.push(`${file}: ${path}: a number (§8.7)`);
    }
  };
  walk(doc, "", undefined);
  // references resolve, and do not loop (§7.1.1, §7.2.3)
  const table = tokenTable(doc);
  for (const [p, tok] of table) if (isRef(tok.value)) {
    try { resolveRef(table, `{${p}}`); } catch (e) { errs.push(`${file}: ${p}: ${e.message}`); }
  }
  return errs;
}

// Every reference of a profile names a token of the (merged) tokens.
export function referenceErrors(profile, tokens, file = "profile.json") {
  const table = tokenTable(tokens), errs = [];
  const walk = (v, path) => {
    if (isRef(v)) { try { resolveRef(table, v); } catch (e) { errs.push(`${file}: ${path}: ${e.message}`); } return; }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk({ style: profile.style, composition: profile.composition }, "");
  return errs;
}

// ---------- 3. capabilities ----------
export { THRESHOLDS } from "./derive.mjs";
const VISIONS = ["normal", "protan", "deutan", "tritan"];
const r2 = x => x.toFixed(2).replace(".", ",");

// Ce que les formes classées (matrice, carte) demandent à la rampe et au gris, mesuré sur une charte donnée.
function classedChecks(T, tokens) {
  const C = T.color, D = T.data, paper = C.paper, th = THRESHOLDS;
  const ramp = D.sequential;
  const rampL = ramp.map(c => lab(c)[0]);
  const monotone = rampL.every((v, i) => i === 0 || v < rampL[i - 1]);
  const first = contrast(ramp[0], paper);
  const neighbours = [];
  for (let i = 1; i < ramp.length; i++) {
    const worst = Math.min(...VISIONS.map(k => dE(simulate(ramp[i - 1], k), simulate(ramp[i], k))));
    if (worst < th.step_difference) neighbours.push(`marches ${i} et ${i + 1} (${ramp[i - 1]}, ${ramp[i]}) : écart de ${worst.toFixed(1).replace(".", ",")} dans la vision la moins favorable`);
  }
  const g = C.ink_4 ? contrast(C.ink_4, paper) : null;
  const greyOk = g != null && g >= th.grey[0] && g < th.grey[1];
  const greys = [];
  if (tokens) for (const [p, tok] of tokenTable(tokens)) if (tok.type === "color" && !isRef(tok.value)) {
    try { const h = colorHex(tok.value); const [, a, b] = lab(h); const c = contrast(h, paper);
      if (Math.hypot(a, b) < 8 && c >= th.grey[0] && c < th.grey[1]) greys.push(`${p} (${h}, ${r2(c)}:1)`); } catch {}
  }
  const greyWhy = greyOk ? null
    : g == null ? `il manque un gris intermédiaire : la charte n'a pas de quatrième encre (ink_4), entre ${th.grey[0]}:1 et ${String(th.grey[1]).replace(".", ",")}:1 sur le papier`
    : `il manque un gris intermédiaire : ink_4 (${C.ink_4}) fait ${r2(g)}:1 sur le papier, il faut entre ${th.grey[0]}:1 et ${String(th.grey[1]).replace(".", ",")}:1`
      + `${C.ink_3 ? ` ; ink_3 (${C.ink_3}) fait ${r2(contrast(C.ink_3, paper))}:1` : ""}`
      + (tokens ? (greys.length ? `. Jetons de la charte qui conviendraient : ${greys.join(", ")}` : ". Aucun gris des jetons de la charte ne tombe dans cet intervalle") : "");
  const rampWhy = [];
  if (ramp.length < th.ramp_steps) rampWhy.push(`la rampe séquentielle n'a que ${ramp.length} marches, il en faut ${th.ramp_steps}`);
  if (!monotone) rampWhy.push(`la rampe séquentielle ne va pas du clair au foncé (luminance ${rampL.map(v => v.toFixed(0)).join(", ")})`);
  if (first < th.first_step) rampWhy.push(`la première marche (${ramp[0]}) fait ${r2(first)}:1 sur le papier, il faut ${String(th.first_step).replace(".", ",")}:1 au moins pour la voir`);
  return { ramp, monotone, first, g, why: [...rampWhy, ...(greyWhy ? [greyWhy] : [])],
    warnings: neighbours.length ? [`marches voisines trop proches, à revoir (avertissement) : ${neighbours.join(" ; ")}`] : [] };
}

// Le rapport de capacités d'une charte. Pour les formes classées (matrice, carte), la charte est d'abord COMPLÉTÉE de ce
// que FigDot sait dériver (D63) : rampe trop courte ou à première marche invisible, gris intermédiaire absent ou hors
// intervalle. La forme ne « ne se construit pas » que pour ce qui ne se dérive pas (rampe non ordonnée du clair au foncé).
export function capabilities(theme, { tokens } = {}) {
  const T = theme, C = T.color, D = T.data, paper = C.paper, th = THRESHOLDS;
  const facts = [];
  const own = classedChecks(T, tokens);
  const ramp = own.ramp, first = own.first, g = own.g, monotone = own.monotone;

  const text = Object.entries(T.figure.text).map(([k, role]) => [k, role, contrast(C[role], paper)]).filter(([, , c]) => c < th.text);
  const hi = contrast(D.highlight, paper);
  const barsWhy = [];
  if (hi < th.graphic) barsWhy.push(`la couleur de mise en avant (${D.highlight}) fait ${r2(hi)}:1 sur le papier, il faut ${th.graphic}:1`);
  for (const [k, role, c] of text) barsWhy.push(`l'encre des ${k === "label" ? "libellés" : k === "value" ? "valeurs" : "textes secondaires"} (${role}) fait ${r2(c)}:1, il faut ${String(th.text).replace(".", ",")}:1`);

  const status = (why, warn = [], derived = []) => (why.length ? "ne se construit pas" : warn.length || derived.length ? "se construit, avec avertissements" : "se construit");
  const classed = form => {
    const done = completeTheme(T, form), c = classedChecks(done.theme, tokens);
    return { classed: c, derived: done.derived, theme: done.theme };
  };
  const mat = classed("matrice"), car = classed("carte");
  // FD06 : les formes à traits du catalogue (pentes, étendue, nuage, frise). Elles demandent ce que demandent les
  // barres (mise en avant, encres) et un gris intermédiaire pour leurs traits secondaires, que FigDot dérive (D63).
  const traced = (form, carries) => {
    const done = completeTheme(T, form), g2 = done.theme.color.ink_4 ? contrast(done.theme.color.ink_4, paper) : null;
    const why = [...barsWhy, ...(g2 == null || g2 < th.grey[0] || g2 >= th.grey[1] ? ["il manque un gris intermédiaire"] : [])];
    return { form, engine: true, status: status(why, [], done.derived), why, derived: done.derived, carries, cannot: [] };
  };
  const forms = [
    { form: "barres", engine: true, status: status(barsWhy), why: barsWhy,
      carries: ["mise en avant, retrait, couleurs des classes", "encres des libellés, des valeurs et des textes secondaires", "repère en pointillé", "part des libellés", "largeur d'empilement des libellés"],
      cannot: ["l'étiquetage direct : le moteur ne sait que la légende"] },
    { form: "matrice", engine: true, status: status(mat.classed.why, mat.classed.warnings, mat.derived), why: mat.classed.why, warnings: mat.classed.warnings, derived: mat.derived,
      carries: [`rampe séquentielle (${mat.theme.data.sequential.length} marches${mat.derived.length ? ", dont des marches dérivées" : ""}), divergente (${D.diverging.length})`, "espace entre cellules, cellule minimale, bascule encre ou papier", "états nommés (non mesuré, non classé)"],
      cannot: [] },
    { form: "carte", engine: true, status: status(car.classed.why, car.classed.warnings, car.derived), why: car.classed.why, warnings: car.classed.warnings, derived: car.derived,
      carries: [`rampe séquentielle (${car.theme.data.sequential.length} marches${car.derived.length ? ", dont des marches dérivées" : ""})`, "limites intérieures (stroke.hairline, gris intermédiaire), contour (stroke.strong)"],
      cannot: ["une projection autre que le plan (coordonnées déjà projetées) : la forme « carte » du catalogue (FD06) ne projette pas"] },
    traced("pentes", ["une ligne par série (trace), mise en avant, retrait", "étiquettes directes aux deux dates"]),
    traced("étendue", ["un trait par ligne, du minimum au maximum (gris intermédiaire), extrémités en points (mise en avant)", "valeurs aux extrémités"]),
    traced("nuage", ["un point par ligne (trace.point, mise en avant)", "droite de repère (gris intermédiaire, pointillé du repère)", "graduations"]),
    traced("frise", ["une ligne par série (gris intermédiaire)", "un point par événement daté (mise en avant)", "graduations de dates"]),
    traced("essaim", ["un point par individu (trace.point), en retrait (gris intermédiaire) ou mis en avant", "étiquettes directes des points mis en avant", "graduations"]),
    traced("radar", ["des axes ramenés à une même échelle (normalisation dite par le spec, écrite en note)", "une série mise en avant (trace, sommets), les autres au gris intermédiaire", "anneaux et axes au filet", "noms d'axes directs"]),
    traced("flux", ["des nœuds (gris intermédiaire, mise en avant), des liens en bandes (filet de la charte, bordés du papier ; mis en avant)", "étiquettes directes des nœuds avec leur valeur", "liens trop fins au trait fin, et leur nombre dit"]),
    { form: "figure sur mesure", engine: false, status: "se construit", why: [],
      carries: ["tout jeton que le contrat nomme (couleurs, palettes, tailles, graisses, traits, espaces, trace)"],
      cannot: ["ce que le code de la figure fixerait lui-même : interdit, et vérifié par tests/literals.test.mjs"] },
  ];
  facts.push(`rampe séquentielle : ${ramp.length} marches, première à ${r2(first)}:1 sur le papier${monotone ? "" : ", NON ordonnée"}`);
  facts.push(`gris intermédiaire (ink_4) : ${g == null ? "absent" : `${C.ink_4}, ${r2(g)}:1`}`);
  facts.push(`palette catégorielle : ${D.categorical.length} couleurs ; divergente : ${D.diverging.length}`);
  return { forms, facts, thresholds: th };
}

// ---------- D60 (FD05) : une figure ne se publie pas sous une charte qui ne peut pas la porter ----------
// Une figure déclarative a la capacité de sa forme (barres, matrice) ; une figure sur mesure la
// déclare, si elle veut être contrôlée, par `"capability"` dans figure.json (« carte », « figure sur
// mesure »…). Sans déclaration, le moteur n'en sait rien : la figure reste refusée par son propre
// dessin quand la charte lui manque (palette trop courte), jamais par ce verdict.
export const CAPABILITIES = ["barres", "matrice", "carte", "pentes", "étendue", "nuage", "frise", "essaim", "flux", "radar", "figure sur mesure"];

// La capacité que demande une forme déclarative, d'après son spec. Une matrice peint ses classes avec la rampe
// séquentielle de la charte, sauf si son spec nomme la palette divergente : elle ne dépend alors pas de la rampe.
// FD06 : chaque forme du registre déclare la sienne (shapes/registry.mjs).
export const capabilityOfSpec = (spec, shapes = BASE) => shapes[spec?.kind]?.capability(spec) ?? null;

export function capabilityNeeded(meta, spec, shapes = BASE) {
  const c = meta?.capability ?? capabilityOfSpec(spec, shapes);
  if (c != null && !CAPABILITIES.includes(c)) throw new Error(`capability « ${c} » : une de ${CAPABILITIES.join(", ")}`);
  return c;
}

// Le verdict d'une charte pour une capacité, d'après le rapport de capacités (mêmes seuils). `state` est
// l'état de revue de la figure : publiée, elle est refusée ; sinon (brouillon) elle se construit, avec l'avertissement.
export function verdict(theme, capability, { state = "draft", title = null, tokens } = {}) {
  if (!capability) return { refuse: false, warnings: [], why: [] };
  const form = capabilities(theme, { tokens }).forms.find(f => f.form === capability);
  const what = title ? `la figure « ${title} » (${capability})` : `une figure « ${capability} »`;
  const blocked = form.status === "ne se construit pas";
  const why = form.why, notes = form.warnings || [], derived = form.derived || [];
  const head = `La charte « ${theme.name} » ne peut pas porter ${what}`;
  const refuse = blocked && state === "published";
  return {
    capability, why, refuse,
    message: blocked ? `${head} : ${why.join(" ; ")}.` : null,
    warnings: [
      ...(blocked && !refuse ? [`${head} : ${why.join(" ; ")}. Elle ne pourra pas être publiée sous cette charte.`] : []),
      // D63 : ce que FigDot a dérivé pour que la forme se construise, dit à chaque fois
      ...(derived.length ? [`La charte « ${theme.name} » est complétée par FigDot pour ${what} : ${derived.join(" ; ")}.`] : []),
      ...(notes.length ? [`Sous la charte « ${theme.name} », ${notes.join(" ; ")}.`] : []),
    ],
  };
}
