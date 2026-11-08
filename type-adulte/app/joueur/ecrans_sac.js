// Onglet « Sac » : dossiers (tuiles), vue « Tout » (tri, regroupement, ancienneté) et vue d'un dossier. Lecture seule (tranche 1) :
// les dossiers et les déplacements d'objets choisis par le joueur viennent en tranche 2 ; aujourd'hui les dossiers sont ceux du dossier « Inventaire ».
import { h, icon, message, pastille, choix, boiteImage } from "./ui.js";
import { ouvrirElement } from "./detail.js";
import { trier, filtrer, regrouper, tuilesDossiers, libelleAnciennete, ORDRES, NON_CLASSE } from "../../src/joueur/sac.js";

const perime = r => (r && r.perime ? message("Copie enregistrée sur ce téléphone : la connexion ne répond pas.", "alerte") : null);

const sousNav = actif => h("nav", { class: "jr-souslignes", "aria-label": "Sac" },
  pastille("Dossiers", { actif: actif === "dossiers", href: "#/sac", ic: "folder" }), pastille("Tout", { actif: actif === "tout", href: "#/sac/tout", ic: "bag" }));
const ecran = (actif, ...enfants) => ({ onglet: "sac", node: h("div", { class: "jr-page" }, sousNav(actif), ...enfants) });

/** Ligne d'un objet : vignette (l'image de l'objet si elle existe), nom, repères, quantité. `sans` : repère inutile dans ce regroupement. */
function ligneObjet(ctx, o, sans = "") {
  const reperes = [sans === "dossier" ? "" : (o.dossier || NON_CLASSE), sans === "session" || o.session == null ? "" : `Session ${o.session}`].filter(Boolean).join(" · ");
  return h("li", null, h("button", { class: "jr-objet", onclick: () => ouvrirElement(ctx, o, { dossier: o.dossier || NON_CLASSE }) },
    boiteImage(ctx, o.portrait, "jr-vignette petite", "bag"),
    h("span", { class: "jr-objet-texte" }, h("span", { class: "jr-objet-nom" }, o.titre), reperes ? h("span", { class: "jr-objet-session" }, reperes) : null),
    o.quantite > 1 ? h("span", { class: "jr-quantite", "aria-label": `quantité ${o.quantite}` }, `×${o.quantite}`) : null));
}

/** Bourse : ce que le personnage possède en argent, tel que le joueur l'a écrit dans sa fiche (clé « bourse »). Aucune monnaie n'est supposée : le texte est montré tel quel. */
function carteBourse(fiche) {
  if (!fiche || !fiche.bourse) return null;
  return h("section", { class: "jr-bourse", "aria-label": "Ma bourse" }, h("span", { class: "jr-bourse-ic" }, icon("purse", 26)),
    h("span", { class: "jr-bourse-texte" }, h("span", { class: "jr-kicker" }, "Ma bourse"), h("span", { class: "jr-bourse-valeur" }, fiche.bourse)));
}

export async function ecranSacDossiers(ctx) {
  const [r, f] = await Promise.all([ctx.donnees.sac(), ctx.donnees.fiche().catch(() => null)]);
  const bourse = carteBourse(f && f.fiche);
  const t = tuilesDossiers(r.objets, r.dossiers);
  if (!r.objets.length && !r.dossiers.length) return ecran("dossiers", perime(r), bourse, message("Ton sac est vide. Ce que tu ramasses apparaîtra ici.", "info"));
  // Même présentation que la liste « Tout » : une ligne par dossier, pleine largeur.
  const ligne = (nom, n, href, ic = "folder") => h("li", null, h("a", { class: "jr-objet jr-dossier", href },
    h("span", { class: "jr-vignette petite" }, icon(ic, 22)),
    h("span", { class: "jr-objet-texte" }, h("span", { class: "jr-objet-nom" }, nom), h("span", { class: "jr-objet-session" }, n === 1 ? "1 objet" : `${n} objets`)),
    icon("next", 18)));
  const lignes = [ligne("Tout", r.objets.length, "#/sac/tout", "bag"), ...t.dossiers.map(d => ligne(d.nom, d.n, `#/sac/d/${encodeURIComponent(d.nom)}`))];
  if (t.nonClasse) lignes.push(ligne(NON_CLASSE, t.nonClasse, `#/sac/d/${encodeURIComponent(NON_CLASSE)}`, "tag"));
  return ecran("dossiers", perime(r), bourse, h("ul", { class: "jr-objets jr-dossiers" }, lignes));
}

/** Vue « Tout » : tri, regroupement et ancienneté (réglages gardés pendant la session). */
export async function ecranSacTout(ctx, fichierOuvert = null) {
  const r = await ctx.donnees.sac();
  if (!r.objets.length) return ecran("tout", perime(r), message("Ton sac est vide.", "info"));
  const e = ctx.etat.sac;
  const sessions = [...new Set(r.objets.map(o => o.session).filter(s => s != null))].sort((a, b) => a - b);
  const zone = h("div", null);
  const resume = h("div", { class: "jr-meta" });
  const dessiner = () => {
    const sel = filtrer(r.objets, { sessionMin: e.min, sessionMax: e.max });
    const groupes = regrouper(trier(sel, e.ordre), e.groupe);
    const anc = libelleAnciennete({ sessionMin: e.min, sessionMax: e.max });
    resume.textContent = `${sel.length} objet${sel.length > 1 ? "s" : ""}${anc ? " · " + anc : ""}`;
    zone.replaceChildren(...(sel.length ? groupes.map(g => h("section", { class: "jr-groupe" }, g.nom ? h("h3", null, g.nom) : null, h("ul", { class: "jr-objets" }, g.objets.map(o => ligneObjet(ctx, o, e.groupe))))) : [message("Aucun objet ne correspond à ces réglages.", "info")]));
  };
  const optSessions = [["", "Toutes"], ...sessions.map(s => [String(s), `Session ${s}`])];
  const reglages = h("details", { class: "jr-reglages" }, h("summary", null, icon("sliders", 18), "Trier et filtrer"),
    h("div", { class: "jr-reglages-corps" },
      choix("Trier par", e.ordre, Object.entries(ORDRES).map(([k, v]) => [k, v.libelle]), v => { e.ordre = v; dessiner(); }),
      choix("Regrouper par", e.groupe, [["dossier", "Dossier"], ["session", "Session"], ["aucun", "Aucun"]], v => { e.groupe = v; dessiner(); }),
      sessions.length > 1 ? choix("À partir de", e.min ?? "", optSessions, v => { e.min = v === "" ? null : Number(v); dessiner(); }) : null,
      sessions.length > 1 ? choix("Jusqu'à", e.max ?? "", optSessions, v => { e.max = v === "" ? null : Number(v); dessiner(); }) : null));
  dessiner();
  if (fichierOuvert) { const o = r.objets.find(x => x.fichier === fichierOuvert || `${x.dossier}/${x.fichier}` === fichierOuvert); if (o) setTimeout(() => ouvrirElement(ctx, o, { dossier: o.dossier || NON_CLASSE }), 0); }
  return ecran("tout", perime(r), reglages, resume, zone);
}

export async function ecranSacDossier(ctx, nom) {
  const r = await ctx.donnees.sac();
  const e = ctx.etat.sac;
  const objets = trier(filtrer(r.objets, { dossiers: [nom] }), e.ordre);
  return ecran("dossiers", perime(r),
    h("a", { class: "jr-retour", href: "#/sac" }, icon("back", 18), "Dossiers"),
    h("h2", { class: "jr-titre-section" }, nom),
    objets.length ? h("ul", { class: "jr-objets" }, objets.map(o => ligneObjet(ctx, o, "dossier"))) : message("Ce dossier est vide.", "info"));
}

