// The logic of the widget "FigDot — brouillons" (FD04, D23), with no browser and
// no Grist in it: tested out of a browser (tests/widget.test.mjs). The engine and
// the draft module are handed in, so that the same file runs in the widget (copies
// served next to it) and in Node (the repository's own files).
//
// The widget is a workshop tool, not a published page: it shows a draft, and marks
// it "à envoyer". It sends nothing anywhere; FigDot picks the row up itself.

// grist.docApi.fetchTable gives columns: { id: [..], col: [..] } -> rows
export function columnarToRows(t) {
  const cols = Object.keys(t || {}).filter(c => c !== "manualSort" && !c.startsWith("gristHelper_"));
  const n = (t?.id || t?.[cols[0]] || []).length;
  return Array.from({ length: n }, (_, i) => Object.fromEntries(cols.map(c => [c, t[c][i]])));
}

// The charters (chartes.json) are the one file the widget fetches, from its own address. Online, a slow
// or missing answer must be said, not left as a blank widget (FD07, B4): a timeout, and a message that
// names what to do. `fetchFn` and the delay are handed in, so that Node tests them without a browser.
export const CHARTES_TIMEOUT_MS = 10000;
export async function loadChartes(fetchFn, { url = "./chartes.json", timeoutMs = CHARTES_TIMEOUT_MS } = {}) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`le serveur du widget a répondu ${r.status} pour « ${url} »`);
    const j = await r.json();
    if (!j || typeof j !== "object" || !Object.keys(j).length) throw new Error("le fichier des chartes est vide ou illisible");
    return j;
  } catch (e) {
    const why = e.name === "AbortError" ? `pas de réponse en ${Math.round(timeoutMs / 1000)} s` : e.message;
    throw new Error(`Les chartes du widget n'ont pas pu être chargées (${why}). Rechargez le widget ; si cela continue, vérifiez que l'adresse du widget répond dans un onglet du navigateur.`);
  } finally { clearTimeout(timer); }
}

const today = () => new Date().toISOString().slice(0, 10);

export function makePreview({ engine, draft }) {
  const { prepareResult, drawSpec, composeExport, forTarget, makeLocale, makeFormat, verdict, capabilityOfSpec, completeTheme, sourcesWithoutLink, linkMessage } = engine;
  // the preview of one row: the SVG the build would write for the same inputs
  return function preview({ row, rows, chartes, width = 720, asOf = today(), lang = "fr", credit = null }) {
    const d = draft.readDraft(row);
    const theme = chartes[d.charte];
    if (!theme) throw new Error(`la charte « ${d.charte} » n'est pas dans le widget (il connaît ${Object.keys(chartes).join(", ")})`);
    // l'aperçu est la figure telle qu'elle serait publiée ; `publishable` n'est qu'une information (D62)
    const target = "public";
    const locale = makeLocale(lang);
    // D60 : le verdict de la charte pour cette forme. Un brouillon se construit avec un avertissement ; une figure
    // qu'aucun dessin ne peut porter (rampe trop courte) est dite en clair, avec la raison du validateur, pas celle du moteur
    const capability = capabilityOfSpec(draft.engineSpec(d));
    const v = verdict(theme, capability, { state: "draft", title: d.title });
    const meta = draft.figureMeta(d);
    const raw = draft.default({ source: { tables: { [d.table]: { rows, as_of: asOf } } }, figure: meta, option: null, figdot: makeFormat(locale) });
    const result = prepareResult(d.figure, meta, raw, locale);
    // D42 (FD06) : un brouillon dont la source n'a pas de lien se construit, avec un avertissement ; publié, il serait refusé
    const missing = sourcesWithoutLink(result);
    const linkWarnings = missing.length ? [`${linkMessage(d.title, missing, result.sources?.length ?? 1)} : la figure sera refusée à la publication tant que les colonnes « lien_source » et « sans_adresse » sont vides.`] : [];
    // D63 : la charte complétée de ce que FigDot sait dériver pour cette forme, comme le fait la construction
    const T = forTarget(completeTheme(theme, capability).theme, target);
    let drawing;
    try { drawing = drawSpec(d.figure, result.encoded, draft.engineSpec(d), T, { width: width - 2 * T.space.pad, target, locale, palettes: {} }); }
    catch (e) { throw v.message ? new Error(v.message) : e; }
    const svg = composeExport({ meta, result, drawings: [drawing], theme: T, width, target, credit, locale });
    return { svg, target, draft: d, result, warnings: [...v.warnings, ...linkWarnings] };
  };
}

// What the button writes: the status of the selected row, and nothing else.
export function sendUpdate(row, { STATUS }) {
  const status = String(row?.statut ?? "").trim() || STATUS.draft;
  if (status === STATUS.sent) return { refuse: "Ce brouillon a déjà été envoyé : la version qui fait foi est celle de FigDot. Pour une nouvelle version, ajoutez une itération." };
  if (status === STATUS.send) return { refuse: "Ce brouillon est déjà marqué « à envoyer » : FigDot le prendra à sa prochaine relève." };
  return { update: { id: row.id, fields: { statut: STATUS.send } } };
}
