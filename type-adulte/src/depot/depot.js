// Le dépôt : où se trouve chaque dossier du profil, et ce que le rôle connecté a le droit d'y faire.
//
//  - MJ (ou JDR « unique ») : une racine, le dossier complet du JDR sur son OneDrive ; tous les chemins du profil s'y appliquent.
//  - Joueur en mode séparé : DEUX racines partagées, `table` (lecture) et `joueur` (modification). Le coffre n'existe pas pour lui :
//    toute tentative d'y accéder est refusée ICI, avant même d'interroger OneDrive (seconde ligne de défense ; la première reste OneDrive).
import { cheminSur, ConflitEcriture } from "../graph/client.js";
import { NOM_MARQUEUR, PSEUDO } from "../racines/marqueur.js";

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
 * @param {boolean} [o.ecriture]  interrupteur d'écriture du JDR (D30, R8) : FAUX par défaut ; tant qu'il n'est pas explicitement vrai, aucune écriture n'est possible
 */
export function creerDepot({ client, profil, role, racines, cache = null, ecriture = false }) {
  const sec = profil.securite || {};
  const separe = sec.mode === "separe";
  if (role !== "mj" && role !== "joueur") throw new TypeError("Rôle inconnu : " + role);

  /** Résout un chemin du profil (« MJ/01_Univers/Lieux », « Table/Resumes », « Inventaire ») en { noeud, rel } pour la LECTURE. L'écriture a ses propres règles (`resoudreEcriture`). */
  function resoudre(chemin) {
    chemin = cheminSur(chemin);
    if (!chemin) throw new AccesRefuse("Chemin vide", "vide");
    if (!separe) {
      const noeud = role === "mj" ? racines.jdr : racines.unique;
      if (!noeud) throw new AccesRefuse("Dossier du JDR non configuré", "racine_absente");
      return { noeud, rel: chemin };
    }
    if (role === "mj") {
      if (!racines.jdr) throw new AccesRefuse("Dossier du JDR non configuré", "racine_absente");
      return { noeud: racines.jdr, rel: chemin };
    }
    // joueur, mode séparé
    const tete = premier(chemin);
    if (tete === sec.coffre) throw new AccesRefuse("Le coffre du MJ n'est pas accessible aux joueurs", "coffre");
    if (tete === sec.table) {
      if (!racines.table) throw new AccesRefuse("Dossier de la table non configuré", "racine_absente");
      return { noeud: racines.table, rel: sansPremier(chemin) };
    }
    if (tete === sec.joueurs) throw new AccesRefuse("Le dossier des joueurs n'est pas accessible tel quel : utiliser le dossier du joueur connecté", "joueurs");
    if (!racines.joueur) throw new AccesRefuse("Dossier du joueur non configuré", "racine_absente");
    return { noeud: racines.joueur, rel: chemin };   // chemin relatif au dossier du joueur
  }

  const hors = e => !e.status || e.status >= 500;
  const sceller = (k, v) => { if (cache) cache.ecrire(k, v); };

  /**
   * Où et si l'on a le droit d'ÉCRIRE ce chemin (D30). Toutes les écritures passent ici, avant tout appel à OneDrive.
   *  - interrupteur du JDR éteint → rien ;
   *  - uniquement des fichiers « .md », jamais un nom réservé (« 00_… » : modèles, marqueur) à aucun niveau du chemin ;
   *  - MJ : le coffre, la table, et le dossier d'un joueur EXISTANT ;
   *  - joueur : son propre dossier seulement ; coffre, table et dossiers des autres sont refusés ;
   *  - JDR « unique » : tout le dossier du JDR, pour le MJ comme pour les joueurs.
   */
  async function resoudreEcriture(chemin) {
    if (ecriture !== true) throw new AccesRefuse("L'écriture est désactivée pour ce JDR", "ecriture_desactivee");
    chemin = cheminSur(chemin);
    const segs = chemin.split("/").filter(Boolean);
    if (!segs.length) throw new AccesRefuse("Chemin vide", "vide");
    if (segs.some(sg => /^00_/.test(sg) || sg === NOM_MARQUEUR)) throw new AccesRefuse("Nom réservé", "nom_reserve");
    if (!/\.md$/i.test(segs[segs.length - 1]) || segs[segs.length - 1].length < 4) throw new AccesRefuse("Seuls les fichiers Markdown (.md) s'écrivent", "type_refuse");
    if (!separe) {   // JDR « unique » : un seul dossier lu et écrit par tout le monde, rien à protéger entre MJ et joueurs
      const noeud = role === "mj" ? racines.jdr : racines.unique;
      if (!noeud) throw new AccesRefuse("Dossier du JDR non configuré", "racine_absente");
      return { noeud, rel: chemin, chemin };
    }
    const tete = segs[0];
    if (role === "joueur") {
      if (tete === sec.coffre) throw new AccesRefuse("Le coffre du MJ n'est pas accessible aux joueurs", "coffre");
      if (tete === sec.table) throw new AccesRefuse("La table est en lecture seule pour un joueur", "lecture_seule");
      if (tete === sec.joueurs) throw new AccesRefuse("Le dossier des joueurs n'est pas accessible tel quel", "joueurs");
      if (!racines.joueur) throw new AccesRefuse("Dossier du joueur non configuré", "racine_absente");
      return { noeud: racines.joueur, rel: chemin, chemin };
    }
    if (!racines.jdr) throw new AccesRefuse("Dossier du JDR non configuré", "racine_absente");
    if (tete === sec.coffre) return { noeud: racines.jdr, rel: chemin, chemin };
    if (tete === sec.table) return { noeud: racines.jdr, rel: chemin, chemin };   // le MJ écrit directement dans la table (prototype ; une publication depuis le coffre viendra plus tard)
    if (tete === sec.joueurs) {
      if (segs.length < 3 || !PSEUDO.test(segs[1])) throw new AccesRefuse("Dossier de joueur invalide", "joueur_invalide");
      // ne jamais créer par erreur un dossier de joueur : il doit exister déjà
      const dossier = await client.infos(racines.jdr, segs.slice(0, 2).join("/"));
      if (!dossier || !dossier.dir) throw new AccesRefuse("Ce joueur n'a pas de dossier", "joueur_inconnu");
      return { noeud: racines.jdr, rel: chemin, chemin };
    }
    throw new AccesRefuse("Hors du périmètre d'écriture", "hors_perimetre");
  }

  const TAILLE_MAX_OCTETS = 1000000;
  function verifierTexte(texte) {
    if (typeof texte !== "string") throw new TypeError("Texte attendu");
    if (new TextEncoder().encode(texte).length > TAILLE_MAX_OCTETS) throw new AccesRefuse("Fichier trop volumineux", "trop_gros");
  }
  const apresEcriture = (chemin, texte) => { if (cache) { cache.ecrire("tx:" + chemin, texte); cache.retirerPrefixe("ls:"); } };

  /** 404 à l'écriture : partage retiré, ou dossier accessible mais écriture refusée (relevé réel sur un dossier en lecture). */
  async function proteger(r, action) {
    try { return await action(); }
    catch (e) {
      // « fichier disparu » et « accès retiré » se ressemblent (404 des deux côtés) : on interroge le dossier lui-même
      if (e instanceof ConflitEcriture && e.raison === "disparue") {
        if (!(await client.existe(r.noeud))) throw new AccesRetire();
        throw e;
      }
      if (e.status !== 404) throw e;
      if (!(await client.existe(r.noeud))) throw new AccesRetire();
      throw new AccesRefuse("Écriture refusée par OneDrive", "ecriture_refusee");
    }
  }

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

    /**
     * Fiche + version pour modifier ou supprimer. → { texte, etag } ou `null` si absente. Jamais servie depuis la copie locale :
     * on ne prépare pas une modification sur un texte qui peut être périmé.
     */
    async lireFiche(chemin) {
      const { noeud, rel } = resoudre(chemin);
      const f = await client.lireFiche(noeud, rel);
      if (f === null && !(await client.existe(noeud))) throw new AccesRetire();
      return f;
    },

    /** Crée une fiche NOUVELLE (refuse si elle existe). → { etag } */
    async creer(chemin, texte) {
      const r = await resoudreEcriture(chemin, { creation: true });
      verifierTexte(texte);
      const res = await proteger(r, () => client.creerTexte(r.noeud, r.rel, texte));
      apresEcriture(chemin, texte);
      return res;
    },

    /** Remplace une fiche lue avec la version `etag`. Si elle a changé depuis : ConflitEcriture, rien n'est écrit. → { etag } */
    async modifier(chemin, texte, etag) {
      const r = await resoudreEcriture(chemin);
      verifierTexte(texte);
      if (typeof etag !== "string" || !etag) throw new TypeError("La version lue (etag) est obligatoire pour modifier");
      const res = await proteger(r, () => client.remplacerTexte(r.noeud, r.rel, texte, etag));
      apresEcriture(chemin, texte);
      return res;
    },

    /** Supprime une fiche lue avec la version `etag` (corbeille OneDrive). L'appelant demande confirmation à la personne AVANT. */
    async supprimer(chemin, etag) {
      const r = await resoudreEcriture(chemin);
      if (typeof etag !== "string" || !etag) throw new TypeError("La version lue (etag) est obligatoire pour supprimer");
      const fait = await proteger(r, () => client.supprimer(r.noeud, r.rel, { etag }));
      if (!fait && !(await client.existe(r.noeud))) throw new AccesRetire();
      if (cache) { cache.retirer("tx:" + chemin); cache.retirerPrefixe("ls:"); }
    },

    /** Dossier d'une collection du profil, tel que le dépôt le résout. */
    dossierCollection(col) { return col.dossier; },
    jointure
  };
}
