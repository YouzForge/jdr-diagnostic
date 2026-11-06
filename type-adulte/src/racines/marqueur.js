// Fichier marqueur posé à la racine de chaque dossier partagé : il dit à quel JDR et à quel rôle appartient le dossier.
// Il ne contient rien de secret (un identifiant de JDR, un rôle et, pour le dossier d'un joueur, son pseudo). PROPOSITION de la base, à valider par le MJ (D22).
//
// D27 : le pseudo d'un joueur vient du marqueur de SON dossier (écrit par le générateur), plus d'une liste d'empreintes dans la configuration publique.
// Le joueur a le droit d'écrire dans son dossier : il peut donc changer ce pseudo, ce qui ne change que le nom affiché dans sa propre application.
//
// Sécurité : le marqueur sert à RECONNAÎTRE un dossier, jamais à lui donner des droits. Les droits viennent de OneDrive.
// Un joueur qui écrit un faux marqueur dans son propre dossier n'obtient rien de plus ; au pire il brouille sa propre application
// (deux dossiers « table » → l'application refuse de choisir, voir racines.js).

export const NOM_MARQUEUR = "00_JDR_RACINE.json";
export const ROLES_RACINE = Object.freeze(["coffre", "table", "joueur", "unique"]);
const ID_JDR = /^[a-z0-9][a-z0-9_-]{0,63}$/;
// un pseudo est un nom de dossier simple, sans remontée ni caractère interdit (même règle que `cheminCollection`)
export const PSEUDO = /^[^/\\:?#*"<>|\u0000-\u001f.][^/\\:?#*"<>|\u0000-\u001f]{0,63}$/;

/**
 * Lit un marqueur. → { jdr, role, pseudo } ou null si le texte n'est pas un marqueur valide (jamais d'exception).
 * `pseudo` vaut null s'il est absent ou invalide : c'est à l'appelant de refuser un dossier « joueur » sans pseudo.
 */
export function lireMarqueur(texte) {
  let j;
  try { j = JSON.parse(String(texte ?? "")); } catch { return null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  if (j.version !== 1 || typeof j.jdr !== "string" || !ID_JDR.test(j.jdr) || !ROLES_RACINE.includes(j.role)) return null;
  return { jdr: j.jdr, role: j.role, pseudo: j.role === "joueur" && typeof j.pseudo === "string" && PSEUDO.test(j.pseudo) ? j.pseudo : null };
}

/** Texte du marqueur à écrire à la racine d'un dossier. */
export function ecrireMarqueur(jdr, role, pseudo) {
  if (!ID_JDR.test(String(jdr))) throw new Error("Identifiant de JDR invalide : " + jdr);
  if (!ROLES_RACINE.includes(role)) throw new Error("Rôle de racine invalide : " + role);
  if (role === "joueur") { if (typeof pseudo !== "string" || !PSEUDO.test(pseudo)) throw new Error("Le marqueur d'un dossier joueur exige un pseudo valide : " + pseudo); }
  else if (pseudo !== undefined) throw new Error("Seul le marqueur d'un dossier joueur porte un pseudo");
  return JSON.stringify(role === "joueur" ? { version: 1, jdr, role, pseudo } : { version: 1, jdr, role }, null, 2) + "\n";
}
