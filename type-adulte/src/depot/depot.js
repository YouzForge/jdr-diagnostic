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

/**
 * Nom d'un dossier du sac du joueur : 1 à 60 caractères, sans caractère interdit par OneDrive, sans espace ni point en bout,
 * jamais un nom réservé (« 00_… », marqueur) ni « Non classé » (c'est le libellé des objets sans dossier).
 */
export function verifierNomDossier(nom) {
  const n = String(nom ?? "");
  if (!n || n.length > 60) throw new AccesRefuse("Le nom d'un dossier fait de 1 à 60 caractères", "nom_invalide");
  if (n !== n.trim() || /[\\/:?*"<>|\u0000-\u001f]/.test(n) || /\.$/.test(n) || n === "." || n === "..") throw new AccesRefuse("Nom de dossier refusé", "nom_invalide");
  if (/^00_/.test(n) || n === NOM_MARQUEUR) throw new AccesRefuse("Nom réservé", "nom_reserve");
  if (n.normalize("NFC").toLowerCase() === "non classé") throw new AccesRefuse("« Non classé » est réservé aux objets sans dossier", "nom_reserve");
  return n;
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

  /** Dossier des photos du profil (module « photos » actif), sinon null. */
  const dossierPhotos = () => { const m = profil.modules && profil.modules.photos; return m && m.actif !== false ? String(m.dossier || "08_Photos") : null; };

  const hors = e => !e.status || e.status >= 500;
  const sceller = (k, v) => { if (cache) cache.ecrire(k, v); };
  /** Une liste lue sur le réseau fait foi : les copies de fichiers et de sous-dossiers qui n'y figurent plus (supprimés ailleurs) sont effacées de l'appareil. */
  const elaguer = (chemin, liste) => {
    if (!cache || typeof cache.cles !== "function") return;
    const fichiers = new Set(liste.filter(x => !x.dir).map(x => x.name)), dossiers = new Set(liste.filter(x => x.dir).map(x => x.name));
    for (const pre of ["tx:", "sg:", "ls:"]) {
      const tete = pre + chemin + "/";
      for (const k of cache.cles(tete)) {
        const reste = k.slice(tete.length), i = reste.indexOf("/");
        if (i < 0 ? !(fichiers.has(reste) || (pre === "ls:" && dossiers.has(reste))) : !dossiers.has(reste.slice(0, i))) cache.retirer(k);
      }
    }
  };
  /**
   * Signature d'un élément d'un listing : la version OneDrive (eTag) si elle est donnée, sinon date de modification + taille. Elle change quand le
   * contenu change ; deux fichiers de même signature n'ont pas besoin d'être relus.
   */
  const signature = x => x.etag || (x.modifie ? x.modifie + "|" + (x.size || 0) : "");

  /**
   * Où et si l'on a le droit d'ÉCRIRE ce chemin (D30). Toutes les écritures passent ici, avant tout appel à OneDrive.
   *  - interrupteur du JDR éteint → rien ;
   *  - uniquement des fichiers « .md », jamais un nom réservé (« 00_… » : modèles, marqueur) à aucun niveau du chemin ;
   *  - MJ : le coffre, la table, et le dossier d'un joueur EXISTANT ;
   *  - joueur : son propre dossier seulement ; coffre, table et dossiers des autres sont refusés ;
   *  - JDR « unique » : tout le dossier du JDR, pour le MJ comme pour les joueurs.
   */
  const exigerEcriture = () => { if (ecriture !== true) throw new AccesRefuse("L'écriture est désactivée pour ce JDR", "ecriture_desactivee"); };
  async function resoudreEcriture(chemin, { photo = false } = {}) {
    exigerEcriture();
    chemin = cheminSur(chemin);
    const segs = chemin.split("/").filter(Boolean);
    if (!segs.length) throw new AccesRefuse("Chemin vide", "vide");
    if (segs.some(sg => /^00_/.test(sg) || sg === NOM_MARQUEUR)) throw new AccesRefuse("Nom réservé", "nom_reserve");
    if (photo) {   // une photo : uniquement dans le dossier des photos du profil, JDR « unique », image courante, un niveau sous le dossier
      const dossier = dossierPhotos();
      if (!dossier) throw new AccesRefuse("Les photos ne sont pas activées pour ce JDR", "photos_desactivees");
      if (separe) throw new AccesRefuse("Les photos ne s'écrivent que dans un JDR à dossier unique", "photos_mode_separe");
      if (segs.length !== 2 || segs[0] !== dossier || !/^[A-Za-z0-9_.-]+\.(jpe?g|png|webp)$/i.test(segs[1])) throw new AccesRefuse("Une photo se range dans « " + dossier + " », en .jpg, .png ou .webp", "type_refuse");
    } else if (!/\.md$/i.test(segs[segs.length - 1]) || segs[segs.length - 1].length < 4) throw new AccesRefuse("Seuls les fichiers Markdown (.md) s'écrivent", "type_refuse");
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

  /** Dossier « Inventaire » du joueur d'après le profil (`joueur_modele.dossiers`), sinon null. */
  const dossierSac = () => { const d = ((profil.joueur_modele || {}).dossiers || []).find(x => x && x.id === "inventaire"); return d && d.dossier ? cheminSur(String(d.dossier)) : null; };
  /** Périmètre des opérations sur les dossiers du sac (voir plus bas). Tous les refus se font AVANT d'interroger OneDrive. */
  function resoudreDossierSac(chemin) {
    exigerEcriture();
    if (role !== "joueur") throw new AccesRefuse("Les dossiers du sac ne s'écrivent que depuis le compte du joueur", "dossier_joueur_seulement");
    const base = dossierSac();
    if (!base) throw new AccesRefuse("Ce JDR n'a pas de sac", "sac_absent");
    chemin = cheminSur(chemin);
    const segs = chemin.split("/").filter(Boolean), segsBase = base.split("/");
    if (segs.length !== segsBase.length + 1 || segsBase.some((x, i) => segs[i] !== x)) throw new AccesRefuse("Hors du sac du joueur", "hors_perimetre");
    verifierNomDossier(segs[segs.length - 1]);
    const noeud = separe ? racines.joueur : racines.unique;
    if (!noeud) throw new AccesRefuse("Dossier du joueur non configuré", "racine_absente");
    return { noeud, rel: chemin, chemin };
  }

  const TAILLE_MAX_OCTETS = 1000000;
  const TAILLE_MAX_PHOTO = 8000000;
  function verifierTexte(texte) {
    if (typeof texte !== "string") throw new TypeError("Texte attendu");
    if (new TextEncoder().encode(texte).length > TAILLE_MAX_OCTETS) throw new AccesRefuse("Fichier trop volumineux", "trop_gros");
  }
  // Après une écriture, seule la liste du dossier parent n'est plus fiable (le fichier y est nouveau, changé ou retiré) ; les autres listes gardent leur copie.
  const parent = chemin => chemin.split("/").slice(0, -1).join("/");
  const apresEcriture = (chemin, texte) => { if (cache) { cache.ecrire("tx:" + chemin, texte); cache.retirer("sg:" + chemin); cache.retirer("ls:" + parent(chemin)); } };

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
          if (cache) { sceller(k, []); }
          return { donnees: [], perime: false, absent: true };
        }
        const donnees = l.map(x => ({ name: x.name, dir: x.dir, size: x.size, sig: signature(x) }));
        sceller(k, donnees);
        elaguer(chemin, donnees);
        return { donnees, perime: false, absent: false };
      } catch (e) {
        const c = cache && hors(e) ? cache.lire(k) : null;
        if (c) return { donnees: c, perime: true, absent: false };
        throw e;
      }
    },

    /**
     * Texte d'un fichier. → { texte, perime } (texte = null s'il n'existe pas).
     * `sig` : la signature de ce fichier dans un listing que l'on vient de lire SUR LE RÉSEAU (jamais celle d'une copie) ; si la copie locale du texte
     * a été lue avec cette même signature, le fichier n'a pas changé et n'est pas retéléchargé.
     */
    async lire(chemin, { sig = "" } = {}) {
      const { noeud, rel } = resoudre(chemin);
      const k = "tx:" + chemin, ks = "sg:" + chemin;
      if (sig && cache) {
        const t = cache.lire(k);
        if (t != null && cache.lire(ks) === sig) return { texte: t, perime: false };
      }
      try {
        const t = await client.lireTexte(noeud, rel);
        if (t === null && !(await client.existe(noeud))) throw new AccesRetire();
        if (t !== null) { sceller(k, t); if (sig) sceller(ks, sig); else if (cache) cache.retirer(ks); }
        else if (cache) { cache.retirer(k); cache.retirer(ks); }   // le fichier n'existe plus : sa copie ne doit pas ressusciter
        return { texte: t, perime: false };
      } catch (e) {
        const c = cache && hors(e) ? cache.lire(k) : null;
        if (c != null) return { texte: c, perime: true };
        throw e;
      }
    },

    /**
     * Lectures de la COPIE LOCALE seule, sans réseau (affichage immédiat, puis revalidation par `lister` / `lire`). Les mêmes refus d'accès que la lecture normale
     * s'appliquent. → le contenu, ou `null` s'il n'y a pas de copie.
     */
    listerCopie(chemin) { resoudre(chemin); return cache ? cache.lire("ls:" + chemin) : null; },
    lireCopie(chemin) { resoudre(chemin); return cache ? cache.lire("tx:" + chemin) : null; },
    /** Efface toute copie locale (accès retiré : jamais de copie d'un dossier dont l'accès est coupé). */
    oublierCopies() { if (cache) { cache.retirer("racines"); cache.retirer("memoire_ok"); for (const p of ["ls:", "tx:", "sg:"]) cache.retirerPrefixe(p); } },

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
      if (cache) { cache.retirer("tx:" + chemin); cache.retirer("sg:" + chemin); cache.retirer("ls:" + parent(chemin)); }
    },

    /**
     * Dossiers du sac (créer, renommer, supprimer s'il est vide) : uniquement un sous-dossier direct du dossier « Inventaire » du joueur,
     * depuis le compte du joueur (jamais depuis le MJ, qui voit sans écrire). Mêmes refus que les fichiers : interrupteur, nom réservé, hors périmètre.
     */
    async creerDossier(chemin) {
      const r = resoudreDossierSac(chemin);
      const res = await proteger(r, () => client.creerDossier(r.noeud, r.rel));
      if (cache) cache.retirer("ls:" + parent(chemin));
      return res;
    },
    async renommerDossier(chemin, nouveauNom) {
      const r = resoudreDossierSac(chemin);
      verifierNomDossier(nouveauNom);
      const res = await proteger(r, () => client.renommer(r.noeud, r.rel, nouveauNom));
      if (cache) { cache.retirer("ls:" + parent(chemin)); cache.retirer("ls:" + chemin); for (const p of ["ls:", "tx:", "sg:"]) cache.retirerPrefixe(p + chemin + "/"); }
      return res;
    },
    /** Supprime un dossier du sac SEULEMENT s'il est vide (corbeille OneDrive). L'appelant demande confirmation AVANT. */
    async supprimerDossierVide(chemin) {
      const r = resoudreDossierSac(chemin);
      const contenu = await client.lister(r.noeud, r.rel);
      if (contenu === null) { if (!(await client.existe(r.noeud))) throw new AccesRetire(); return false; }   // déjà supprimé
      if (contenu.length) throw new AccesRefuse("Ce dossier n'est pas vide", "dossier_non_vide");
      const info = await client.infos(r.noeud, r.rel);
      const fait = await proteger(r, () => client.supprimer(r.noeud, r.rel, info && info.etag ? { etag: info.etag } : {}));
      if (cache) { cache.retirer("ls:" + parent(chemin)); cache.retirer("ls:" + chemin); }
      return fait;
    },

    /** Image d'un fichier (lecture). → { blob } ou `null` ; jamais servie hors ligne (les photos ne sont pas gardées dans la copie locale). */
    async lireImage(chemin) {
      const { noeud, rel } = resoudre(chemin);
      if (!/\.(jpe?g|png|webp)$/i.test(rel)) throw new AccesRefuse("Seules les images .jpg, .png et .webp se lisent ainsi", "type_refuse");
      const blob = await client.lireOctets(noeud, rel);
      if (blob === null && !(await client.existe(noeud))) throw new AccesRetire();
      return blob === null ? null : { blob };
    },

    /** Range une photo NOUVELLE (jamais d'écrasement), taille limitée. → { etag } */
    async ajouterPhoto(chemin, blob) {
      const r = await resoudreEcriture(chemin, { photo: true });
      if (!blob || typeof blob.size !== "number" || blob.size < 1) throw new TypeError("Image vide");
      if (blob.size > TAILLE_MAX_PHOTO) throw new AccesRefuse("Photo trop volumineuse", "trop_gros");
      if (!/^image\/(jpeg|png|webp)$/.test(blob.type || "")) throw new AccesRefuse("Type d'image non accepté", "type_refuse");
      return proteger(r, () => client.creerOctets(r.noeud, r.rel, blob, blob.type));
    },

    /** Supprime une photo (corbeille OneDrive, récupérable 93 jours) ; mêmes garde-fous que le rangement d'une photo. L'appelant demande confirmation AVANT. */
    async supprimerPhoto(chemin) {
      const r = await resoudreEcriture(chemin, { photo: true });
      const info = await client.infos(r.noeud, r.rel);
      if (!info) return false;                         // déjà supprimée
      if (info.dir || !info.etag) throw new AccesRefuse("Ce n'est pas une photo supprimable", "type_refuse");
      return proteger(r, async () => { await client.supprimer(r.noeud, r.rel, { etag: info.etag }); return true; });
    },

    /** Dossier d'une collection du profil, tel que le dépôt le résout. */
    dossierCollection(col) { return col.dossier; },
    jointure
  };
}
