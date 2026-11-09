// Sac du joueur : regroupement par dossier ou session, tri, filtre d'ancienneté (D37). Logique pure.
import { norm } from "../md/doc.js?v=0.18.0";

export const NON_CLASSE = "Non classé";
const dossierDe = o => o.dossier || NON_CLASSE;
const num = s => (s == null ? -Infinity : s);

export const ORDRES = Object.freeze({
  recents: { libelle: "Plus récents", cmp: (a, b) => num(b.session) - num(a.session) || a.titre.localeCompare(b.titre, "fr") },
  anciens: { libelle: "Plus anciens", cmp: (a, b) => (a.session == null ? Infinity : a.session) - (b.session == null ? Infinity : b.session) || a.titre.localeCompare(b.titre, "fr") },
  az: { libelle: "A–Z", cmp: (a, b) => a.titre.localeCompare(b.titre, "fr", { numeric: true }) },
  quantite: { libelle: "Quantité", cmp: (a, b) => b.quantite - a.quantite || a.titre.localeCompare(b.titre, "fr") }
});

export function trier(objets, ordre = "recents") {
  const o = ORDRES[ordre];
  if (!o) throw new RangeError("Tri inconnu : " + ordre);
  return [...objets].sort(o.cmp);
}

/** Filtre : `sessionMin` / `sessionMax` (inclus ; un objet sans session ne passe que si aucun des deux n'est posé), `dossiers` (liste de noms, « Non classé » compris). */
export function filtrer(objets, { sessionMin = null, sessionMax = null, dossiers = null } = {}) {
  const d = dossiers && dossiers.length ? new Set(dossiers.map(norm)) : null;
  return objets.filter(o => {
    if (d && !d.has(norm(dossierDe(o)))) return false;
    if (sessionMin != null || sessionMax != null) {
      if (o.session == null) return false;
      if (sessionMin != null && o.session < sessionMin) return false;
      if (sessionMax != null && o.session > sessionMax) return false;
    }
    return true;
  });
}

/**
 * Groupes d'objets. mode : « dossier » (dossiers par ordre alphabétique, « Non classé » à la fin), « session » (plus récente d'abord, « Sans session » à la fin), « aucun ».
 * Chaque groupe garde l'ordre de la liste reçue (trier avant).
 */
export function regrouper(objets, mode = "dossier") {
  if (mode === "aucun") return [{ nom: "", objets: [...objets] }];
  const cle = mode === "session" ? o => (o.session == null ? "Sans session" : `Session ${o.session}`) : dossierDe;
  if (mode !== "session" && mode !== "dossier") throw new RangeError("Regroupement inconnu : " + mode);
  const m = new Map();
  for (const o of objets) { const k = cle(o); if (!m.has(k)) m.set(k, []); m.get(k).push(o); }
  const dernier = mode === "session" ? "Sans session" : NON_CLASSE;
  const noms = [...m.keys()].sort((a, b) => a === dernier ? 1 : b === dernier ? -1 : mode === "session" ? Number(b.replace(/\D/g, "")) - Number(a.replace(/\D/g, "")) : a.localeCompare(b, "fr"));
  return noms.map(nom => ({ nom, objets: m.get(nom) }));
}

/** Tuiles de l'écran « dossiers » : nom et nombre d'objets, « Non classé » à part. → { dossiers:[{nom, n}], nonClasse:n } */
export function tuilesDossiers(objets, dossiersVides = []) {
  const m = new Map(dossiersVides.map(n => [n, 0]));
  let nonClasse = 0;
  for (const o of objets) { if (!o.dossier) nonClasse++; else m.set(o.dossier, (m.get(o.dossier) || 0) + 1); }
  return { dossiers: [...m].map(([nom, n]) => ({ nom, n })).sort((a, b) => a.nom.localeCompare(b.nom, "fr")), nonClasse };
}

/** Texte de la plage de filtre d'ancienneté : « Sessions 3 à 7 », « Depuis la session 5 », « Jusqu'à la session 4 », « » si aucun filtre. */
export function libelleAnciennete({ sessionMin = null, sessionMax = null } = {}) {
  if (sessionMin != null && sessionMax != null) return sessionMin === sessionMax ? `Session ${sessionMin}` : `Sessions ${sessionMin} à ${sessionMax}`;
  if (sessionMin != null) return `Depuis la session ${sessionMin}`;
  if (sessionMax != null) return `Jusqu'à la session ${sessionMax}`;
  return "";
}
