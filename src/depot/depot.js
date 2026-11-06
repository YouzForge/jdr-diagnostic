// Le dépôt : où se trouve chaque dossier du profil, et ce que le rôle connecté a le droit d'y faire.
//
//  - MJ (ou JDR « unique ») : une racine, le dossier complet du JDR sur son OneDrive ; tous les chemins du profil s'y appliquent.
//  - Joueur en mode séparé : DEUX racines partagées, `table` (lecture) et `joueur` (modification). Le coffre n'existe pas pour lui :
//    toute tentative d'y accéder est refusée ICI, avant même d'interroger OneDrive (seconde ligne de défense ; la première reste OneDrive).
import { cheminSur } from "../graph/client.js";

export class AccesRefuse extends Error {
  constructor(message, raison) { super(message); this.name = "AccesRefuse"; this.raison = raison; }
}

/**
 * Le dossier lui-même n'est plus accessible (partage retiré, ou dossier supprimé). OneDrive répond 404 dans ce cas, comme pour
 * un fichier simplement absent : sans cette vérification, un accès retiré passerait pour « dossier vide ».
 * `status` = 404 pour que la copie locale ne soit jamais servie à la place.
 */
export class AccesRetire extends AccesRefuse {
  constructor(message = "Accès retiré ou dossier introuvable") { super(message, "acces_retire"); this.name = "AccesRetire"; this.status = 404; }
}

const premier = p => p.split("/").filter(Boolean)[0] || "";
const sansPremier = p => p.split("/").filter(Boolean).slice(1).join("/");
const jointure = (...p) => p.filter(Boolean).join("/");

/**
 * @param {object} o
 * @param {object} o.client       client Graph
 * @param {object} o.profil       profil validé
 * @param {"mj"|"joueur"} o.role
 * @param {object} o.racines      MJ / unique : { jdr:{path}|{driveId,itemId} } ; joueur séparé : { table, joueur } ; joueur unique : { unique }
 * @param {object} [o.cache]      creerCache(...)
 */
export function creerDepot({ client, profil, role, racines, cache = null }) {
  const sec = profil.securite || {};
  const separe = sec.mode === "separe";
  if (role !== "mj" && role !== "joueur") throw new TypeError("Rôle inconnu : " + role);

  /** Résout un chemin du profil (« MJ/01_Univers/Lieux », « Table/Resumes », « Inventaire ») en { noeud, rel, ecriture }. */
  function resoudre(chemin) {
    chemin = cheminSur(chemin);
    if (!chemin) throw new AccesRefuse("Chemin vide", "vide");
    if (!separe) {
      const noeud = role === "mj" ? racines.jdr : racines.unique;
      if (!noeud) throw new AccesRefuse("Dossier du JDR non configuré", "racine_absente");
      return { noeud, rel: chemin, ecriture: true };
    }
    if (role === "mj") {
      if (!racines.jdr) throw new AccesRefuse("Dossier du JDR non configuré", "racine_absente");
      return { noeud: racines.jdr, rel: chemin, ecriture: true };
    }
    // joueur, mode séparé
    const tete = premier(chemin);
    if (tete === sec.coffre) throw new AccesRefuse("Le coffre du MJ n'est pas accessible aux joueurs", "coffre");
    if (tete === sec.table) {
      if (!racines.table) throw new AccesRefuse("Dossier de la table non configuré", "racine_absente");
      return { noeud: racines.table, rel: sansPremier(chemin), ecriture: false };   // la table est en LECTURE pour un joueur
    }
    if (tete === sec.joueurs) throw new AccesRefuse("Le dossier des joueurs n'est pas accessible tel quel : utiliser le dossier du joueur connecté", "joueurs");
    if (!racines.joueur) throw new AccesRefuse("Dossier du joueur non configuré", "racine_absente");
    return { noeud: racines.joueur, rel: chemin, ecriture: true };   // chemin relatif au dossier du joueur
  }

  const hors = e => !e.status || e.status >= 500;
  const sceller = (k, v) => { if (cache) cache.ecrire(k, v); };

  return {
    resoudre,

    /** Contenu d'un dossier. → { donnees:[{name,dir,size}], perime, absent } */
    async lister(chemin) {
      const { noeud, rel } = resoudre(chemin);
      const k = "ls:" + chemin;
      try {
        const l = await client.lister(noeud, rel);
        if (l === null) {
          if (!(await client.existe(noeud))) throw new AccesRetire();
          return { donnees: [], perime: false, absent: true };
        }
        const donnees = l.map(x => ({ name: x.name, dir: x.dir, size: x.size }));
        sceller(k, donnees);
        return { donnees, perime: false, absent: false };
      } catch (e) {
        const c = cache && hors(e) ? cache.lire(k) : null;
        if (c) return { donnees: c, perime: true, absent: false };
        throw e;
      }
    },

    /** Texte d'un fichier. → { texte, perime } (texte = null s'il n'existe pas) */
    async lire(chemin) {
      const { noeud, rel } = resoudre(chemin);
      const k = "tx:" + chemin;
      try {
        const t = await client.lireTexte(noeud, rel);
        if (t === null && !(await client.existe(noeud))) throw new AccesRetire();
        if (t !== null) sceller(k, t);
        return { texte: t, perime: false };
      } catch (e) {
        const c = cache && hors(e) ? cache.lire(k) : null;
        if (c != null) return { texte: c, perime: true };
        throw e;
      }
    },

    async ecrire(chemin, texte) {
      const r = resoudre(chemin);
      if (!r.ecriture) throw new AccesRefuse("Ce dossier est en lecture seule pour ce rôle", "lecture_seule");
      try { await client.ecrireTexte(r.noeud, r.rel, texte); }
      catch (e) {
        if (e.status !== 404) throw e;
        // 404 à l'écriture : partage retiré, ou dossier accessible mais écriture refusée (relevé réel sur un dossier en lecture)
        if (!(await client.existe(r.noeud))) throw new AccesRetire();
        throw new AccesRefuse("Écriture refusée par OneDrive", "ecriture_refusee");
      }
      if (cache) { cache.ecrire("tx:" + chemin, texte); cache.retirerPrefixe("ls:"); }
    },

    /** Supprime un fichier (corbeille OneDrive). */
    async supprimer(chemin) {
      const r = resoudre(chemin);
      if (!r.ecriture) throw new AccesRefuse("Ce dossier est en lecture seule pour ce rôle", "lecture_seule");
      const fait = await client.supprimer(r.noeud, r.rel);
      if (!fait && !(await client.existe(r.noeud))) throw new AccesRetire();
      if (cache) { cache.retirer("tx:" + chemin); cache.retirerPrefixe("ls:"); }
    },

    /** Dossier d'une collection du profil, tel que le dépôt le résout. */
    dossierCollection(col) { return col.dossier; },
    jointure
  };
}
