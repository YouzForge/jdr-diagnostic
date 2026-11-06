// Chargement des fiches d'une collection du profil. Même code pour tous les JDR : tout vient du profil.
import { parseDoc, humanize, lireVisibilite } from "../md/doc.js";
import { pool } from "../graph/pool.js";

/** Fichiers qu'une collection ne présente jamais : modèles (« 00_… ») et fichiers LISEZMOI. */
const EXCLUS = /^(00_|LISEZMOI)/i;

/**
 * Chemin d'une collection pour le rôle connecté.
 * Une collection de zone « joueur » est relative au dossier du joueur ; le MJ la lit dans « <joueurs>/<pseudo>/… ».
 */
export function cheminCollection(profil, role, col, pseudo) {
  if (col.zone !== "joueur") return col.dossier;
  if (role === "joueur") return col.dossier;
  if (!pseudo) throw new Error("Pseudo du joueur nécessaire pour lire « " + col.id + " » côté MJ");
  if (!/^[^/\\:?#*"<>|\u0000-\u001f.][^/\\:?#*"<>|\u0000-\u001f]*$/.test(pseudo)) throw new Error("Pseudo invalide");
  return [profil.securite.joueurs, pseudo, col.dossier].join("/");
}

/** Une fiche prête à afficher. */
export function versFiche(profil, col, fichier, texte) {
  const d = parseDoc(texte);
  const nom = d.meta.nom || d.meta.titre || d.title || humanize(fichier);
  const defini = profil.securite && profil.securite.visibilites ? Object.keys(profil.securite.visibilites) : undefined;
  return { col: col.id, fichier, nom: String(nom), meta: d.meta, corps: d.body, visibilite: lireVisibilite(d.meta, defini) };
}

/** Toutes les fiches d'une collection. → { fiches, perime, absent } ; les fichiers illisibles sont comptés, pas ignorés en silence. */
export async function chargerCollection({ depot, profil, role, col, pseudo, simultanes = 6 }) {
  const dossier = cheminCollection(profil, role, col, pseudo);
  const ls = await depot.lister(dossier);
  if (ls.absent) return { fiches: [], perime: false, absent: true, illisibles: [] };
  const fichiers = ls.donnees.filter(f => !f.dir && /\.md$/i.test(f.name) && !EXCLUS.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  let perime = ls.perime; const illisibles = [];
  const fiches = (await pool(fichiers, async f => {
    try {
      const r = await depot.lire(`${dossier}/${f.name}`);
      if (r.perime) perime = true;
      return r.texte == null ? null : versFiche(profil, col, f.name, r.texte);
    } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; illisibles.push({ fichier: f.name, status: e.status || null }); return null; }
  }, simultanes)).filter(Boolean);
  return { fiches, perime, absent: false, illisibles };
}
