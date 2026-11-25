// The widget in Grist: shows the selected draft under its charter, and marks it
// "à envoyer". Asks for full document access: it reads a second table (the data
// the draft names) and writes one cell (the status of the selected row).
import * as draft from "./draft.mjs";
import { prepareResult, drawSpec, composeExport, sourcesWithoutLink, linkMessage } from "./engine/render.mjs";
import { forTarget } from "./engine/theme-core.mjs";
import { makeLocale } from "./engine/locale.mjs";
import { makeFormat } from "./engine/format.mjs";
import { verdict, capabilityOfSpec } from "./engine/profile-check.mjs";
import { completeTheme } from "./engine/derive.mjs";
import { makePreview, columnarToRows, sendUpdate, loadChartes } from "./logic.mjs";

const $ = s => document.querySelector(s);
const preview = makePreview({ engine: { prepareResult, drawSpec, composeExport, forTarget, makeLocale, makeFormat, verdict, capabilityOfSpec, completeTheme, sourcesWithoutLink, linkMessage }, draft });
let chartes = null, chartesError = null;
let current = null;

const say = (text, kind = "") => { const m = $("#message"); m.textContent = text; m.className = kind; };
// a missing or slow charters file is said, with its cause, instead of leaving the widget blank (FD07, B4)
try { chartes = await loadChartes(fetch); } catch (e) { chartesError = e.message; say(chartesError, "erreur"); }

async function show(row) {
  current = row;
  $("#envoyer").disabled = true;
  $("#avertissement").textContent = "";
  if (chartesError) { $("#apercu").innerHTML = ""; say(chartesError, "erreur"); return; }
  if (!row) { $("#apercu").innerHTML = ""; say("Sélectionnez une ligne de la table des figures."); return; }
  try {
    const d = draft.readDraft(row);
    $("#titre").textContent = `${d.figure}, itération ${d.iteration} : ${d.status}`;
    const rows = columnarToRows(await grist.docApi.fetchTable(d.table));
    const p = preview({ row, rows, chartes, width: Math.max(320, Math.min(720, document.body.clientWidth - 16)) });
    $("#apercu").innerHTML = p.svg;
    $("#avertissement").textContent = p.warnings.join(" ");
    say(`Aperçu sous la charte « ${d.charte} », données du ${new Date().toLocaleDateString("fr-FR")}.`);
    const s = sendUpdate(row, draft);
    $("#envoyer").disabled = !!s.refuse;
    if (s.refuse) say(s.refuse, "info");
  } catch (e) {
    $("#apercu").innerHTML = "";
    say(e.message, "erreur");
  }
}

$("#envoyer").addEventListener("click", async () => {
  const s = sendUpdate(current, draft);
  if (s.refuse) { say(s.refuse, "info"); return; }
  $("#envoyer").disabled = true;
  await grist.selectedTable.update(s.update);
  say("Marqué « à envoyer ». FigDot le prendra à sa prochaine relève ; il arrivera en brouillon.", "ok");
});

grist.ready({ requiredAccess: "full" });
grist.onRecord(row => show(row));
grist.onRecords((rows, mappings) => { if (!current && !rows.length) show(null); });
