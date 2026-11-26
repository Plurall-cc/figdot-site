// Compléter une charte par dérivation tracée (D63, FD05). Une charte faite pour des documents n'a pas
// toujours de quoi rendre une carte ou une matrice : une rampe séquentielle trop courte, une première marche
// invisible sur le papier, pas de gris intermédiaire. Plutôt que de refuser la figure, FigDot dérive ce qui
// manque DES COULEURS DE LA CHARTE, par un calcul déterministe, et le dit : chaque valeur dérivée porte sa
// provenance (« dérivé par FigDot : … ») et sort en avertissement. Les couleurs de la charte sont gardées
// telles quelles ; seules s'ajoutent des marches intercalées, ou la première marche est assombrie, ou le gris
// est (re)calculé. Pur : aucun module de Node, le widget l'exécute aussi.
import { contrast, dE, mix } from "./color.mjs";

// Les seuils de la charte (docs/chart-family-profile.md, section 6). Ils vivent ici, le validateur les reprend.
export const THRESHOLDS = {
  ramp_steps: 5,          // une forme classée (matrice, carte) demande cinq marches d'une rampe séquentielle
  first_step: 1.5,        // sa première marche visible sur le papier
  grey: [3, 4.5],         // un gris intermédiaire : visible comme un trait (3:1), plus discret qu'un texte (4,5:1)
  text: 4.5,
  graphic: 3,
  step_difference: 10,
};
const LIGHT_FIRST = 3;     // une première marche visible jusqu'à 3:1 est « claire » : on la garde pour commencer la rampe
const GREY_TARGET = 3.6;  // visé quand on dérive : au milieu de l'intervalle, loin de ses deux bords
const fmt = x => x.toFixed(2).replace(".", ",");

// Le point du chemin from -> to (en OKLab) où le contraste avec le papier atteint juste `target`.
const pointAt = (from, to, paper, target) => {
  let lo = 0, hi = 1;
  for (let k = 0; k < 24; k++) { const t = (lo + hi) / 2; if (contrast(mix(from, to, t), paper) >= target) hi = t; else lo = t; }
  return mix(from, to, hi);
};

// La rampe, rendue visible puis étendue à `n` marches. Les marches de la charte qui comptent sont gardées telles
// quelles. (1) Les marches de tête invisibles sur le papier (moins de `firstStep`:1) sont remplacées par UNE
// première marche, prise sur le chemin des couleurs de la charte à `firstStep`:1. (2) On intercale ensuite le milieu
// (OKLab) de la paire de marches voisines la plus éloignée, jusqu'à `n`.
export function deriveRamp(ramp, paper, ink, n = THRESHOLDS.ramp_steps, firstStep = THRESHOLDS.first_step) {
  const vis = h => contrast(h, paper) >= firstStep;
  let steps = ramp.map(hex => ({ hex, own: true }));
  const notes = [];
  const v = steps.findIndex(x => vis(x.hex));
  if (v < 0) {
    const first = pointAt(steps[steps.length - 1].hex, ink, paper, firstStep);
    notes.push(`aucune marche de la rampe n'est visible sur le papier (${ramp.map(h => `${h} ${fmt(contrast(h, paper))}:1`).join(", ")}) : une marche ${first} (${fmt(contrast(first, paper))}:1) est dérivée vers l'encre`);
    steps = [{ hex: first, own: false, lead: true }];
  } else if (v > 0) {
    const dropped = steps.slice(0, v).map(x => `${x.hex} (${fmt(contrast(x.hex, paper))}:1)`);
    const sub = `${v > 1 ? "les marches" : "la marche"} ${dropped.join(", ")} ${v > 1 ? "sont invisibles" : "est invisible"} sur le papier (il faut ${fmt(firstStep)}:1)`;
    if (contrast(steps[v].hex, paper) <= LIGHT_FIRST) {
      // la première marche visible de la charte est assez claire pour commencer la rampe : on écarte seulement les invisibles
      notes.push(`${sub} : écartée${v > 1 ? "s" : ""}, la rampe commence à ${steps[v].hex} (${fmt(contrast(steps[v].hex, paper))}:1)`);
      steps = steps.slice(v);
    } else {
      const first = pointAt(steps[v - 1].hex, steps[v].hex, paper, firstStep);
      notes.push(`${sub} : remplacée${v > 1 ? "s" : ""} par une première marche ${first} (${fmt(contrast(first, paper))}:1), prise sur le chemin des couleurs de la charte`);
      steps = [{ hex: first, own: false, lead: true }, ...steps.slice(v)];
    }
  } else if (steps.length === 1) steps = [{ hex: pointAt(paper, steps[0].hex, paper, firstStep), own: false }, ...steps];
  while (steps.length < n) {
    if (steps.length === 1) { steps.push({ hex: mix(steps[0].hex, ink, 0.6), own: false }); continue; }
    let at = 0, best = -1;
    for (let k = 0; k < steps.length - 1; k++) { const d = dE(steps[k].hex, steps[k + 1].hex); if (d > best) { best = d; at = k; } }
    steps.splice(at + 1, 0, { hex: mix(steps[at].hex, steps[at + 1].hex, 0.5), own: false });
  }
  const added = steps.map((x, k) => [x, k + 1]).filter(([x]) => !x.own && !x.lead);
  if (added.length) {
    const list = added.map(([x, k]) => `${k} (${x.hex})`);
    notes.unshift(`la rampe séquentielle compte ${steps.length} marches (${ramp.length} dans la charte) : ${list.length > 1 ? "marches" : "marche"} ${list.join(", ")} intercalée${list.length > 1 ? "s" : ""} entre deux marches voisines de la charte`);
  }
  return { colors: steps.map(x => x.hex), derived: notes.length > 0, notes, from: "dérivé par FigDot : première marche rendue visible, marches intercalées en OKLab entre celles de la charte" };
}

// Un gris intermédiaire entre le papier et l'encre, à GREY_TARGET:1 sur le papier.
export function deriveGrey(ink, paper, target = GREY_TARGET) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 24; k++) { const t = (lo + hi) / 2; if (contrast(mix(paper, ink, t), paper) >= target) hi = t; else lo = t; }
  const hex = mix(paper, ink, hi);
  return { hex, ratio: contrast(hex, paper), from: `dérivé par FigDot : mélange du papier et de l'encre (${ink}) en OKLab, ${fmt(contrast(hex, paper))}:1 sur le papier` };
}

// La charte telle qu'une figure de cette capacité la voit : complétée de ce qu'on sait dériver.
// Rend { theme, derived: [phrase] } ; `theme` est la même charte, sans copie profonde, quand rien n'est dérivé.
// Les formes classées (matrice, carte) demandent la rampe et le gris ; les formes à traits de FD06
// (pentes, étendue, nuage, frise) ne demandent que le gris intermédiaire, pour leurs traits secondaires.
export const CLASSED = ["matrice", "carte"], GREY_ONLY = ["pentes", "étendue", "nuage", "frise", "essaim", "flux", "radar", "chaîne"];
export function completeTheme(theme, capability) {
  if (!CLASSED.includes(capability) && !GREY_ONLY.includes(capability)) return { theme, derived: [] };
  const C = theme.color, D = theme.data, paper = C.paper, th = THRESHOLDS;
  let out = theme, derived = [];
  const own = (k, v) => (out === theme ? (out = { ...theme, color: { ...theme.color }, data: { ...theme.data }, provenance: { ...theme.provenance } }) : out, k(out, v));
  const ramp = CLASSED.includes(capability) ? deriveRamp(D.sequential, paper, C.ink) : { derived: false };
  if (ramp.derived) {
    // une marche gardée de la charte garde SA provenance, où qu'elle soit passée ; les autres sont dites dérivées
    own((t, v) => { t.data.sequential = v.colors; v.colors.forEach((c, i) => { const was = D.sequential.indexOf(c); t.provenance[`data.sequential.${i}`] = was >= 0 ? theme.provenance?.[`data.sequential.${was}`] : v.from; }); }, ramp);
    derived.push(...ramp.notes);
  }
  const g = C.ink_4 ? contrast(C.ink_4, paper) : null;
  if (g == null || g < th.grey[0] || g >= th.grey[1]) {
    const grey = deriveGrey(C.ink, paper);
    own((t, v) => { t.color.ink_4 = v.hex; t.provenance["color.ink_4"] = v.from; }, grey);
    derived.push(g == null ? `le gris intermédiaire (ink_4) manque à la charte : dérivé en ${grey.hex} (${fmt(grey.ratio)}:1 sur le papier)`
      : `le gris intermédiaire (ink_4) de la charte, ${C.ink_4} à ${fmt(g)}:1, est hors de l'intervalle ${th.grey[0]}:1 à ${String(th.grey[1]).replace(".", ",")}:1 : remplacé par ${grey.hex} (${fmt(grey.ratio)}:1), dérivé de l'encre et du papier`);
  }
  return { theme: out, derived };
}
