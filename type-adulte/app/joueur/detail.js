// Fenêtre de détail d'un élément (savoir, quête, note, objet) : titre, repères, image, étiquettes, texte Markdown. Lecture seule (tranche 1).
import { h, icon, feuille, rendreMarkdown, meta, puces, boiteImage } from "./ui.js";

/** Étiquettes d'un élément : celles de son en-tête et celles posées par le joueur dans « Etiquettes.md ». */
export async function etiquettesDe(ctx, e) {
  let posees = [];
  try { const r = await ctx.chargerEtiquettes(); posees = ctx.donnees.etiquettesDe(r.map, e); } catch (x) { if (x && (x.status === 401 || x.auth)) throw x; }
  return [...new Set([...(e.etiquettes || []), ...posees])];
}

/** Ouvre le détail. `lignes` : nœuds ajoutés sous le texte (par exemple « Savoirs liés »). */
export async function ouvrirElement(ctx, e, { lignes = [], titre = null, image = true, dossier = null } = {}) {
  const tags = await etiquettesDe(ctx, e);
  const corps = [
    image && e.portrait ? boiteImage(ctx, e.portrait, "jr-image-detail", "image") : null,
    meta(e),
    dossier ? h("div", { class: "jr-meta" }, icon("folder", 14), " ", dossier) : null,
    e.quantite > 1 ? h("div", { class: "jr-meta" }, `Quantité : ${e.quantite}`) : null,
    puces(tags),
    e.corps ? h("div", { class: "jr-md" }, rendreMarkdown(e.corps)) : h("p", { class: "jr-vide" }, "Pas de texte."),
    lignes
  ];
  return feuille(titre || e.titre, corps, { large: true });
}
