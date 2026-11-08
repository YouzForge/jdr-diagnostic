// Éléments du dossier du joueur (savoirs, quêtes, journal, rencontres, notes) et objets du sac : lecture d'un fichier Markdown vers un objet d'affichage.
// Sans DOM. La visibilité n'est PAS lue ici : le joueur ne voit que ce que OneDrive lui a donné ; ce qui s'y trouve est affiché tel quel (texte seulement).
import { parseDoc, getSection, norm, intOf, humanize, isTrue } from "../md/doc.js";

const t = v => (v == null ? "" : String(v).trim());
const liste = v => t(v).split(/[,;]/).map(x => x.trim()).filter(Boolean);

/** Nom lisible d'un fichier : « 03_La_gardienne.md » → « La gardienne ». */
export const nomDeFichier = humanize;

/**
 * Élément générique. Champs d'en-tête reconnus : titre|nom, session, lieu, personnage, etiquettes (séparées par des virgules), epingle, portrait, date.
 * @returns {{fichier, titre, session:number|null, lieu, personnage, etiquettes:string[], epingle:boolean, portrait, date, corps, meta}}
 */
export function lireElement(contenu, fichier) {
  const d = parseDoc(contenu);
  const m = d.meta;
  const corps = d.body.replace(/^\s*#\s+.+\n?/, "").trim();   // le titre « # … » est affiché à part
  return {
    fichier, titre: t(m.titre) || t(m.nom) || d.title || nomDeFichier(fichier),
    session: intOf(m.session), lieu: t(m.lieu), personnage: t(m.personnage), etiquettes: liste(m.etiquettes),
    epingle: isTrue(m.epingle), portrait: t(m.portrait), date: t(m.date), corps, meta: m
  };
}

/** Objet du sac : un élément + dossier (nom du sous-dossier d'« Inventaire », « » = non classé) et quantité (1 par défaut). */
export function lireObjet(contenu, fichier, dossier = "") {
  const e = lireElement(contenu, fichier);
  const q = intOf(e.meta.quantite);
  return { ...e, dossier, quantite: q == null || q < 1 ? 1 : q };
}

/** Rencontre : élément + sections « Présentation » (écrite par le MJ, lecture seule), « Ma note » et « Savoirs liés » (noms de fichiers du dossier des savoirs). */
export function lireRencontre(contenu, fichier) {
  const e = lireElement(contenu, fichier);
  const liens = getSection(e.corps, "Savoirs liés").split("\n").map(l => l.replace(/^\s*[-*]\s*/, "").replace(/\.md$/i, "").trim()).filter(Boolean);
  return { ...e, presentation: getSection(e.corps, "Présentation"), note: getSection(e.corps, "Ma note"), savoirsLies: liens };
}

/** Étiquettes posées par le joueur : fichier « Etiquettes.md », lignes « - cible : étiquette, étiquette ». → Map(cible normalisée → [étiquettes]). */
export function lireEtiquettes(contenu) {
  const m = new Map();
  for (const l of String(contenu || "").split("\n")) {
    const x = l.match(/^\s*[-*]\s+(.+?)\s*:\s*(.+)$/);
    if (!x) continue;
    const cible = norm(x[1].replace(/\.md$/i, ""));
    if (cible) m.set(cible, liste(x[2]));
  }
  return m;
}
export const cleCible = fichier => norm(String(fichier).replace(/\.md$/i, ""));
const sansNumero = fichier => String(fichier).replace(/^\d+[_\- ]+/, "");

/** Clés sous lesquelles un élément peut être désigné (par un joueur dans Etiquettes.md, ou par une rencontre dans « Savoirs liés ») : nom du fichier, nom sans numéro d'ordre (« 03_ »), titre. */
export const clesDe = e => [...new Set([cleCible(e.fichier), cleCible(sansNumero(e.fichier)), cleCible(e.titre || "")].filter(Boolean))];
/** `nom` (une désignation écrite à la main) désigne-t-il cet élément ? */
export const designe = (e, nom) => clesDe(e).includes(cleCible(nom));

/** Récit du MJ pour une session (publié dans la table) : titre, numéro, date, corps. */
export function lireRecit(contenu, fichier) {
  const e = lireElement(contenu, fichier);
  return { ...e, session: e.session ?? intOf(fichier) };
}
