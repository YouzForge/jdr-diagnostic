// Fichier marqueur posé à la racine de chaque dossier partagé : il dit à quel JDR et à quel rôle appartient le dossier.
// Il ne contient rien de secret (un identifiant de JDR et un rôle). PROPOSITION de la base, à valider par le MJ (D22).
//
// Sécurité : le marqueur sert à RECONNAÎTRE un dossier, jamais à lui donner des droits. Les droits viennent de OneDrive.
// Un joueur qui écrit un faux marqueur dans son propre dossier n'obtient rien de plus ; au pire il brouille sa propre application
// (deux dossiers « table » → l'application refuse de choisir, voir racines.js).

export const NOM_MARQUEUR = "00_JDR_RACINE.json";
export const ROLES_RACINE = Object.freeze(["coffre", "table", "joueur", "unique"]);
const ID_JDR = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Lit un marqueur. → { jdr, role } ou null si le texte n'est pas un marqueur valide (jamais d'exception). */
export function lireMarqueur(texte) {
  let j;
  try { j = JSON.parse(String(texte ?? "")); } catch { return null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  if (j.version !== 1 || typeof j.jdr !== "string" || !ID_JDR.test(j.jdr) || !ROLES_RACINE.includes(j.role)) return null;
  return { jdr: j.jdr, role: j.role };
}

/** Texte du marqueur à écrire à la racine d'un dossier. */
export function ecrireMarqueur(jdr, role) {
  if (!ID_JDR.test(String(jdr))) throw new Error("Identifiant de JDR invalide : " + jdr);
  if (!ROLES_RACINE.includes(role)) throw new Error("Rôle de racine invalide : " + role);
  return JSON.stringify({ version: 1, jdr, role }, null, 2) + "\n";
}
