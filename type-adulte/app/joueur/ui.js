// Briques d'interface de l'application « joueur ». RÈGLE du moteur : jamais de innerHTML (un test le vérifie) ; tout est construit avec le DOM.
import { icone } from "../icones.js?v=0.16.1";
import { h, rendreMarkdown, enligne } from "../conteur/ui.js?v=0.16.1";
import { surligner } from "../../src/joueur/recherche.js?v=0.16.1";

export { h, rendreMarkdown, enligne };

/** Icône du kit : icon("eye", 22) — couleur héritée du texte par défaut. */
export const icon = (nom, taille = 22, couleur = "currentColor", epaisseur = 1.9, remplissage = "none") => icone(nom, taille, couleur, epaisseur, remplissage);

export const attente = (texte = "Chargement…") => h("div", { class: "jr-attente", role: "status" }, h("div", { class: "jr-spin" }, icon("moon", 30)), h("div", null, texte));

/** Bloc de message (erreur, information). */
export const message = (texte, type = "info") => h("p", { class: "jr-msg " + type, role: type === "erreur" ? "alert" : "status" }, texte);

/** Texte dont les mots cherchés sont surlignés (sans HTML). */
export function surbrillance(texte, requete) {
  if (!requete) return texte;
  return surligner(texte, requete).map(m => (m.surligne ? h("mark", null, m.texte) : m.texte));
}

/** Extrait d'un texte Markdown autour du premier mot cherché, en texte brut (pour la recherche et les cartes). */
export function extrait(corps, requete = "", n = 110) {
  const brut = String(corps || "").replace(/^#+\s*/gm, "").replace(/[*_`>]/g, "").replace(/\s+/g, " ").trim();
  if (!brut) return "";
  const mot = String(requete || "").trim().split(/\s+/).filter(Boolean)[0];
  let i = 0;
  if (mot) { const k = brut.toLowerCase().indexOf(mot.toLowerCase()); if (k > n / 2) i = k - Math.floor(n / 3); }
  const t = brut.slice(i, i + n).trim();
  return (i > 0 ? "… " : "") + t + (i + n < brut.length ? " …" : "");
}

/* ---- Images : lues dans OneDrive (jamais d'URL extérieure), mises en mémoire pour la session ---- */
const memoire = new Map();   // clé "rôle|pseudo|chemin" → Promise<string|null> (adresse d'objet)
/** Adresse locale d'une image du dossier du joueur ou de la table ; null si absente. */
export function urlImage(ctx, chemin) {
  if (!chemin) return Promise.resolve(null);
  const cle = `${ctx.donnees.role}|${ctx.donnees.pseudo || ""}|${chemin}`;
  if (!memoire.has(cle)) {
    memoire.set(cle, ctx.donnees.image(chemin).then(b => (b ? URL.createObjectURL(b) : null)).catch(e => { memoire.delete(cle); if (e && (e.status === 401 || e.auth)) throw e; return null; }));
  }
  return memoire.get(cle);
}
export function viderImages() { for (const p of memoire.values()) p.then(u => u && URL.revokeObjectURL(u)); memoire.clear(); }

/** Zone image : icône discrète tant que l'image n'est pas là (ou si elle n'existe pas). */
export function boiteImage(ctx, chemin, classe = "jr-vignette", ic = "image") {
  const b = h("div", { class: classe }, icon(ic, 24, "var(--voile)", 1.6));
  if (chemin) urlImage(ctx, chemin).then(u => { if (!u) return; b.textContent = ""; b.append(h("img", { src: u, alt: "", loading: "lazy", draggable: "false" })); }).catch(() => { /* garde l'icône */ });
  return b;
}

/** Pastilles d'étiquettes. */
export const puces = (liste, classe = "") => (liste && liste.length ? h("div", { class: "jr-puces " + classe }, liste.map(e => h("span", { class: "jr-puce" }, e))) : null);

/** Ligne de métadonnées « Session 3 · Le port · Bram Tessal ». */
export function meta(e) {
  const t = [e.session != null ? `Session ${e.session}` : "", e.lieu, e.personnage].filter(Boolean);
  return t.length ? h("div", { class: "jr-meta" }, t.join(" · ")) : null;
}

/** Fenêtre qui monte du bas. Renvoie la fonction qui la ferme. `surFermeture` est appelée une fois à la fermeture. */
const pileFeuilles = [];   // fenêtres ouvertes, la dernière au-dessus : Échap ne ferme que celle du dessus
export function feuille(titre, corps, { surFermeture, large = false } = {}) {
  const fond = h("div", { class: "jr-fond-feuille" });
  let ferme = false;
  const fermer = () => { if (ferme) return; ferme = true; document.removeEventListener("keydown", touche); const i = pileFeuilles.indexOf(fermer); if (i >= 0) pileFeuilles.splice(i, 1); fond.remove(); if (surFermeture) surFermeture(); };
  const touche = e => { if (e.key === "Escape" && pileFeuilles[pileFeuilles.length - 1] === fermer) fermer(); };
  const f = h("div", { class: "jr-feuille" + (large ? " large" : ""), role: "dialog", "aria-modal": "true", "aria-label": titre },
    h("div", { class: "jr-feuille-tete" }, h("h2", null, titre), h("button", { class: "jr-rond", "aria-label": "Fermer", onclick: fermer }, icon("x", 22))),
    h("div", { class: "jr-feuille-corps" }, corps));
  fond.addEventListener("click", e => { if (e.target === fond) fermer(); });
  document.addEventListener("keydown", touche);
  pileFeuilles.push(fermer);
  fond.append(f);
  document.body.append(fond);
  return fermer;
}

/** Vrai si une fenêtre est ouverte (un redessin de l'écran en dessous attend qu'elle soit fermée). */
export const feuilleOuverte = () => pileFeuilles.length > 0;

/** Ferme toutes les fenêtres ouvertes (du dessus vers le dessous). */
export function fermerFeuilles() { for (const f of [...pileFeuilles].reverse()) f(); }

/** Bouton « pastille » (filtre, sous-navigation). */
export const pastille = (texte, { actif = false, onclick, href, ic } = {}) =>
  h(href ? "a" : "button", { class: "jr-pastille" + (actif ? " on" : ""), href, onclick, "aria-pressed": href ? null : String(!!actif), "aria-current": href && actif ? "page" : null }, ic ? icon(ic, 16) : null, texte);

/** Liste déroulante native (le sélecteur du téléphone). options : [[valeur, libellé]…] */
export function choix(libelle, valeur, options, surChangement) {
  const sel = h("select", { class: "jr-select", "aria-label": libelle, onchange: () => surChangement(sel.value) },
    options.map(([v, l]) => h("option", { value: String(v), selected: String(v) === String(valeur) }, l)));
  return h("label", { class: "jr-champ" }, h("span", null, libelle), sel);
}

export const NOMBRE = n => (n == null ? "—" : String(n));
