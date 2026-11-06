// Qui est connecté, et dans quel rôle ? Le rôle vient de la configuration publique (empreintes SHA-256, jamais d'adresse).
// ATTENTION : c'est un contrôle d'AFFICHAGE. La vraie protection est celle des partages OneDrive (voir docs/J2_HYPOTHESES.md) :
// un joueur qui se ferait passer pour le MJ n'obtiendrait que ce que OneDrive lui accorde, c'est-à-dire ses deux dossiers.

const HASH = /^[0-9a-f]{64}$/;
// même règle que `cheminCollection` : un pseudo est un nom de dossier simple, sans remontée ni caractère interdit
export const PSEUDO = /^[^/\\:?#*"<>|\u0000-\u001f.][^/\\:?#*"<>|\u0000-\u001f]*$/;

export class AutorisationsInvalides extends Error { constructor(m) { super(m); this.name = "AutorisationsInvalides"; } }
export class CompteNonAutorise extends Error { constructor() { super("Ce compte n'est pas autorisé pour ce JDR"); this.name = "CompteNonAutorise"; } }

/** Contrôle `{ mj: [hash], joueurs: { pseudo: hash } }`. Un pseudo invalide ou une empreinte mal formée est refusé : jamais corrigé en silence. */
export function validerAutorisations(a) {
  if (!a || typeof a !== "object") throw new AutorisationsInvalides("Autorisations absentes");
  const mj = a.mj ?? [], joueurs = a.joueurs ?? {};
  if (!Array.isArray(mj) || mj.some(h => !HASH.test(String(h)))) throw new AutorisationsInvalides("allowed.mj : empreintes SHA-256 attendues");
  if (typeof joueurs !== "object" || Array.isArray(joueurs)) throw new AutorisationsInvalides("allowed.joueurs : objet { pseudo: empreinte } attendu");
  const vus = new Map();
  for (const [p, h] of Object.entries(joueurs)) {
    if (!PSEUDO.test(p)) throw new AutorisationsInvalides("pseudo de joueur invalide : « " + p + " »");
    if (!HASH.test(String(h))) throw new AutorisationsInvalides("allowed.joueurs." + p + " : empreinte SHA-256 attendue");
    if (vus.has(h)) throw new AutorisationsInvalides("la même empreinte est donnée à deux joueurs (« " + vus.get(h) + " » et « " + p + " »)");
    vus.set(h, p);
  }
  return { mj: [...mj], joueurs: { ...joueurs } };
}

/**
 * @returns {Promise<{role:"mj"}|{role:"joueur",pseudo:string}|null>}  null = compte non autorisé.
 * Un compte listé comme MJ est MJ, même s'il figure aussi parmi les joueurs : le MJ possède le dossier du JDR, il ne gagne aucun droit nouveau.
 */
export async function determinerRole({ auth, allowed }) {
  const a = validerAutorisations(allowed);
  const h = await auth.empreinte();
  if (a.mj.includes(h)) return { role: "mj" };
  for (const [pseudo, hj] of Object.entries(a.joueurs)) if (hj === h) return { role: "joueur", pseudo };
  return null;
}
