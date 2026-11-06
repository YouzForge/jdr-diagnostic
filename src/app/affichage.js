// Ce qu'une personne a le droit de VOIR d'une collection et d'une fiche. Deuxième ligne de défense : la première reste OneDrive
// (un joueur ne reçoit jamais le coffre) ; ici, même ce qui aurait été déposé par erreur dans la table ou chez un joueur est filtré à l'affichage.
//
// Principes :
//  - liste blanche d'affichage : seuls les champs DÉCLARÉS par la collection (profil) sont montrés ; un champ inconnu n'apparaît jamais ;
//  - pour un joueur, les champs et sections « masqués » du profil sont retirés, et dans la table seules les fiches « publiables » sont montrées ;
//  - une fiche sans visibilité claire est SECRÈTE (appliqué par `lireVisibilite`), donc cachée à un joueur dans la table ;
//  - rien n'est rendu comme du HTML : on produit des blocs de texte (voir markdown.js).
import { sections } from "../md/doc.js";
import { blocsMarkdown } from "./markdown.js";

/** Champs techniques du tampon de récap (D18) : jamais affichés. */
export const CHAMPS_TECHNIQUES = Object.freeze(["source", "source_octets", "traite_le", "traitement"]);

const sec = profil => (profil && profil.securite) || {};
const masque = profil => sec(profil).masque || {};

/** Collections que ce rôle voit dans le menu. Un joueur ne voit jamais la zone « mj ». */
export function collectionsVisibles(profil, role) {
  const cols = profil.collections || [];
  if (role === "mj") return cols;
  if (role !== "joueur") return [];
  return cols.filter(c => c.zone !== "mj");
}

/** Une fiche est-elle montrée à ce rôle ? */
export function ficheVisible(profil, role, col, fiche) {
  if (role === "mj") return true;
  if (role !== "joueur" || col.zone === "mj") return false;
  if (sec(profil).mode === "separe" && col.zone === "table") {
    const ok = masque(profil).visibilites_publiables || ["accessible"];
    return ok.includes(fiche.visibilite);
  }
  return true;   // son propre dossier, ou JDR en mode « unique » : tout ce qui s'y trouve est à lui
}

const contient = (titre, motifs) => motifs.some(m => String(titre).toLowerCase().includes(String(m).toLowerCase()));

function texteChamp(def, v) {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "oui" : "non";
  return String(v);
}

/**
 * Fiche prête à afficher, ou `null` si ce rôle ne doit pas la voir.
 * @returns {{fichier:string, nom:string, visibilite:string, champs:{cle:string,libelle:string,valeur:string,type:string}[], blocs:object[]}|null}
 */
export function preparerFiche(profil, role, col, fiche) {
  if (!ficheVisible(profil, role, col, fiche)) return null;
  const m = masque(profil);
  const caches = new Set([...CHAMPS_TECHNIQUES, ...(role === "mj" ? [] : (m.champs || []))]);
  const champs = [];
  for (const def of col.champs || []) {
    if (def.k === "nom" || def.k === "titre" || def.t === "visibilite" || def.t === "image" || caches.has(def.k)) continue;
    const valeur = texteChamp(def, fiche.meta[def.k]);
    if (valeur !== "") champs.push({ cle: def.k, libelle: def.l || def.k, valeur, type: String(def.t || "text") });
  }
  let corps = fiche.corps;
  if (role !== "mj" && (m.sections || []).length) {
    corps = sections(corps).filter(s => !s.title || !contient(s.title, m.sections))
      .map(s => (s.title ? `## ${s.title}\n` : "") + s.text).join("\n");
  }
  return { fichier: fiche.fichier, nom: fiche.nom, visibilite: fiche.visibilite, champs, blocs: blocsMarkdown(corps, { titreARetirer: fiche.nom }) };
}
