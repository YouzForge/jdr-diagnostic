// Ouvrir une session : qui est connecté, où sont ses dossiers, que peut-il lire ? Aucune interface ici (tout est testé dans Node).
//
// Qui est MJ ? Le seul compte dont l'empreinte est dans la configuration. Tout autre compte est un joueur (D27) : il n'a que les dossiers
// que OneDrive lui a partagés, et son pseudo est celui du marqueur de son dossier.
//
// Joueur en mode séparé : deux dossiers partagés (la table en lecture, le sien en modification), retrouvés
//   1. parmi ceux déjà mémorisés sur l'appareil (identifiants OneDrive, jamais les liens) puis revérifiés au démarrage ;
//   2. sinon par les liens collés une fois ; sinon par les raccourcis OneDrive et, en simple complément, « Partagés avec moi ».
// Si un accès a été retiré, la copie locale n'est JAMAIS servie à la place : on oublie le dossier et on redemande le lien.
import { determinerRole } from "./roles.js";
import { creerCache } from "../depot/cache.js";
import { creerDepot } from "../depot/depot.js";
import { trouverRacines, verifierRacinesDetail } from "../racines/racines.js";
import { nomMemoire, ecrireMemoire, lireMemoire } from "../racines/memoire.js";

const estAuth = e => e && (e.status === 401 || e.auth);

/** D29 : les dossiers du joueur sont aussi retenus dans SON OneDrive (dossier d'application) ; best-effort : une panne ici ne bloque jamais, sauf 401. */
async function lireMemoireDistante(client, profil, attendus) {
  try { const t = await client.lireFichierApp(nomMemoire(profil.id)); return { texte: t, racines: t == null ? {} : lireMemoire(t, profil.id, attendus) }; }
  catch (e) { if (estAuth(e)) throw e; return { texte: undefined, racines: {} }; }
}
async function sauvegarderMemoire(client, profil, racines, texteConnu) {
  try {
    const voulu = ecrireMemoire(profil.id, racines);
    const actuel = texteConnu !== undefined ? texteConnu : await client.lireFichierApp(nomMemoire(profil.id));
    if (actuel !== voulu) await client.ecrireFichierApp(nomMemoire(profil.id), voulu);
  } catch (e) { if (estAuth(e)) throw e; }
}

/**
 * @param {object} o
 * @param {object} o.auth       connexion (empreinte())
 * @param {object} o.client     client Graph
 * @param {object} o.profil     profil validé
 * @param {object} o.allowed    { mj: [empreintes] }
 * @param {object} o.stockage   stockage local (creerStockageNavigateur / creerStockageMemoire)
 * @param {string[]} [o.liens]  liens collés par le joueur (jamais mémorisés)
 * @param {string} [o.cheminMJ] dossier du JDR sur le OneDrive du MJ (par défaut : `profil.dossier`)
 * @returns {Promise<{statut:"pret"|"a_relier"|"dossier_mj_introuvable", role:string, pseudo?:string, problemes:object[], manque:string[], horsLigne:boolean, depot:object|null, cache:object}>}
 * @throws les erreurs 401 (reconnexion nécessaire)
 */
export async function ouvrirSession({ auth, client, profil, allowed, stockage, liens = [], cheminMJ, ecriture = false }) {
  const qui = await determinerRole({ auth, allowed });
  const cache = creerCache(stockage, await auth.empreinte());
  const separe = profil.securite && profil.securite.mode === "separe";
  const base = { role: qui.role, pseudo: undefined, problemes: [], manque: [], horsLigne: false, depot: null, cache };

  if (qui.role === "mj") {
    const jdr = { path: cheminMJ || profil.dossier };
    let l;
    try { l = await client.lister(jdr); } catch (e) { if (estAuth(e)) throw e; return { ...base, statut: "dossier_mj_introuvable", problemes: [{ type: "reseau", status: e.status || null }] }; }
    if (l === null) return { ...base, statut: "dossier_mj_introuvable", problemes: [{ type: "dossier_mj_introuvable" }] };
    return { ...base, statut: "pret", depot: creerDepot({ client, profil, role: "mj", racines: { jdr }, cache, ecriture: ecriture === true }) };
  }

  const attendus = separe ? ["table", "joueur"] : ["unique"];
  const memo = cache.lire("racines") || {};
  let racines = null, problemes = [], horsLigne = false;
  // Mémoire de l'appareil absente ou incomplète (cache vidé, autre téléphone…) : on la retrouve dans le OneDrive du joueur, sans lien à recoller.
  let texteDistant;
  if (!attendus.every(r => memo[r])) {
    const d = await lireMemoireDistante(client, profil, attendus);
    texteDistant = d.texte;
    for (const r of attendus) if (!memo[r] && d.racines[r]) memo[r] = d.racines[r];
  }

  if (attendus.every(r => memo[r])) {
    const { etat, marqueurs } = await verifierRacinesDetail({ client, profil, racines: memo });   // 401 remonte
    const retires = Object.entries(etat).filter(([, v]) => v === "acces_retire" || v === "marqueur_change");
    if (retires.length) {
      problemes = retires.map(([role, v]) => ({ type: v, role }));
      cache.retirer("racines"); cache.retirerPrefixe("ls:"); cache.retirerPrefixe("tx:");   // jamais de copie d'un dossier dont l'accès est coupé
      for (const [role] of retires) delete memo[role];
    } else {
      racines = memo; horsLigne = Object.values(etat).includes("hors_ligne");
      // le pseudo vient du marqueur lu à l'instant ; hors ligne, de celui mémorisé avec le dossier
      if (marqueurs.joueur && marqueurs.joueur.pseudo !== (memo.joueur && memo.joueur.pseudo)) memo.joueur = { ...memo.joueur, pseudo: marqueurs.joueur.pseudo };
      cache.ecrire("racines", memo);   // aussi quand la mémoire vient du OneDrive du joueur : l'appareil la garde
    }
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
  await sauvegarderMemoire(client, profil, racines, texteDistant);
  return { ...base, pseudo: racines.joueur && racines.joueur.pseudo, statut: "pret", problemes, horsLigne, depot: creerDepot({ client, profil, role: "joueur", racines, cache, ecriture: ecriture === true }) };
}
