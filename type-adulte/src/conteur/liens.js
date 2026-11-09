// Liens entre fiches : quelle photo sert à quelle fiche, où une fiche apparaît dans les histoires jouées. Logique pure.
import { parseDoc } from "../md/doc.js?v=0.17.0";

const plat = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/’/g, "'").toLowerCase();
export const platNom = plat;

/** photo → fiches qui l'utilisent. `parClasse` = { classe: [éléments] }. → Map(photo → [{classe, file, name}]) */
export function photosUtilisees(parClasse) {
  const m = new Map();
  for (const [classe, items] of Object.entries(parClasse || {})) for (const i of items || []) {
    if (!i.photo) continue;
    if (!m.has(i.photo)) m.set(i.photo, []);
    m.get(i.photo).push({ classe, file: i.file, name: i.name });
  }
  return m;
}

/** Mots qui permettent de retrouver une fiche dans un texte : son nom sans article, et son premier mot de 5 lettres ou plus. */
export function termesDe(nom) {
  const coeur = plat(nom).replace(/^(le |la |les |l'|un |une )/, "").replace(/\s*[—–-].*$/, "").trim();
  const premier = coeur.split(/[\s']+/).find(w => w.length >= 5);
  return [...new Set([coeur, premier].filter(Boolean))];
}
const nettoyer = l => l.replace(/\*\*/g, "").replace(/^\s*(?:[-*]|\d+\.)\s+/, "").replace(/`/g, "").trim();

/** Où une fiche apparaît dans les textes donnés ([{fichier, texte}]). → [{titre, lignes}] (3 lignes au plus par texte) */
export function apparitions(nom, textes) {
  const ts = termesDe(nom);
  const sortie = [];
  if (!ts.length) return sortie;
  for (const x of textes) {
    if (!x || x.texte == null) continue;
    const d = parseDoc(x.texte);
    const lignes = d.body.split("\n").filter(l => l.trim() && ts.some(t => plat(l).includes(t))).map(nettoyer).filter(l => l && !/^#/.test(l));
    if (lignes.length) sortie.push({ titre: d.title || x.fichier, lignes: lignes.slice(0, 3) });
  }
  return sortie;
}
