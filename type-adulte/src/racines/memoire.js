// Mémoire des dossiers du joueur CÔTÉ ONEDRIVE (D29). Pourquoi : la mémoire de l'appareil (localStorage) se perd (vidage du cache de Safari,
// changement de téléphone, une vérification qui échoue une fois…) et le joueur devait alors recoller ses deux liens. Ici, les identifiants des
// dossiers sont aussi retenus dans le dossier d'application du joueur, dans SON OneDrive : il les retrouve sur n'importe quel appareil.
// Rien de secret : des identifiants (jamais un lien), inutiles sans le partage ; et chaque dossier est revérifié (marqueur) à chaque démarrage.
import { PSEUDO } from "./marqueur.js?v=0.17.0";

const ID = /^[A-Za-z0-9!_-]{1,200}$/;
export const nomMemoire = jdrId => `racines_${jdrId}.json`;

/** Texte à écrire pour ces racines (seulement les champs connus). */
export function ecrireMemoire(jdrId, racines) {
  const out = {};
  for (const [role, n] of Object.entries(racines || {})) {
    if (!n || !ID.test(String(n.driveId)) || !ID.test(String(n.itemId))) continue;
    out[role] = { driveId: n.driveId, itemId: n.itemId, ...(n.name ? { name: String(n.name).slice(0, 120) } : {}), ...(role === "joueur" && n.pseudo && PSEUDO.test(n.pseudo) ? { pseudo: n.pseudo } : {}) };
  }
  return JSON.stringify({ version: 1, jdr: jdrId, racines: out }, null, 2) + "\n";
}

/** Racines lues dans un texte ; tout ce qui est douteux est ignoré (la mémoire est modifiable par son propriétaire : elle ne donne aucun droit). */
export function lireMemoire(texte, jdrId, attendus) {
  let j; try { j = JSON.parse(texte); } catch { return {}; }
  if (!j || j.version !== 1 || j.jdr !== jdrId || !j.racines || typeof j.racines !== "object") return {};
  const out = {};
  for (const role of attendus) {
    const n = j.racines[role];
    if (n && ID.test(String(n.driveId)) && ID.test(String(n.itemId))) {
      out[role] = { driveId: n.driveId, itemId: n.itemId, name: typeof n.name === "string" ? n.name.slice(0, 120) : "",
        ...(role === "joueur" && typeof n.pseudo === "string" && PSEUDO.test(n.pseudo) ? { pseudo: n.pseudo } : {}) };
    }
  }
  return out;
}
