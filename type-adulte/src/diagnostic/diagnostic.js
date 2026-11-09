// Diagnostic d'étanchéité, à lancer depuis le téléphone ou l'ordinateur d'un joueur de test, avec SON compte et les deux liens reçus.
// Il rejoue le protocole de preuve (docs/J2_HYPOTHESES.md) avec NOTRE application et le vrai OneDrive :
//   liens → marqueurs → liste → lecture du contenu → écriture chez soi → écriture refusée dans la table → parent et racine inaccessibles.
// Il n'écrit que des fichiers « 00_diagnostic_… » dans le dossier du joueur et les supprime. Il n'affiche JAMAIS un lien, un jeton,
// un identifiant ni un nom de dossier : le rapport peut être copié et envoyé tel quel.
import { trouverRacines, verifierRacines } from "../racines/racines.js?v=0.16.1";

const MAX_FICHIERS = 300;
const estAuth = e => e && (e.status === 401 || e.auth);
const alea = () => Math.random().toString(36).slice(2, 8);

/** Classe une erreur sans révéler d'adresse : « 403 », « 404 », ou « reseau » (aucun code HTTP : coupure ou blocage du navigateur, CORS compris). */
const natureErreur = e => e && e.status ? String(e.status) : "reseau";

async function lireTout(client, noeud, restant) {
  const r = { fichiers: 0, octets: 0, echecs: {}, dossiers: 0, tronque: false };
  const pile = [""];
  while (pile.length) {
    const rel = pile.pop();
    let liste;
    try { liste = await client.lister(noeud, rel); } catch (e) { if (estAuth(e)) throw e; r.echecs["liste:" + natureErreur(e)] = (r.echecs["liste:" + natureErreur(e)] || 0) + 1; continue; }
    if (!liste) continue;
    r.dossiers++;
    for (const x of liste) {
      const chemin = rel ? `${rel}/${x.name}` : x.name;
      if (x.dir) { pile.push(chemin); continue; }
      if (restant.n <= 0) { r.tronque = true; continue; }
      restant.n--;
      try { const t = await client.lireTexte(noeud, chemin); if (t === null) r.echecs.absent = (r.echecs.absent || 0) + 1; else { r.fichiers++; r.octets += t.length; } }
      catch (e) { if (estAuth(e)) throw e; const k = "lecture:" + natureErreur(e); r.echecs[k] = (r.echecs[k] || 0) + 1; }
    }
  }
  return r;
}

/**
 * @param {object} o
 * @param {object} o.client   client Graph (creerClientGraph) branché sur le compte du joueur de test
 * @param {object} o.profil   profil validé
 * @param {string[]} o.liens  les liens de partage reçus (table et dossier du joueur)
 * @returns {{ok:boolean, etapes:{id:string,titre:string,etat:"ok"|"echec"|"non_verifie",detail:string}[], rapport:string}}
 */
export async function lancerDiagnostic({ client, profil, liens }) {
  const etapes = [];
  const noter = (id, titre, etat, detail) => etapes.push({ id, titre, etat, detail });
  const separe = profil.securite && profil.securite.mode === "separe";

  // 1. Retrouver les dossiers par les liens
  let trouve;
  try { trouve = await trouverRacines({ client, profil, liens, scruterRaccourcis: false, utiliserPartagesAvecMoi: false }); }
  catch (e) { if (estAuth(e)) throw e; noter("liens", "Retrouver les dossiers par les liens", "echec", "erreur " + natureErreur(e)); return conclure(etapes); }
  const attendus = separe ? ["table", "joueur"] : ["unique"];
  const problemes = trouve.problemes.map(p => p.type + (p.role ? ":" + p.role : "") + (p.status ? ":" + p.status : ""));
  noter("liens", "Retrouver les dossiers par les liens", trouve.complet ? "ok" : "echec",
    trouve.complet ? `${attendus.join(" + ")} retrouvés (${trouve.diagnostic.liens.ok} lien(s) lu(s))` : `incomplet : ${attendus.filter(r => !trouve.racines[r]).join(", ") || "—"} manquant(s) ; problèmes : ${problemes.join(", ") || "aucun"}`);
  if (trouve.problemes.some(p => p.type === "coffre_partage")) noter("coffre", "Le coffre MJ n'est pas partagé avec ce compte", "echec", "le dossier du coffre répond au compte du joueur : retirer ce partage immédiatement");
  else noter("coffre", "Le coffre MJ n'est pas partagé avec ce compte", "ok", "aucun dossier « coffre » parmi ceux qui répondent");
  if (!trouve.complet) return conclure(etapes);
  const racines = trouve.racines;

  // 2. Marqueurs
  try { const v = await verifierRacines({ client, profil, racines }); const mal = Object.entries(v).filter(([, e]) => e !== "ok");
    noter("marqueurs", "Marqueurs des dossiers (JDR et rôle)", mal.length ? "echec" : "ok", mal.length ? mal.map(([r, e]) => `${r}: ${e}`).join(", ") : "conformes"); }
  catch (e) { if (estAuth(e)) throw e; noter("marqueurs", "Marqueurs des dossiers (JDR et rôle)", "echec", "erreur " + natureErreur(e)); }

  // 3. Lecture du contenu (c'est ici que se verrait un blocage du navigateur, CORS compris)
  const restant = { n: MAX_FICHIERS };
  for (const role of attendus) {
    const r = await lireTout(client, racines[role], restant);
    const nEchecs = Object.values(r.echecs).reduce((a, b) => a + b, 0);
    noter("contenu_" + role, `Lecture du contenu (${role})`, nEchecs || r.fichiers === 0 ? "echec" : "ok",
      `${r.fichiers} fichier(s) lu(s), ${r.octets} caractères, ${r.dossiers} dossier(s) parcouru(s)` + (nEchecs ? ` ; échecs : ${Object.entries(r.echecs).map(([k, v]) => `${k}×${v}`).join(", ")}` : "") + (r.fichiers === 0 && !nEchecs ? " ; aucun fichier trouvé" : "") + (r.tronque ? ` ; limité à ${MAX_FICHIERS} fichiers` : ""));
  }

  // 4. Écrire chez soi (puis nettoyer)
  const joueur = racines.joueur || racines.unique;
  const nom = `00_diagnostic_${alea()}.md`, texte = `# diagnostic ${alea()}\n`;
  try {
    await client.ecrireTexte(joueur, nom, texte);
    const relu = await client.lireTexte(joueur, nom);
    await client.supprimer(joueur, nom);
    const apres = await client.lireTexte(joueur, nom);
    noter("ecriture_joueur", "Écrire, relire et supprimer dans son propre dossier", relu === texte && apres === null ? "ok" : "echec",
      relu !== texte ? "le texte relu n'est pas celui qui a été écrit" : apres !== null ? "le fichier de test n'a pas pu être supprimé (à supprimer à la main)" : "écriture, relecture et suppression réussies");
  } catch (e) {
    if (estAuth(e)) throw e;
    try { await client.supprimer(joueur, nom); } catch { /* nettoyage au mieux */ }
    noter("ecriture_joueur", "Écrire, relire et supprimer dans son propre dossier", "echec", "erreur " + natureErreur(e));
  }

  // 5. Table : écriture refusée (on interroge OneDrive directement, sans la barrière locale du dépôt)
  if (separe) {
    const essais = [[`${"00_diagnostic_intrus_" + alea()}.md`, "racine"], [`00_diagnostic_dossier_${alea()}/intrus.md`, "sous-dossier"]];
    const bilan = [];
    let violation = false;
    for (const [rel, quoi] of essais) {
      try { await client.ecrireTexte(racines.table, rel, "intrus\n"); violation = true; bilan.push(`${quoi}: ÉCRIT`); try { await client.supprimer(racines.table, rel); } catch { /* au mieux */ } }
      catch (e) { if (estAuth(e)) throw e; bilan.push(`${quoi}: refusé (${natureErreur(e)})`); }
    }
    const incertain = bilan.some(b => /refusé \(reseau\)/.test(b));
    noter("table_lecture_seule", "La table est en lecture seule", violation ? "echec" : incertain ? "non_verifie" : "ok",
      bilan.join(" ; ") + (violation ? " — le joueur peut écrire dans la table : partage à corriger (lecture seule)" : incertain ? " — réponse sans code HTTP : coupure ou blocage, test à refaire" : ""));
  }

  // 6. Remonter : le parent de chaque dossier partagé et la racine du disque ne doivent rien laisser voir
  const parents = [];
  for (const lien of liens) {
    try { const n = await client.resoudreLien(lien); if (n.parentId) parents.push({ driveId: n.driveId, parentId: n.parentId }); }
    catch (e) { if (estAuth(e)) throw e; }
  }
  if (!parents.length) noter("parent", "Le dossier parent est inaccessible", "non_verifie", "OneDrive n'a pas indiqué de dossier parent : rien à tester");
  else {
    let accessibles = 0, reseau = 0;
    for (const p of parents) {
      try { if (await client.existe({ driveId: p.driveId, itemId: p.parentId })) accessibles++; const l = await client.lister({ driveId: p.driveId, itemId: p.parentId }); if (l && l.length) accessibles++; }
      catch (e) { if (estAuth(e)) throw e; if (e.status === 403) continue; reseau++; }
    }
    noter("parent", "Le dossier parent est inaccessible", accessibles ? "echec" : reseau ? "non_verifie" : "ok",
      accessibles ? `${accessibles} dossier(s) au-dessus répond(ent) au joueur : partage trop large` : reseau ? "réponse sans code HTTP : test à refaire" : `${parents.length} dossier(s) parent(s) refusé(s) ou introuvable(s)`);
  }
  try {
    const disques = [...new Set(parents.map(p => p.driveId).concat(Object.values(racines).map(r => r.driveId)))];
    let vus = 0; for (const d of disques) vus += await client.listerRacineDisque(d);
    noter("racine_disque", "La racine du disque du MJ est vide pour ce compte", vus ? "echec" : "ok", vus ? `${vus} élément(s) visible(s) à la racine du disque du MJ` : "aucun élément visible");
  } catch (e) { if (estAuth(e)) throw e; noter("racine_disque", "La racine du disque du MJ est vide pour ce compte", "non_verifie", "erreur " + natureErreur(e)); }

  return conclure(etapes);
}

function conclure(etapes) {
  const ok = etapes.length > 0 && etapes.every(e => e.etat === "ok");
  const icone = { ok: "✅", echec: "❌", non_verifie: "❔" };
  const rapport = [
    `Diagnostic d'étanchéité : ${ok ? "TOUT EST CONFORME" : etapes.some(e => e.etat === "echec") ? "ÉCHEC" : "INCOMPLET"}`,
    ...etapes.map(e => `${icone[e.etat]} ${e.titre} — ${e.detail}`),
    "(aucun lien, jeton, identifiant ni nom de dossier dans ce rapport)"
  ].join("\n");
  return { ok, etapes, rapport };
}
