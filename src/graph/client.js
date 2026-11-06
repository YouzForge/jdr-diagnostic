// Client Microsoft Graph minimal pour le moteur. Aucune dépendance : `fetch`, `getToken` et `attendre` sont injectés
// (le navigateur donne les vrais ; les tests donnent un faux OneDrive).
//
// Un « nœud » désigne un dossier racine :
//   { path }              dossier du OneDrive du compte connecté ("" = racine de Mes fichiers)
//   { driveId, itemId }   dossier d'un autre OneDrive (dossier partagé, raccourci, lien de partage)
// Tous les chemins relatifs (`rel`) sont relatifs à ce nœud et ne peuvent jamais en sortir.

export const GRAPH = "https://graph.microsoft.com/v1.0";
const ORIGINE_GRAPH = new URL(GRAPH).origin;
const MAX_PAGES = 100;           // 100 pages de 200 = 20 000 éléments par dossier ; au-delà on refuse plutôt que de tronquer en silence
const TAILLE_PAGE = 200;

export class ErreurGraph extends Error {
  constructor(message, status, extra = {}) { super(message); this.name = "ErreurGraph"; this.status = status; Object.assign(this, extra); }
}
export class CheminInvalide extends Error {
  constructor(rel) { super("Chemin refusé : " + JSON.stringify(rel)); this.name = "CheminInvalide"; this.rel = rel; }
}
/** On voulait créer un fichier qui existe déjà : rien n'est écrit (D30, R3). */
export class FicheExiste extends Error {
  constructor(rel) { super("Ce fichier existe déjà : " + JSON.stringify(rel)); this.name = "FicheExiste"; this.rel = rel; }
}
/** Le fichier a changé (ou disparu) depuis qu'on l'a lu : rien n'est écrit, il faut recharger (D30, jamais « le dernier gagne »). `raison` : « modifiee » ou « disparue ». */
export class ConflitEcriture extends Error {
  constructor(rel, raison = "modifiee") { super("Le fichier a changé depuis sa lecture : " + JSON.stringify(rel)); this.name = "ConflitEcriture"; this.rel = rel; this.raison = raison; }
}
/** Le fichier est ouvert ailleurs (OneDrive répond 423) : on réessaiera plus tard, rien n'est écrit. */
export class FicheVerrouillee extends Error {
  constructor(rel) { super("Le fichier est en cours d'utilisation : " + JSON.stringify(rel)); this.name = "FicheVerrouillee"; this.rel = rel; }
}

const encodeSegments = p => p.split("/").map(encodeURIComponent).join("/");

/** Normalise un chemin relatif et refuse tout ce qui pourrait sortir du dossier racine ou casser l'adresse Graph. */
export function cheminSur(rel) {
  rel = String(rel ?? "");
  if (rel === "") return "";
  if (/[\\:?*"<>|\u0000-\u001f]/.test(rel)) throw new CheminInvalide(rel);   // caractères interdits par OneDrive ; « # » et « % » restent permis (ils sont encodés dans l'adresse)
  const segs = rel.split("/").filter(s => s !== "");
  for (const s of segs) if (s === "." || s === ".." || /^\s|\s$|\.$/.test(s)) throw new CheminInvalide(rel);
  return segs.join("/");
}

export function validerNoeud(n) {
  const ok = n && typeof n === "object" && (
    (typeof n.driveId === "string" && n.driveId && typeof n.itemId === "string" && n.itemId && n.path === undefined) ||
    (typeof n.path === "string" && !n.driveId && !n.itemId));
  if (!ok) throw new TypeError("Nœud de dossier invalide");
  if (n.path) cheminSur(n.path);
  return n;
}

function urlDe(noeud, rel) {
  validerNoeud(noeud);
  rel = cheminSur(rel);
  if (noeud.driveId) {
    const base = `${GRAPH}/drives/${encodeURIComponent(noeud.driveId)}/items/${encodeURIComponent(noeud.itemId)}`;
    return rel ? `${base}:/${encodeSegments(rel)}:` : base;
  }
  const complet = [noeud.path ? cheminSur(noeud.path) : "", rel].filter(Boolean).join("/");
  return complet ? `${GRAPH}/me/drive/root:/${encodeSegments(complet)}:` : `${GRAPH}/me/drive/root`;
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

/**
 * @param {object} o
 * @param {Function} o.fetch      équivalent de window.fetch
 * @param {Function} o.getToken   async () => jeton ; lève une erreur avec .status = 401 si la reconnexion est nécessaire
 * @param {Function} [o.attendre] async (ms) => void  (remplaçable dans les tests)
 * @param {number}   [o.essais]   nombre total d'essais quand Microsoft répond 429 / 503 / 504
 */
/** Version (eTag) renvoyée par OneDrive après une écriture ; null si la réponse n'en donne pas. */
async function etagDe(reponse) {
  try { const j = await reponse.json(); return j && typeof j.eTag === "string" && j.eTag ? j.eTag : null; } catch { return null; }
}

const NOM_FICHIER_APP = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}\.json$/;

export function creerClientGraph({ fetch: fetchFn, getToken, attendre = dormir, essais = 3 }) {
  if (typeof fetchFn !== "function" || typeof getToken !== "function") throw new TypeError("fetch et getToken sont obligatoires");

  async function requete(url, opt = {}) {
    if (new URL(url).origin !== ORIGINE_GRAPH) throw new ErreurGraph("Adresse hors Microsoft Graph refusée", 0, { refus: true });
    let essai = 0;
    for (;;) {
      essai++;
      const jeton = await getToken();
      const r = await fetchFn(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + jeton } });
      if (r.ok) return r;
      if ([429, 503, 504].includes(r.status) && essai < essais) {
        const ra = Number(r.headers && r.headers.get && r.headers.get("Retry-After"));
        await attendre(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 * 2 ** (essai - 1), 30000));
        continue;
      }
      // Le code d'erreur Graph (« invalidRequest », « accessDenied »…) aide à comprendre un refus ; le message et l'adresse ne sont jamais gardés.
      let code = null;
      try { const j = await r.json(); const c = j && j.error && j.error.code; if (typeof c === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(c)) code = c; } catch { /* corps absent ou illisible */ }
      throw new ErreurGraph("OneDrive : erreur " + r.status, r.status, { code });
    }
  }

  /** Éléments d'une liste Graph, pages suivies jusqu'au bout. */
  async function toutesLesPages(urlDepart) {
    const out = [];
    let url = urlDepart, pages = 0;
    while (url) {
      if (++pages > MAX_PAGES) throw new ErreurGraph("Dossier trop volumineux (plus de " + MAX_PAGES * TAILLE_PAGE + " éléments)", 0, { tropGros: true });
      const j = await (await requete(url)).json();
      out.push(...(j.value || []));
      url = j["@odata.nextLink"] || null;     // l'adresse suivante est revérifiée par `requete` : le jeton ne part jamais ailleurs
    }
    return out;
  }

  const SELECT = "$select=id,name,size,folder,file,lastModifiedDateTime,parentReference,remoteItem";

  const api = {
    /** Contenu d'un dossier. → [{ name, dir, size, id, driveId, modifie, remote }] ; `null` si le dossier n'existe pas. */
    async lister(noeud, rel = "") {
      try {
        const items = await toutesLesPages(`${urlDe(noeud, rel)}/children?${SELECT}&$top=${TAILLE_PAGE}`);
        return items.map(x => {
          const ri = x.remoteItem;
          return {
            name: x.name, dir: !!(x.folder || (ri && ri.folder)), size: x.size || 0, id: x.id,
            driveId: (ri ? ri.parentReference && ri.parentReference.driveId : x.parentReference && x.parentReference.driveId) || null,
            idCible: ri ? ri.id : x.id, remote: !!ri, modifie: x.lastModifiedDateTime || null
          };
        });
      } catch (e) { if (e.status === 404) return null; throw e; }
    },

    /** Texte d'un fichier, ou `null` s'il n'existe pas. */
    async lireTexte(noeud, rel) {
      if (!cheminSur(rel)) throw new CheminInvalide(rel);
      try { return await (await requete(`${urlDe(noeud, rel)}/content`)).text(); }
      catch (e) { if (e.status === 404) return null; throw e; }
    },

    /** Petit fichier du dossier d'application du compte connecté (`/me/drive/special/approot`, créé par OneDrive au premier appel ; accessible avec
     *  `Files.ReadWrite`, documenté par Microsoft). Sert à retenir, côté OneDrive du joueur, OÙ sont ses dossiers partagés (identifiants, jamais de lien). */
    async lireFichierApp(nom) {
      if (!NOM_FICHIER_APP.test(nom)) throw new CheminInvalide(nom);
      try { return await (await requete(`${GRAPH}/me/drive/special/approot:/${nom}:/content`)).text(); }
      catch (e) { if (e.status === 404) return null; throw e; }
    },
    async ecrireFichierApp(nom, texte) {
      if (!NOM_FICHIER_APP.test(nom)) throw new CheminInvalide(nom);
      await requete(`${GRAPH}/me/drive/special/approot:/${nom}:/content`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: texte });
    },

    /**
     * Écriture SANS garde (écrase sans regarder). Réservée au diagnostic et à ses fichiers jetables : l'application et les formulaires
     * passent par `creerTexte` / `remplacerTexte` (un test le vérifie sur les sources).
     */
    async ecrireTexte(noeud, rel, texte) {
      if (!cheminSur(rel)) throw new CheminInvalide(rel);
      await requete(`${urlDe(noeud, rel)}/content`, { method: "PUT", headers: { "Content-Type": "text/markdown" }, body: texte });
    },

    /** Élément désigné : { id, etag, dir } ou `null` s'il n'existe pas (ou plus accessible : OneDrive répond 404 dans les deux cas). */
    async infos(noeud, rel = "") {
      cheminSur(rel);
      try {
        const j = await (await requete(`${urlDe(noeud, rel)}?$select=id,eTag,folder,file`)).json();
        return { id: j.id || null, etag: typeof j.eTag === "string" && j.eTag ? j.eTag : null, dir: !!j.folder };
      } catch (e) { if (e.status === 404) return null; throw e; }
    },

    /**
     * Fiche + sa version : { texte, etag } ou `null` si absente. La version (eTag) est lue AVANT le contenu : si le fichier change entre
     * les deux lectures, la version est plus ANCIENNE que le texte et l'écriture suivante sera refusée (conflit). Dans l'autre ordre,
     * on pourrait écraser une modification sans le savoir.
     */
    async lireFiche(noeud, rel) {
      if (!cheminSur(rel)) throw new CheminInvalide(rel);
      const info = await api.infos(noeud, rel);
      if (!info) return null;
      if (info.dir) throw new ErreurGraph("Ce n'est pas un fichier", 400, { code: "pasUnFichier" });
      if (!info.etag) throw new ErreurGraph("Version du fichier non fournie par OneDrive", 0, { sansVersion: true });
      const texte = await api.lireTexte(noeud, rel);
      if (texte === null) return null;
      return { texte, etag: info.etag };
    },

    /** Crée un fichier NOUVEAU. Refuse s'il existe déjà (vérification avant + `conflictBehavior=fail` demandé à OneDrive). → { etag } */
    async creerTexte(noeud, rel, texte) {
      if (!cheminSur(rel)) throw new CheminInvalide(rel);
      if (await api.infos(noeud, rel)) throw new FicheExiste(rel);
      try {
        const r = await requete(`${urlDe(noeud, rel)}/content?@microsoft.graph.conflictBehavior=fail`, { method: "PUT", headers: { "Content-Type": "text/markdown" }, body: texte });
        return { etag: await etagDe(r) };
      } catch (e) {
        if (e.status === 409 || e.status === 412) throw new FicheExiste(rel);
        if (e.status === 423) throw new FicheVerrouillee(rel);
        throw e;
      }
    },

    /** Remplace le contenu d'un fichier lu avec la version `etag`. Si la version a changé, ou si le fichier a disparu : ConflitEcriture, rien n'est écrit. → { etag } */
    async remplacerTexte(noeud, rel, texte, etag) {
      if (!cheminSur(rel)) throw new CheminInvalide(rel);
      if (typeof etag !== "string" || !etag) throw new TypeError("La version lue (etag) est obligatoire pour modifier un fichier");
      const actuel = await api.infos(noeud, rel);          // première ligne de défense : on compare juste avant d'écrire
      if (!actuel) throw new ConflitEcriture(rel, "disparue");
      if (actuel.etag !== etag) throw new ConflitEcriture(rel, "modifiee");
      try {                                                    // seconde ligne : OneDrive refuse lui-même si la version a changé entre-temps (HYPOTHÈSE à prouver sur le vrai OneDrive, voir 06_Cadrage_ecriture)
        const r = await requete(`${urlDe(noeud, rel)}/content`, { method: "PUT", headers: { "Content-Type": "text/markdown", "If-Match": etag }, body: texte });
        return { etag: await etagDe(r) };
      } catch (e) {
        if (e.status === 412) throw new ConflitEcriture(rel, "modifiee");
        if (e.status === 423) throw new FicheVerrouillee(rel);
        throw e;
      }
    },

    /**
     * Supprime un élément (corbeille OneDrive : 30 jours pour un compte personnel, 93 jours pour un compte professionnel ou scolaire).
     * → true si supprimé, false s'il était déjà absent. Avec `etag`, la suppression est refusée (ConflitEcriture) si le fichier a changé depuis sa lecture.
     * Attention : OneDrive répond aussi 404 quand l'accès a été retiré ; l'appelant doit alors vérifier le dossier lui-même (`existe`).
     */
    async supprimer(noeud, rel, { etag } = {}) {
      if (!cheminSur(rel)) throw new CheminInvalide(rel);
      if (etag) {                                                // même double garde que `remplacerTexte` : comparaison juste avant, puis If-Match
        const actuel = await api.infos(noeud, rel);
        if (!actuel) return false;
        if (actuel.etag !== etag) throw new ConflitEcriture(rel, "modifiee");
      }
      try { await requete(urlDe(noeud, rel), { method: "DELETE", ...(etag ? { headers: { "If-Match": etag } } : {}) }); return true; }
      catch (e) {
        if (e.status === 412) throw new ConflitEcriture(rel, "modifiee");
        if (e.status === 423) throw new FicheVerrouillee(rel);
        if (e.status !== 404) throw e;
        return false;
      }
    },

    /** Le dossier lui-même est-il accessible ? false = introuvable OU partage retiré (OneDrive répond 404 dans les deux cas). */
    async existe(noeud) {
      try { await requete(`${urlDe(noeud, "")}?$select=id`); return true; }
      catch (e) { if (e.status === 404) return false; throw e; }
    },

    /**
     * Dossier désigné par un lien de partage OneDrive. `Prefer: redeemSharingLink` demande à Microsoft un accès durable
     * (sinon le lien ne sert qu'à la requête en cours). → { driveId, itemId, name }.
     */
    async resoudreLien(lien) {
      lien = String(lien ?? "").trim();
      if (!/^https:\/\//i.test(lien)) throw new Error("Ce n'est pas un lien.");
      const octets = new TextEncoder().encode(lien);
      let bin = ""; for (const b of octets) bin += String.fromCharCode(b);
      const b64 = btoa(bin).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
      const r = await requete(`${GRAPH}/shares/u!${b64}/driveItem?$select=id,name,folder,parentReference,remoteItem`, { headers: { Prefer: "redeemSharingLink" } });
      const j = await r.json();
      const ri = j.remoteItem || j;
      const driveId = (ri.parentReference && ri.parentReference.driveId) || (j.parentReference && j.parentReference.driveId);
      const itemId = ri.id || j.id;
      if (!driveId || !itemId) throw new Error("Lien non reconnu.");
      if (!(ri.folder || j.folder)) throw new Error("Ce lien ne mène pas à un dossier.");
      // `parentId` : uniquement pour le diagnostic d'étanchéité (vérifier qu'il est INACCESSIBLE) ; l'application ne s'en sert jamais.
      return { driveId, itemId, name: j.name || ri.name || "", parentId: (j.parentReference && j.parentReference.id) || null };
    },

    /** Nombre d'éléments que ce compte voit à la racine du disque d'un autre compte (diagnostic : doit être 0). Relevé réel : 200 et liste vide. */
    async listerRacineDisque(driveId) {
      if (!/^[A-Za-z0-9!_-]+$/.test(String(driveId))) throw new TypeError("Identifiant de disque invalide");
      try { return (await toutesLesPages(`${GRAPH}/drives/${encodeURIComponent(driveId)}/root/children?$select=id,name&$top=${TAILLE_PAGE}`)).length; }
      catch (e) { if (e.status === 404 || e.status === 403) return 0; throw e; }
    },

    /**
     * « Partagés avec moi ». ATTENTION : cette API est dépréciée par Microsoft et cesse de renvoyer des données après
     * novembre 2026 ; elle peut déjà ne renvoyer qu'une partie des dossiers. À n'utiliser qu'en complément, jamais seule.
     */
    async partagesAvecMoi() {
      const items = await toutesLesPages(`${GRAPH}/me/drive/sharedWithMe?$top=${TAILLE_PAGE}`);
      return items.map(x => {
        const ri = x.remoteItem; const driveId = ri && ri.parentReference && ri.parentReference.driveId;
        return ri && ri.folder && driveId && ri.id ? { driveId, itemId: ri.id, name: x.name || ri.name || "" } : null;
      }).filter(Boolean);
    }
  };
  return api;
}
