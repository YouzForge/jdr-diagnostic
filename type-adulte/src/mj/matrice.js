// « Qui sait quoi » (D51, lecture seule) : la matrice savoirs × joueurs, calculée à partir des dossiers `Savoirs` de chaque joueur.
// Convention (à confirmer par le MJ) : deux fichiers de deux joueurs sont LE MÊME savoir quand leurs noms sont identiques,
// extension, casse, accents, espaces, tirets et soulignés ignorés. Aucun catalogue central n'existe : un savoir que personne ne possède n'apparaît pas.
// Rien n'est téléchargé : la matrice se lit sur les listes de dossiers déjà demandées par le tableau de bord des joueurs.
import { norm, humanize } from "../md/doc.js?v=0.18.0";

const SANS_EXTENSION = n => String(n).replace(/\.md$/i, "");

/** Clé d'identité d'un savoir d'après son nom de fichier. « 01 - Forêt_des brumes.md » = « 01-foret des-brumes.MD ». */
export const cleSavoir = nom => norm(SANS_EXTENSION(nom));   // `norm` ramène déjà accents, casse, espaces, tirets et soulignés à un seul « _ » sans bord

/** Titre lisible tiré du nom de fichier (le contenu n'est pas lu). */
export const titreDeSavoir = nom => humanize(SANS_EXTENSION(nom));

const tri = (a, b) => a.localeCompare(b, "fr", { numeric: true });

/**
 * Construit la matrice.
 * `joueurs` : [{ pseudo, fiche?, savoirs: [noms de fichiers] | null }] ; `savoirs: null` = dossier illisible (la case est « inconnue », jamais « ignoré »).
 * → { joueurs:[{pseudo, nom, total, lisible}], lignes:[{cle, titre, fichiers:{pseudo:nom}, connus:[pseudo], n, sur, tous, inconnus:[pseudo]}], lisibles }
 */
export function construireMatrice(joueurs) {
  const cols = (joueurs || []).map(j => ({
    pseudo: j.pseudo, nom: (j.fiche && j.fiche.nom) || String(j.pseudo).replace(/_/g, " "),
    lisible: Array.isArray(j.savoirs), total: 0
  }));
  const parCle = new Map();
  (joueurs || []).forEach((j, i) => {
    if (!Array.isArray(j.savoirs)) return;
    const vus = new Set();
    for (const nom of j.savoirs) {
      const cle = cleSavoir(nom);
      if (!cle || vus.has(cle)) continue;   // deux fichiers du même joueur qui ne diffèrent que par la casse : un seul savoir
      vus.add(cle);
      let l = parCle.get(cle);
      if (!l) parCle.set(cle, l = { cle, titre: titreDeSavoir(nom), fichiers: {}, connus: [] });
      l.fichiers[j.pseudo] = nom; l.connus.push(j.pseudo); cols[i].total++;
    }
  });
  const lisibles = cols.filter(c => c.lisible).length;
  // Rangés comme les fichiers dans OneDrive (nom, chiffres en ordre naturel) : le préfixe « 01 », « 02 »… donne l'ordre de publication.
  const triees = [...parCle.values()].sort((a, b) => tri(a.cle, b.cle));
  // `humanize` retire le préfixe numérique : deux savoirs de même titre (« 01 - Port » et « 02 - Port ») se distinguent par leur nom de fichier.
  const nbTitre = new Map(); for (const l of triees) nbTitre.set(l.titre, (nbTitre.get(l.titre) || 0) + 1);
  const lignes = triees.map(l => (nbTitre.get(l.titre) > 1 ? { ...l, titre: `${l.titre} (${SANS_EXTENSION(Object.values(l.fichiers)[0])})` } : l)).map(l => ({
    ...l, n: l.connus.length, sur: lisibles,
    tous: lisibles > 0 && l.connus.length === lisibles,
    inconnus: cols.filter(c => c.lisible && !l.connus.includes(c.pseudo)).map(c => c.pseudo)
  }));
  return { joueurs: cols, lignes, lisibles };
}

export const FILTRES_SAVOIRS = [
  { cle: "tous", libelle: "Connus de tous" },
  { cle: "pas_tous", libelle: "Pas de tous" },
  { cle: "un", libelle: "Un seul joueur" }
];

/** Filtre : "" tout ; "tous" connus de tous les joueurs lisibles ; "pas_tous" ignorés d'au moins un ; "un" connus d'un seul. `texte` : recherche dans le titre (accents et casse ignorés). */
export function filtrerSavoirs(lignes, { filtre = "", texte = "" } = {}) {
  const q = norm(texte).replace(/_+/g, " ").trim();
  return lignes.filter(l => {
    if (filtre === "tous" && !l.tous) return false;
    if (filtre === "pas_tous" && l.tous) return false;
    if (filtre === "un" && l.n !== 1) return false;
    return !q || norm(l.titre).replace(/_+/g, " ").includes(q);
  });
}

/** Effectifs de chaque filtre (pour les pastilles). */
export function compterFiltres(lignes) {
  return { total: lignes.length, tous: lignes.filter(l => l.tous).length, pas_tous: lignes.filter(l => !l.tous).length, un: lignes.filter(l => l.n === 1).length };
}
