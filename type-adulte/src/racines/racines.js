// Retrouver les dossiers partagés d'un joueur (sa « table » en lecture, son dossier en modification) et vérifier qu'ils sont toujours accessibles.
//
// Pourquoi pas seulement « Partagés avec moi » : Microsoft a déprécié cette API ; elle ne renvoie plus qu'une partie des dossiers
// et doit cesser de renvoyer des données après novembre 2026. Les sources sont donc, par ordre de fiabilité :
//   1. les dossiers déjà mémorisés sur l'appareil ;
//   2. les liens de partage collés par le joueur (API Shares, `Prefer: redeemSharingLink`) ;
//   3. les raccourcis OneDrive du joueur (dossiers distants dans Mes fichiers) ;
//   4. « Partagés avec moi », en simple complément (jamais seul, jamais indispensable).
import { lireMarqueur, NOM_MARQUEUR } from "./marqueur.js?v=0.16.1";
import { pool } from "../graph/pool.js?v=0.16.1";

const EMPLACEMENTS_RACCOURCIS = ["", "Documents", "Documents/JDR"];
/**
 * Identité d'un dossier : « disque | élément ». Sur un OneDrive personnel, l'identifiant de disque (16 caractères hexadécimaux) et le préfixe de l'identifiant
 * d'élément reviennent tantôt en majuscules, tantôt en minuscules selon l'API qui répond (lien de partage, raccourci, « Partagés avec moi »). Sans cette
 * normalisation, un même dossier lu par deux voies serait pris pour deux dossiers, et l'application refuserait de choisir (« plusieurs dossiers partagés »).
 * Les identifiants professionnels (SharePoint, base 64) restent comparés à l'identique.
 */
export function cleDossier(n) {
  const d = String(n.driveId), i = String(n.itemId);
  if (/^[0-9a-f]{16}$/i.test(d) && /^[0-9a-f]{16}![0-9]+$/i.test(i)) return d.toUpperCase() + "|" + i.toUpperCase();
  return d + "|" + i;
}
const cle = cleDossier;
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
    catch (e) { if (estAuth(e)) throw e; return { ...n, marqueur: null, inaccessible: e.status || true, codeGraph: e.code || null }; }
  }, 4);

  // Un dossier retrouvé dont le marqueur ne se lit pas (réseau, blocage du navigateur, 5xx) : on le dit, sans jamais donner son lien ni son nom.
  for (const x of lus) if (x.inaccessible) problemes.push({ type: "marqueur_illisible", status: x.inaccessible === true ? null : x.inaccessible, code: x.codeGraph || null, source: x.source });
  const duJdr = lus.filter(x => x.marqueur && x.marqueur.jdr === profil.id);
  // D27 : le pseudo d'un joueur vit dans le marqueur de son dossier. Un dossier « joueur » sans pseudo n'est pas utilisé, et on le dit.
  for (const x of duJdr) if (x.marqueur.role === "joueur" && !x.marqueur.pseudo) problemes.push({ type: "marqueur_sans_pseudo" });
  const candidats = duJdr.filter(x => !(x.marqueur.role === "joueur" && !x.marqueur.pseudo));
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
    if (uniques.length === 1) racines[role] = { driveId: uniques[0].driveId, itemId: uniques[0].itemId, ...(role === "joueur" ? { pseudo: uniques[0].marqueur.pseudo } : {}) };
    else if (uniques.length > 1) problemes.push({ type: "ambigu", role, noms: uniques.map(c => c.name), sources: uniques.map(c => c.source) });
  }
  const complet = attendus.every(r => racines[r]) && !problemes.some(p => p.type === "ambigu" || p.type === "coffre_partage");
  return { racines, complet, problemes, diagnostic, candidats: candidats.map(c => ({ name: c.name, role: c.marqueur.role, source: c.source })) };
}

/**
 * Au démarrage : les dossiers mémorisés sont-ils toujours là, avec le même rôle ?
 * → { role: "ok" | "acces_retire" | "marqueur_change" | "hors_ligne" }
 */
export async function verifierRacines(o) { return (await verifierRacinesDetail(o)).etat; }

/** Comme `verifierRacines`, et renvoie aussi les marqueurs lus : `{ etat, marqueurs: { role: { jdr, role, pseudo } } }` (le pseudo d'un joueur en vient, D27). */
export async function verifierRacinesDetail({ client, profil, racines }) {
  const etat = {}, marqueurs = {};
  // Les dossiers (table, joueur) se vérifient en même temps : le démarrage attend la plus lente, pas la somme.
  await Promise.all(Object.entries(racines).map(async ([role, noeud]) => {
    try {
      const m = lireMarqueur(await client.lireTexte(noeud, NOM_MARQUEUR));
      // un dossier « joueur » dont le marqueur n'a plus de pseudo valide est traité comme un dossier changé : on le redécouvre (et le problème est dit)
      if (m && m.jdr === profil.id && m.role === role && (role !== "joueur" || m.pseudo)) { etat[role] = "ok"; marqueurs[role] = m; }
      else etat[role] = (await client.lister(noeud)) === null ? "acces_retire" : "marqueur_change";   // 404 sur le dossier lui-même = partage retiré
    } catch (e) {
      if (estAuth(e)) throw e;
      etat[role] = e.status === 403 || e.status === 404 ? "acces_retire" : "hors_ligne";
    }
  }));
  return { etat, marqueurs };
}
