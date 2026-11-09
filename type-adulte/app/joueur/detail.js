// Fenêtre de détail d'un élément (savoir, quête, note, objet) : titre, repères, image, étiquettes, texte Markdown.
// Si le joueur peut écrire (tranche 2) : étiquettes modifiables, « Modifier » pour ses notes, « Déplacer » et « Retirer » pour les objets du sac.
import { h, icon, feuille, rendreMarkdown, meta, puces, boiteImage, message } from "./ui.js?v=0.18.0";
import { peut, blocEtiquettes, modifierNote, confirmer, executer } from "./edition.js?v=0.18.0";
import { NON_CLASSE } from "../../src/joueur/sac.js?v=0.18.0";

const ZONES_ETIQUETTES = ["savoirs", "quetes", "notes", "rencontres", "journal", "sac"];

/** Étiquettes d'un élément : celles de son en-tête (écrites par le MJ) et celles posées par le joueur dans « Etiquettes.md ». */
export async function etiquettesSeparees(ctx, e) {
  let posees = [];
  try { const r = await ctx.chargerEtiquettes(); posees = ctx.donnees.etiquettesDe(r.map, e); } catch (x) { if (x && (x.status === 401 || x.auth)) throw x; }
  return { fixes: e.etiquettes || [], posees };
}
export async function etiquettesDe(ctx, e) {
  const { fixes, posees } = await etiquettesSeparees(ctx, e);
  return [...new Set([...fixes, ...posees])];
}

/** Choix du dossier d'arrivée pour un objet du sac. */
async function deplacer(ctx, e, { apres }) {
  const r = await executer(ctx, () => ctx.donnees.sac());
  if (!r.ok) return;
  const msg = h("div", { class: "jr-retour-action" });
  const courant = e.dossier || NON_CLASSE;
  const noms = [...r.r.dossiers, NON_CLASSE];
  const fermer = feuille("Déplacer vers…", [
    h("ul", { class: "jr-lignes" }, noms.map(n => h("li", null, h("button", { class: "jr-ligne", type: "button", disabled: n === courant, onclick: async ev => {
      const res = await executer(ctx, () => ctx.donnees.deplacerObjet(e, n === NON_CLASSE ? "" : n), { zone: msg, boutons: [ev.currentTarget] });
      if (res.ok) { fermer(); apres(); }
    } }, icon(n === NON_CLASSE ? "tag" : "folder", 20), h("span", { class: "jr-ligne-nom" }, n, n === courant ? h("small", null, "ici") : null))))),
    msg, noms.length === 1 ? h("p", { class: "jr-vide" }, "Aucun dossier : crée-en un depuis l'écran « Dossiers » du sac.") : null
  ]);
}

/** Ouvre le détail. `lignes` : nœuds ajoutés sous le texte (par exemple « Savoirs liés »). */
export async function ouvrirElement(ctx, e, { lignes = [], titre = null, image = true, dossier = null } = {}) {
  const { fixes, posees } = await etiquettesSeparees(ctx, e);
  const ecriture = peut(ctx) && ZONES_ETIQUETTES.includes(e.zone);
  let modifie = false, fermer = null;
  const fini = () => { modifie = true; if (fermer) fermer(); };
  const actions = [];
  if (ecriture && (e.zone === "notes" || e.zone === "journal"))
    actions.push(h("button", { class: "jr-bouton", type: "button", onclick: () => modifierNote(ctx, e.zone, e.fichier, fini) }, icon("pen", 18), "Modifier"));
  if (ecriture && e.zone === "sac") {
    actions.push(h("button", { class: "jr-bouton", type: "button", onclick: () => deplacer(ctx, e, { apres: fini }) }, icon("move", 18), "Déplacer"));
    actions.push(h("button", { class: "jr-bouton danger", type: "button", onclick: async () => {
      if (!(await confirmer("Retirer cet objet ?", `« ${e.titre} » quittera ton sac et ira dans la corbeille de ton OneDrive (récupérable pendant 93 jours).`, "Retirer"))) return;
      const r = await executer(ctx, () => ctx.donnees.retirerObjet(e));
      if (r.ok) fini(); else feuille("Retrait impossible", [message(r.m.texte, "erreur")]);
    } }, icon("trash", 18), "Retirer"));
  }
  const corps = [
    image && e.portrait ? boiteImage(ctx, e.portrait, "jr-image-detail", "image") : null,
    meta(e),
    dossier ? h("div", { class: "jr-meta" }, icon("folder", 14), " ", dossier) : null,
    e.quantite > 1 ? h("div", { class: "jr-meta" }, `Quantité : ${e.quantite}`) : null,
    ecriture ? blocEtiquettes(ctx, e, { fixes, posees, surChangement: () => { modifie = true; } }) : puces([...new Set([...fixes, ...posees])]),
    e.corps ? h("div", { class: "jr-md" }, rendreMarkdown(e.corps)) : h("p", { class: "jr-vide" }, "Pas de texte."),
    lignes,
    actions.length ? h("div", { class: "jr-actions" }, actions) : null
  ];
  fermer = feuille(titre || e.titre, corps, { large: true, surFermeture: () => { if (modifie) ctx.reafficher(); } });
  return fermer;
}
