// Ouvrir une session : qui est connecté, où sont ses dossiers, que peut-il lire ? Aucune interface ici (tout est testé dans Node).
//
// Joueur en mode séparé : deux dossiers partagés (la table en lecture, le sien en modification), retrouvés
//   1. parmi ceux déjà mémorisés sur l'appareil (identifiants OneDrive, jamais les liens) puis revérifiés au démarrage ;
//   2. sinon par les liens collés une fois ; sinon par les raccourcis OneDrive et, en simple complément, « Partagés avec moi ».
// Si un accès a été retiré, la copie locale n'est JAMAIS servie à la place : on oublie le dossier et on redemande le lien.
import { determinerRole, CompteNonAutorise } from "./roles.js";
import { creerCache } from "../depot/cache.js";
import { creerDepot } from "../depot/depot.js";
import { trouverRacines, verifierRacines } from "../racines/racines.js";

const estAuth = e => e && (e.status === 401 || e.auth);

/**
 * @param {object} o
 * @param {object} o.auth       connexion (empreinte())
 * @param {object} o.client     client Graph
 * @param {object} o.profil     profil validé
 * @param {object} o.allowed    { mj: [empreintes], joueurs: { pseudo: empreinte } }
 * @param {object} o.stockage   stockage local (creerStockageNavigateur / creerStockageMemoire)
 * @param {string[]} [o.liens]  liens collés par le joueur (jamais mémorisés)
 * @param {string} [o.cheminMJ] dossier du JDR sur le OneDrive du MJ (par défaut : `profil.dossier`)
 * @returns {Promise<{statut:"pret"|"a_relier"|"dossier_mj_introuvable", role:string, pseudo?:string, problemes:object[], manque:string[], horsLigne:boolean, depot:object|null, cache:object}>}
 * @throws CompteNonAutorise (compte inconnu), et les erreurs 401 (reconnexion nécessaire)
 */
export async function ouvrirSession({ auth, client, profil, allowed, stockage, liens = [], cheminMJ }) {
  const qui = await determinerRole({ auth, allowed });
  if (!qui) throw new CompteNonAutorise();
  const cache = creerCache(stockage, await auth.empreinte());
  const separe = profil.securite && profil.securite.mode === "separe";
  const base = { role: qui.role, pseudo: qui.pseudo, problemes: [], manque: [], horsLigne: false, depot: null, cache };

  if (qui.role === "mj") {
    const jdr = { path: cheminMJ || profil.dossier };
    let l;
    try { l = await client.lister(jdr); } catch (e) { if (estAuth(e)) throw e; return { ...base, statut: "dossier_mj_introuvable", problemes: [{ type: "reseau", status: e.status || null }] }; }
    if (l === null) return { ...base, statut: "dossier_mj_introuvable", problemes: [{ type: "dossier_mj_introuvable" }] };
    return { ...base, statut: "pret", depot: creerDepot({ client, profil, role: "mj", racines: { jdr }, cache }) };
  }

  const attendus = separe ? ["table", "joueur"] : ["unique"];
  const memo = cache.lire("racines") || {};
  let racines = null, problemes = [], horsLigne = false;

  if (attendus.every(r => memo[r])) {
    const etat = await verifierRacines({ client, profil, racines: memo });   // 401 remonte
    const retires = Object.entries(etat).filter(([, v]) => v === "acces_retire" || v === "marqueur_change");
    if (retires.length) {
      problemes = retires.map(([role, v]) => ({ type: v, role }));
      cache.retirer("racines"); cache.retirerPrefixe("ls:"); cache.retirerPrefixe("tx:");   // jamais de copie d'un dossier dont l'accès est coupé
      for (const [role] of retires) delete memo[role];
    } else { racines = memo; horsLigne = Object.values(etat).includes("hors_ligne"); }
  }

  if (!racines) {
    const r = await trouverRacines({ client, profil, memorises: Object.values(memo), liens });   // 401 remonte
    problemes = [...problemes, ...r.problemes];
    if (r.complet) { racines = r.racines; cache.ecrire("racines", racines); }
    else {
      if (Object.keys(r.racines).length) cache.ecrire("racines", r.racines);
      return { ...base, statut: "a_relier", problemes, manque: attendus.filter(x => !r.racines[x]) };
    }
  }
  return { ...base, statut: "pret", problemes, horsLigne, depot: creerDepot({ client, profil, role: "joueur", racines, cache }) };
}
