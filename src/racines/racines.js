// Retrouver les dossiers partagés d'un joueur (sa « table » en lecture, son dossier en modification) et vérifier qu'ils sont toujours accessibles.
//
// Pourquoi pas seulement « Partagés avec moi » : Microsoft a déprécié cette API ; elle ne renvoie plus qu'une partie des dossiers
// et doit cesser de renvoyer des données après novembre 2026. Les sources sont donc, par ordre de fiabilité :
//   1. les dossiers déjà mémorisés sur l'appareil ;
//   2. les liens de partage collés par le joueur (API Shares, `Prefer: redeemSharingLink`) ;
//   3. les raccourcis OneDrive du joueur (dossiers distants dans Mes fichiers) ;
//   4. « Partagés avec moi », en simple complément (jamais seul, jamais indispensable).
import { lireMarqueur, NOM_MARQUEUR } from "./marqueur.js";
import { pool } from "../graph/pool.js";

const EMPLACEMENTS_RACCOURCIS = ["", "Documents", "Documents/JDR"];
const cle = n => n.driveId + "|" + n.itemId;
const estAuth = e => e && (e.status === 401 || e.auth);

/**
 * @param {object} o
 * @param {object} o.client            client Graph (creerClientGraph)
 * @param {object} o.profil            profil validé (id, securite.mode)
 * @param {object[]} [o.memorises]     nœuds { driveId, itemId } déjà connus
 * @param {string[]} [o.liens]         liens de partage collés
 * @returns {{racines:object, complet:boolean, problemes:object[], diagnostic:object, candidats:object[]}}
 */
export async function trouverRacines({ client, profil, memorises = [], liens = [], scruterRaccourcis = true, utiliserPartagesAvecMoi = true }) {
  const problemes = [];
  const diagnostic = { liens: { ok: 0, echec: 0 }, raccourcis: 0, partagesAvecMoi: "non_essaye" };
  const vus = new Map();
  const ajouter = (n, source) => { if (n && n.driveId && n.itemId && !vus.has(cle(n))) vus.set(cle(n), { driveId: n.driveId, itemId: n.itemId, name: n.name || "", source }); };

  for (const n of memorises) ajouter(n, "memorise");

  await pool(liens.map((lien, i) => ({ lien, i })), async ({ lien, i }) => {
    try { ajouter(await client.resoudreLien(lien), "lien"); diagnostic.liens.ok++; }
    catch (e) {
      if (estAuth(e)) throw e;
      diagnostic.liens.echec++;
      // le lien lui-même n'est jamais recopié dans le rapport (il peut ouvrir un dossier)
      problemes.push({ type: "lien", numero: i + 1, status: e.status || null, message: e.status === 403 || e.status === 404 ? "ce lien n'ouvre rien pour ce compte" : (e.message || "lien illisible") });
    }
  }, 3);

  if (scruterRaccourcis) {
    for (const emp of EMPLACEMENTS_RACCOURCIS) {
      let liste = null;
      try { liste = await client.lister({ path: emp }); } catch (e) { if (estAuth(e)) throw e; }
      for (const x of liste || []) if (x.remote && x.dir && x.driveId) { ajouter({ driveId: x.driveId, itemId: x.idCible, name: x.name }, "raccourci"); diagnostic.raccourcis++; }
    }
  }

  if (utiliserPartagesAvecMoi) {
    try { const l = await client.partagesAvecMoi(); diagnostic.partagesAvecMoi = l.length; for (const n of l) ajouter(n, "partagesAvecMoi"); }
    catch (e) { if (estAuth(e)) throw e; diagnostic.partagesAvecMoi = "echec"; }
  }

  const lus = await pool([...vus.values()], async n => {
    try { return { ...n, marqueur: lireMarqueur(await client.lireTexte(n, NOM_MARQUEUR)) }; }
    catch (e) { if (estAuth(e)) throw e; return { ...n, marqueur: null, inaccessible: e.status || true }; }
  }, 4);

  // Un dossier retrouvé dont le marqueur ne se lit pas (réseau, blocage du navigateur, 5xx) : on le dit, sans jamais donner son lien ni son nom.
  for (const x of lus) if (x.inaccessible) problemes.push({ type: "marqueur_illisible", status: x.inaccessible === true ? null : x.inaccessible, source: x.source });
  const candidats = lus.filter(x => x.marqueur && x.marqueur.jdr === profil.id);
  const racines = {};
  for (const c of candidats) {
    if (c.marqueur.role === "coffre") {
      // Le coffre MJ n'est jamais partagé. S'il apparaît, on ne l'utilise pas et on le signale fort.
      problemes.push({ type: "coffre_partage", message: "Le dossier du coffre MJ est partagé avec ce compte : à retirer tout de suite." });
    }
  }
  const attendus = profil.securite && profil.securite.mode === "separe" ? ["table", "joueur"] : ["unique"];
  for (const role of attendus) {
    const l = candidats.filter(c => c.marqueur.role === role);
    const uniques = [...new Map(l.map(c => [cle(c), c])).values()];
    if (uniques.length === 1) racines[role] = { driveId: uniques[0].driveId, itemId: uniques[0].itemId };
    else if (uniques.length > 1) problemes.push({ type: "ambigu", role, noms: uniques.map(c => c.name) });
  }
  const complet = attendus.every(r => racines[r]) && !problemes.some(p => p.type === "ambigu" || p.type === "coffre_partage");
  return { racines, complet, problemes, diagnostic, candidats: candidats.map(c => ({ name: c.name, role: c.marqueur.role, source: c.source })) };
}

/**
 * Au démarrage : les dossiers mémorisés sont-ils toujours là, avec le même rôle ?
 * → { role: "ok" | "acces_retire" | "marqueur_change" | "hors_ligne" }
 */
export async function verifierRacines({ client, profil, racines }) {
  const etat = {};
  for (const [role, noeud] of Object.entries(racines)) {
    try {
      const m = lireMarqueur(await client.lireTexte(noeud, NOM_MARQUEUR));
      if (m && m.jdr === profil.id && m.role === role) etat[role] = "ok";
      else etat[role] = (await client.lister(noeud)) === null ? "acces_retire" : "marqueur_change";   // 404 sur le dossier lui-même = partage retiré
    } catch (e) {
      if (estAuth(e)) throw e;
      etat[role] = e.status === 403 || e.status === 404 ? "acces_retire" : "hors_ligne";
    }
  }
  return etat;
}
