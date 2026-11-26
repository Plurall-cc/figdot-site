// Le registre des formes (FD06, D44 et D58). Une forme est un module à signature
// commune :
//
//   draw(encoded, spec, theme, { width, target, locale }) -> { svg, width, height, legend }
//
// - `encoded` : les données préparées par la collection (rien n'y est compté ici) ;
// - `spec` : le spec de la figure, validé contre le `schema` de la forme ;
// - `theme` : la charte telle que la cible la voit, complétée de ce que FigDot dérive (D63) ;
// - `width` : la largeur intérieure ; le SVG ne la dépasse jamais.
//
// Chaque forme déclare aussi :
// - `capability(spec)` : ce que la charte doit pouvoir porter (D60 à D63), une de CAPABILITIES, ou null ;
// - `minWidth` : la plus petite largeur où elle se dessine ; en dessous, une erreur qui le dit ;
// - `narrow` : en mots, ce qu'elle fait aux petites largeurs ;
// - `name` : son nom, en français.
//
// Ce fichier est pur : le widget Grist l'exécute dans un navigateur. Il ne connaît que
// les deux formes de FD01 (barres, matrice). Les formes qui calculent avec D3 sont
// réunies dans catalog.mjs, que seul Node charge : aucune ne va dans une page publique
// ni dans le widget.
import { drawBars } from "../spec/bars.mjs";
import { drawMatrix } from "../spec/matrix.mjs";

const REF = { type: "string", pattern: "^(theme|collection):" };

export const BARS = {
  kind: "bars", name: "barres", draw: drawBars, minWidth: 60,
  capability: () => "barres",
  narrow: "à 640 px ou moins (composition.narrow), si un libellé devait être coupé, chaque libellé passe au-dessus de sa barre, entier ; sous 60 px de place pour les barres, erreur",
  schema: { type: "object", required: ["kind", "classes"], properties: {
    kind: { const: "bars" },
    classes: { type: "object" },
    mark: { type: "object", properties: { at: { type: "number" }, label: { type: "string" } } },
    tail_header: { type: "string" },
    // FD10 : une seconde colonne de nombres, d'une autre nature que la barre ; jamais dessinée
    extra: { type: "object", required: ["header"], additionalProperties: false, properties: { header: { type: "string", minLength: 1 }, unit: { type: "string", minLength: 1 }, decimals: { type: "number", minimum: 0, maximum: 6 } } },
  } },
};

export const MATRIX = {
  kind: "matrix", name: "matrice", draw: drawMatrix, minWidth: 14,
  // une matrice qui peint avec la palette divergente ne dépend pas de la rampe (FD05)
  capability: spec => (spec?.scale?.palette === "theme:data.diverging" ? null : "matrice"),
  narrow: "les en-têtes de colonnes se tournent de 90° quand ils ne tiennent pas ; sous 14 px par cellule, erreur",
  schema: { type: "object", required: ["kind", "scale"], properties: {
    kind: { const: "matrix" },
    scale: { type: "object", required: ["palette", "bins", "labels"], properties: { bins: { type: "array" }, labels: { type: "array" } } },
    states: { type: "object" }, empty_state: { type: "string" }, show_values: { type: "boolean" }, cell_stroke: REF,
  } },
};

const NEED = ["kind", "name", "draw", "capability", "schema", "minWidth", "narrow"];
// Un registre : des formes, chacune complète, chacune sous son nom de spec.
export function registry(...shapes) {
  const out = {};
  for (const s of shapes) {
    const miss = NEED.filter(k => s[k] == null);
    if (miss.length) throw new Error(`forme ${s.kind ?? "?"} : il manque ${miss.join(", ")}`);
    if (out[s.kind]) throw new Error(`forme ${s.kind} : déclarée deux fois`);
    out[s.kind] = Object.freeze({ ...s });
  }
  return Object.freeze(out);
}

export const BASE = registry(BARS, MATRIX);
export { REF };
