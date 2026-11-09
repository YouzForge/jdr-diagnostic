// Tableaux Markdown (« | A | B | ») d'une fiche → lignes d'objets. Sans DOM. Un contenu inattendu est ignoré, jamais une erreur.
import { norm, getSection } from "../md/doc.js?v=0.17.0";

const cellules = ligne => {
  let l = ligne.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|") && !l.endsWith("\\|")) l = l.slice(0, -1);
  return l.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, "|").trim());
};
const estSeparateur = ligne => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(ligne);

/** Premier tableau d'un texte → { entetes:[clés normalisées], lignes:[{clé: texte}] }, ou null. */
export function lireTableau(texte) {
  const lignes = String(texte || "").replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lignes.length - 1; i++) {
    if (!lignes[i].includes("|") || !estSeparateur(lignes[i + 1])) continue;
    const entetes = cellules(lignes[i]).map(norm);
    const sortie = [];
    for (let j = i + 2; j < lignes.length && lignes[j].includes("|") && lignes[j].trim() !== ""; j++) {
      const c = cellules(lignes[j]);
      const o = Object.create(null);
      entetes.forEach((e, k) => { if (e) o[e] = c[k] ?? ""; });
      sortie.push(o);
    }
    return { entetes, lignes: sortie };
  }
  return null;
}

/** Lignes du premier tableau de la section « ## titre » d'un corps ; [] si la section ou le tableau manque. */
export function lignesDeSection(corps, titre) {
  const t = lireTableau(getSection(corps, titre));
  return t ? t.lignes : [];
}
