// État du héros (cœurs, armure, pièces, équipement) lu dans sa fiche, et fiches des collections du conteur vues par l'enfant.
// Logique pure : le texte est donné, rien n'est lu ni écrit ici.
import { parseDoc, intOf, isTrue, humanize, sections } from "../md/doc.js?v=0.17.0";
import { trouverObjet } from "./objets.js?v=0.17.0";

/** « 50,50 » → { x, y } (0 à 100), sinon null. */
export function lireCarte(v) {
  const m = String(v ?? "").match(/(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/);
  return m ? { x: Math.max(0, Math.min(100, Number(m[1]))), y: Math.max(0, Math.min(100, Number(m[2]))) } : null;
}
/** Type d'un compagnon : "vole", "nage" ou "terre". */
export function typeCompagnon(meta) {
  const t = String(meta.categorie || meta.type_compagnon || "").toLowerCase();
  if (/vol|oiseau|air/.test(t)) return "vole";
  if (/nag|aqua|eau|plong/.test(t)) return "nage";
  return "terre";
}
/** Pouvoirs : écrits un par ligne dans le formulaire, gardés séparés par « ; » dans le fichier. */
export function lirePouvoirs(v) {
  return String(v == null ? "" : v).split(/\s*[;\n]\s*/).map(x => x.trim()).filter(Boolean);
}

/** Un élément de collection prêt à afficher. */
export function versElement(col, fichier, texte) {
  const d = parseDoc(texte);
  const photo = typeof d.meta.photo === "string" && /\.(jpe?g|png|webp|heic)$/i.test(d.meta.photo) ? d.meta.photo : null;
  return {
    col: col.id, file: fichier, rel: `${col.dossier}/${fichier}`,
    name: String(d.meta.nom || d.meta.titre || d.title || humanize(fichier)),
    meta: d.meta, body: d.body,
    coeurs: intOf(d.meta.coeurs), boss: isTrue(d.meta.boss), photo,
    apparence: String(d.meta.apparence || "").trim(),
    etat: String(d.meta.etat || "").trim(),
    carte: lireCarte(d.meta.carte),
    type: typeCompagnon(d.meta),
    animal: String(d.meta.animal || "").trim(),
    pouvoirs: lirePouvoirs(d.meta.pouvoirs != null ? d.meta.pouvoirs : d.meta.pouvoir)
  };
}

/** Ce que l'enfant a le droit de voir d'une fiche : pas de spoiler (aucune idée, aucune proposition, aucune note du MJ). */
export function vueEnfant(element) {
  const brut = String(element.meta.apparence || "").trim();
  const intro = brut.charAt(0).toUpperCase() + brut.slice(1);
  const secs = sections(element.body).filter(s => /^(ce que \S+ a fait|ce que j.ai fait)/i.test(s.title));
  return { description: intro, faits: secs.map(s => s.text.trim()).filter(Boolean).join("\n") };
}

/**
 * État du héros d'après le texte de sa fiche. `regles` = { coeurs_depart, armure_depart } du profil ; `catalogue` = objets préparés.
 * Champs de l'en-tête (coeurs: 3, armure: 1, pieces: 2) d'abord ; à défaut, tableaux et sections de la fiche.
 */
export function lireEtatHeros(texte, { regles = {}, catalogue = [] } = {}) {
  const d = parseDoc(texte);
  let coeurs = intOf(d.meta.coeurs), armure = intOf(d.meta.armure);
  if (coeurs == null) { const m = texte.match(/Cœurs\*\*\s*\|[^\n]*?\((\d+)\)/); coeurs = m ? Number(m[1]) : (regles.coeurs_depart ?? 3); }
  if (armure == null) { const m = texte.match(/Armure\*\*\s*\|[^\n]*?(\d+)/); armure = m ? Number(m[1]) : (regles.armure_depart ?? 0); }
  let pieces = intOf(d.meta.pieces);
  if (pieces == null) { const m = texte.match(/^## Pi[èe]ces?\s*\n+\s*(?:[-*]\s*)?(?:\*\*)?\s*(\d+)/m) || texte.match(/Pi[èe]ces?\*\*\s*\|\s*(\d+)/); pieces = m ? Number(m[1]) : 0; }
  const nom = String(d.meta.nom || (texte.match(/\*\*Nom\s*:?\s*\*\*\s*:?\s*([^\n|]+)/) || texte.match(/\*\*Nom\*\*\s*\|\s*([^|\n]+)/) || [, ""])[1] || "").trim();
  const prenom = nom.split(/[,\s—–-]/)[0] || "";
  const inv = (texte.match(/^## Inventaire\s*\n([\s\S]*?)(?=\n## |(?![\s\S]))/m) || [, ""])[1];
  const equip = [];
  for (const ligne of inv.split("\n")) {
    if (!/^\s*[-*]\s/.test(ligne) || /aucun/i.test(ligne)) continue;
    const o = trouverObjet(catalogue, ligne);
    if (o && o.equipe && !equip.some(e => e.id === o.id)) equip.push(o);
  }
  return { prenom, coeurs, armure, pieces, equip };
}

/** Reconnaît le fichier de la fiche du héros dans la liste des fichiers de son dossier. */
export const estFicheHeros = nom => /Fiche_Heroine\.md$/i.test(nom) || /Fiche_Heros\.md$/i.test(nom);
