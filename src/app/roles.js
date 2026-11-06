// Qui est connecté, et dans quel rôle ? (D27)
//   · MJ : un compte dont l'empreinte SHA-256 figure dans la configuration publique (jamais d'adresse e-mail). Il n'y en a qu'un, ou très peu, et elle ne bouge pas.
//   · joueur : tout autre compte. Il n'a de dossier à lire que ceux que OneDrive lui a réellement partagés ; son pseudo vient du marqueur de son dossier.
//     Il n'y a donc plus d'empreinte de joueur à récolter ni de configuration à republier quand un joueur arrive.
// ATTENTION : c'est un contrôle d'AFFICHAGE. La vraie protection est celle des partages OneDrive (voir docs/J2_HYPOTHESES.md) :
// un joueur qui se ferait passer pour le MJ n'obtiendrait que ce que OneDrive lui accorde, c'est-à-dire ses deux dossiers.

const HASH = /^[0-9a-f]{64}$/;

export class AutorisationsInvalides extends Error { constructor(m) { super(m); this.name = "AutorisationsInvalides"; } }

/** Contrôle `{ mj: [hash] }`. Une empreinte mal formée est refusée ; l'ancienne liste `joueurs` (avant D27) aussi : jamais ignorée en silence. */
export function validerAutorisations(a) {
  if (!a || typeof a !== "object") throw new AutorisationsInvalides("Autorisations absentes");
  if ("joueurs" in a) throw new AutorisationsInvalides("allowed.joueurs n'existe plus (D27) : seuls les MJ ont une empreinte ; les joueurs sont reconnus par les dossiers qui leur sont partagés");
  const mj = a.mj ?? [];
  if (!Array.isArray(mj) || mj.some(h => !HASH.test(String(h)))) throw new AutorisationsInvalides("allowed.mj : empreintes SHA-256 attendues");
  return { mj: [...mj] };
}

/** @returns {Promise<{role:"mj"}|{role:"joueur"}>}  Le pseudo d'un joueur n'est connu qu'une fois son dossier retrouvé (marqueur). */
export async function determinerRole({ auth, allowed }) {
  const a = validerAutorisations(allowed);
  return a.mj.includes(await auth.empreinte()) ? { role: "mj" } : { role: "joueur" };
}
