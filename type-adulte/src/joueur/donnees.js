// Accès aux données de l'application « joueur » : fiche, sac, savoirs, quêtes, journal, rencontres, notes, carte, recherche.
// Tout passe par le dépôt du moteur (copie hors ligne, accès contrôlé) ; aucun navigateur ici, donc tout se teste dans Node avec un faux OneDrive.
//
// Deux façons d'ouvrir : un JOUEUR lit son dossier (racine « joueur ») et la table ; le MJ, pour « voir comme un joueur », lit
// `Joueurs/<pseudo>` dans son propre OneDrive. Dans les deux cas l'application ne demande que des chemins relatifs au dossier du joueur.
import { pool } from "../graph/pool.js";
import { FicheExiste, ConflitEcriture } from "../graph/client.js";
import { AccesRefuse, AccesRetire } from "../depot/depot.js";
import { lireFiche } from "./fiche.js";
import { lireElement, lireObjet, lireRencontre, lireEtiquettes, lireRecit, cleCible, clesDe } from "./cartes.js";
import { entreeIndex } from "./recherche.js";
import { poserEtiquettes, texteNote, modifierNote, noteRencontre, changerBourse, changerPV, nomDeFichierNote } from "./ecriture.js";
import { norm } from "../md/doc.js";

const IMAGE = /\.(jpe?g|png|webp)$/i;
const MARKDOWN = /^(?!00_|LISEZMOI).+\.md$/i;
const NOM_ETIQUETTES = "Etiquettes.md";
const estAuth = e => e && (e.status === 401 || e.auth);

/** Noms de dossiers du dossier du joueur, d'après `profil.joueur_modele.dossiers` ; un dossier non déclaré donne `null` (écran vide, jamais une erreur). */
export function dossiersDuProfil(profil) {
  const jm = (profil && profil.joueur_modele) || {};
  const par = Object.fromEntries((jm.dossiers || []).map(d => [d.id, d.dossier]));
  return {
    fiche: jm.fichier_fiche || "Fiche.md",
    inventaire: par.inventaire || null, quetes: par.quetes || null, journal: par.journal || null,
    rencontres: par.rencontres || null, savoirs: par.savoirs || null, notes: par.notes || null,
    images: par.images || "Images",
    recits: tableDuProfil(profil, "resume"),
    cartes: (profil && profil.modules && profil.modules.carte && profil.modules.carte.dossier) || `${(profil && profil.securite && profil.securite.table) || "Table"}/Cartes`
  };
}
function tableDuProfil(profil, id) { const c = (profil.collections || []).find(x => x.id === id && x.zone === "table"); return c ? c.dossier : null; }

/** Dossiers dont le joueur modifie les fichiers (notes, notes de journal, notes de rencontre). */
const ZONES_EDITABLES = ["notes", "journal", "rencontres"];
const NOM_SIMPLE = /^(?!00_)[^/\\:?*"<>|\u0000-\u001f]{1,120}\.md$/i;

/**
 * `ecriture` : interrupteur d'écriture du JDR (faux par défaut). Seul le JOUEUR écrit, et seulement dans son dossier ; le MJ qui « voit comme »
 * un joueur lit sans jamais écrire (les actions refusent avec la raison `lecture_seule_mj`).
 */
export function creerDonneesJoueur({ profil, depot, role, pseudo, ecriture = false }) {
  if (role !== "joueur" && role !== "mj") throw new TypeError("Rôle inconnu : " + role);
  if (role === "mj" && !pseudo) throw new TypeError("Le MJ doit choisir un joueur à voir");
  const sec = profil.securite || {};
  const dossiers = dossiersDuProfil(profil);
  /** Chemin d'un élément du dossier du joueur. Le MJ passe par le dossier « Joueurs » de son OneDrive ; un joueur lit à la racine de son dossier partagé. */
  const dansJoueur = rel => (role === "mj" ? `${sec.joueurs || "Joueurs"}/${pseudo}/${rel}` : rel);

  async function lister(chemin) {
    const r = await depot.lister(chemin);
    return { fichiers: r.absent ? [] : r.donnees, perime: !!r.perime, absent: !!r.absent };
  }
  async function lire(chemin) { const r = await depot.lire(chemin); return { texte: r.texte, perime: !!r.perime }; }

  /** Lit tous les fichiers .md d'un dossier avec `lecteur(texte, nom)`. → { items, perime } ; dossier absent ou non déclaré = liste vide. */
  async function dossier(chemin, lecteur, { sousDossier = "", zone = "" } = {}) {
    if (!chemin) return { items: [], perime: false };
    const ls = await lister(chemin);
    let perime = ls.perime;
    const noms = ls.fichiers.filter(f => !f.dir && MARKDOWN.test(f.name)).map(f => f.name).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    const items = (await pool(noms, async nom => {
      const r = await lire(`${chemin}/${nom}`);
      if (r.perime) perime = true;
      return r.texte == null ? null : { ...lecteur(r.texte, nom, sousDossier), zone };
    }, 6)).filter(Boolean);
    return { items, perime };
  }

  const api = {
    profil, role, pseudo, dossiers, dansJoueur,

    async fiche() {
      const r = await lire(dansJoueur(dossiers.fiche));
      if (r.texte == null) return { fiche: null, perime: r.perime };
      return { fiche: lireFiche(r.texte, profil), perime: r.perime };
    },

    savoirs: () => dossier(dossiers.savoirs && dansJoueur(dossiers.savoirs), lireElement, { zone: "savoirs" }),
    quetes: () => dossier(dossiers.quetes && dansJoueur(dossiers.quetes), lireElement, { zone: "quetes" }),
    notes: () => dossier(dossiers.notes && dansJoueur(dossiers.notes), lireElement, { zone: "notes" }),
    notesDeJournal: () => dossier(dossiers.journal && dansJoueur(dossiers.journal), lireElement, { zone: "journal" }),
    rencontres: () => dossier(dossiers.rencontres && dansJoueur(dossiers.rencontres), lireRencontre, { zone: "rencontres" }),
    recits: () => dossier(dossiers.recits, lireRecit),

    /** Journal : un bloc par session, avec le récit du MJ (table, lecture seule) et les notes du joueur. → { sessions:[{session, titre, date, recit, notes:[]}], perime } */
    async journal() {
      const [r, n] = await Promise.all([api.recits(), api.notesDeJournal()]);
      const m = new Map();
      const bloc = s => { if (!m.has(s)) m.set(s, { session: s, titre: "", date: "", recit: null, notes: [] }); return m.get(s); };
      for (const x of r.items) { const b = bloc(x.session ?? 0); b.recit = x; b.titre = x.titre; b.date = x.date; }
      for (const x of n.items) { const b = bloc(x.session ?? 0); b.notes.push(x); if (!b.titre) b.titre = x.titre; }
      return { sessions: [...m.values()].sort((a, b) => b.session - a.session), perime: r.perime || n.perime };
    },

    /** Sac : les fichiers de chaque sous-dossier d'« Inventaire » (un dossier du joueur) et ceux de la racine (non classés). → { objets, dossiers:[noms], perime } */
    async sac() {
      const base = dossiers.inventaire;
      if (!base) return { objets: [], dossiers: [], perime: false };
      const ls = await lister(dansJoueur(base));
      let perime = ls.perime;
      const sous = ls.fichiers.filter(f => f.dir).map(f => f.name).sort((a, b) => a.localeCompare(b, "fr"));
      const racine = await dossier(dansJoueur(base), (t, nom) => lireObjet(t, nom, ""), { zone: "sac" });
      perime = perime || racine.perime;
      const objets = [...racine.items];
      for (const d of sous) {
        const r = await dossier(`${dansJoueur(base)}/${d}`, (t, nom) => lireObjet(t, nom, d), { sousDossier: d, zone: "sac" });
        perime = perime || r.perime;
        objets.push(...r.items);
      }
      return { objets, dossiers: sous, perime };
    },

    /** Étiquettes posées par le joueur (fichier « Etiquettes.md » de son dossier) : Map(cible normalisée → [étiquettes]). Absent = aucune. */
    async etiquettes() {
      const r = await lire(dansJoueur(NOM_ETIQUETTES));
      return { map: r.texte == null ? new Map() : lireEtiquettes(r.texte), perime: r.perime };
    },
    /**
     * Étiquettes du joueur pour un élément (l'élément lui-même ou un nom de fichier). Une ligne « - zone/fichier » (écrite par l'application) ne vaut que pour
     * cette zone ; une ligne sans zone (écrite à la main) vaut pour tout élément qu'elle désigne par son fichier, son nom sans numéro ou son titre.
     */
    etiquettesDe(map, e, zone = e && e.zone) {
      const fichier = typeof e === "string" ? e : e.fichier;
      if (zone) { const q = map.get(cleCible(`${zone}/${String(fichier).replace(/\.md$/i, "")}`)); if (q) return [...q]; }
      const cles = typeof e === "string" ? [cleCible(e)] : clesDe(e);
      return [...new Set(cles.flatMap(k => map.get(k) || []))];
    },

    /** Image du dossier du joueur ou de la table (chemin relatif au dossier du joueur, ou commençant par le nom du dossier de la table). → Blob ou null */
    async image(chemin) {
      if (!chemin || !IMAGE.test(chemin) || chemin.split("/").includes("..")) return null;
      const complet = chemin.startsWith(`${sec.table || "Table"}/`) ? chemin : dansJoueur(chemin.startsWith(`${dossiers.images}/`) ? chemin : `${dossiers.images}/${chemin}`);
      const r = await depot.lireImage(complet);
      return r ? r.blob : null;
    },

    /** Cartes du monde (images du dossier des cartes de la table). → { noms:[…], perime } */
    async cartes() {
      const ls = await lister(dossiers.cartes);
      return { noms: ls.fichiers.filter(f => !f.dir && IMAGE.test(f.name)).map(f => f.name).sort((a, b) => a.localeCompare(b, "fr")), perime: ls.perime };
    },
    cheminCarte: nom => `${dossiers.cartes}/${nom}`,

    /** Index de recherche sur tout ce qui est lisible. Un dossier illisible n'arrête pas la recherche (sauf 401 : reconnexion). */
    async index() {
      const sûr = async f => { try { return await f(); } catch (e) { if (estAuth(e)) throw e; return { items: [], objets: [], sessions: [], perime: true }; } };
      const [sv, qu, no, re, jo, sa, et] = await Promise.all([sûr(api.savoirs), sûr(api.quetes), sûr(api.notes), sûr(api.rencontres), sûr(api.journal), sûr(api.sac), sûr(api.etiquettes)]);
      const map = et.map || new Map();
      const tag = e => ({ etiquettes: api.etiquettesDe(map, e) });
      const index = [];
      for (const e of sv.items || []) index.push(entreeIndex("savoirs", e, tag(e)));
      for (const e of qu.items || []) index.push(entreeIndex("quetes", e, tag(e)));
      for (const e of no.items || []) index.push(entreeIndex("notes", e, tag(e)));
      for (const e of re.items || []) index.push(entreeIndex("rencontres", e, { ...tag(e), texte: [e.presentation, e.note].filter(Boolean).join("\n") || e.corps }));
      for (const s of jo.sessions || []) {
        if (s.recit) index.push(entreeIndex("journal", { ...s.recit, fichier: `recit:${s.recit.fichier}` }));
        for (const n of s.notes) index.push(entreeIndex("journal", { ...n, session: n.session ?? s.session }, tag(n)));
      }
      for (const o of sa.objets || []) index.push(entreeIndex("sac", o, { ...tag(o), texte: [o.dossier, o.corps].filter(Boolean).join("\n") }));
      return index;
    },

    /** Vrai seulement pour un joueur dans un JDR dont l'écriture est ouverte : l'interface masque les commandes d'écriture sinon. */
    peutEcrire: role === "joueur" && ecriture === true
  };

  // ---------------------------------------------------------------- Écriture (tranche 2)
  // Seul le JOUEUR écrit, dans son dossier, si l'interrupteur du JDR est ouvert. Toute modification relit le fichier juste avant (version/eTag)
  // et n'écrit que si rien n'a bougé ; un conflit est refusé (ConflitEcriture), jamais « le dernier gagne ».
  const refus = (m, r) => { throw new AccesRefuse(m, r); };
  const exigerEcriture = () => {
    if (role !== "joueur") refus("Le MJ voit comme un joueur sans écrire", "lecture_seule_mj");
    if (ecriture !== true) refus("L'écriture n'est pas activée pour ce JDR", "ecriture_desactivee");
  };
  const reessayable = e => e instanceof FicheExiste || (e instanceof ConflitEcriture && e.raison !== "disparue");
  /** Relit `chemin` (absent = `null`), calcule le nouveau texte et l'écrit avec la version lue ; un seul nouvel essai si le fichier a changé entre-temps (le calcul repart du texte frais). */
  async function surFichier(chemin, transformer, { creerSiAbsent = false } = {}) {
    for (let essai = 0; ; essai++) {
      const f = await depot.lireFiche(chemin);
      if (!f && !creerSiAbsent) throw new ConflitEcriture(chemin, "disparue");
      const nouveau = transformer(f ? f.texte : null);
      if (nouveau == null || (f && nouveau === f.texte)) return { inchange: true, etag: f ? f.etag : null };
      try { return f ? await depot.modifier(chemin, nouveau, f.etag) : await depot.creer(chemin, nouveau); }
      catch (e) { if (essai === 0 && reessayable(e)) continue; throw e; }
    }
  }
  const cheminZone = zone => {
    const d = dossiers[zone === "journal" ? "journal" : zone];
    if (!d) refus("Dossier non prévu par ce JDR", "zone_absente");
    return d;
  };
  const sansMd = f => String(f).replace(/\.md$/i, "");
  const ZONES_ETIQUETTES = ["savoirs", "quetes", "notes", "rencontres", "journal", "sac"];

  Object.assign(api, {
    /** Pose (ou retire, liste vide) les étiquettes d'un élément : `el` = { zone, fichier, titre? } tel que lu. */
    async poserEtiquettes(el, liste) {
      exigerEcriture();
      if (!el || !ZONES_ETIQUETTES.includes(el.zone) || typeof el.fichier !== "string" || !el.fichier) refus("Élément non étiquetable", "zone_refusee");
      const cible = `${el.zone}/${sansMd(el.fichier)}`;
      const anciennes = [...new Set([sansMd(el.fichier), sansMd(el.fichier).replace(/^\d+[_\- ]+/, ""), el.titre || ""].filter(Boolean))];
      return surFichier(NOM_ETIQUETTES, t => {
        if (t == null && !(liste || []).length) return null;
        let n = poserEtiquettes(t, cible, liste);
        for (const k of anciennes) { try { n = poserEtiquettes(n, k, []); } catch (e) { /* désignation qui ne peut pas être une ligne : rien à retirer */ } }   // l'ancienne ligne sans zone est remplacée par la ligne qualifiée
        return n;
      }, { creerSiAbsent: true });
    },

    /** Points de vie : entier de 0 au maximum de la fiche. */
    async changerPV(pv) {
      exigerEcriture();
      return surFichier(dossiers.fiche, t => changerPV(t, pv, { max: lireFiche(t, profil).pvMax }));
    },
    /** Bourse : une ligne de texte libre ; vide = effacée. */
    async changerBourse(bourse) {
      exigerEcriture();
      return surFichier(dossiers.fiche, t => changerBourse(t, bourse));
    },

    /**
     * Ouvre une note pour la modifier : { zone, fichier, texte, etag, element }. Lecture fraîche (jamais la copie locale). `zone` : notes, journal ou rencontres.
     */
    async ouvrirNote(zone, fichier) {
      exigerEcriture();
      if (!ZONES_EDITABLES.includes(zone) || !NOM_SIMPLE.test(fichier)) refus("Cette note ne se modifie pas ici", "zone_refusee");
      const f = await depot.lireFiche(`${cheminZone(zone)}/${fichier}`);
      if (!f) throw new ConflitEcriture(`${cheminZone(zone)}/${fichier}`, "disparue");
      return { zone, fichier, texte: f.texte, etag: f.etag, element: zone === "rencontres" ? lireRencontre(f.texte, fichier) : lireElement(f.texte, fichier) };
    },
    /** Enregistre une note ouverte. Note libre / de journal : { titre, corps, epingle } ; rencontre : { note }. Version de l'ouverture exigée. */
    async enregistrerNote(h, changes) {
      exigerEcriture();
      if (!h || !ZONES_EDITABLES.includes(h.zone) || !NOM_SIMPLE.test(h.fichier)) refus("Cette note ne se modifie pas ici", "zone_refusee");
      const chemin = `${cheminZone(h.zone)}/${h.fichier}`;
      const nouveau = h.zone === "rencontres" ? noteRencontre(h.texte, changes.note ?? "") : modifierNote(h.texte, changes, h.element.titre);
      if (nouveau === h.texte) return { inchange: true, etag: h.etag };
      return depot.modifier(chemin, nouveau, h.etag);
    },
    /** Supprime une note ouverte (corbeille OneDrive). Pas pour les rencontres (écrites par le MJ). La confirmation est demandée AVANT par l'interface. */
    async supprimerNote(h) {
      exigerEcriture();
      if (!h || !["notes", "journal"].includes(h.zone) || !NOM_SIMPLE.test(h.fichier)) refus("Cette note ne se supprime pas ici", "zone_refusee");
      return depot.supprimer(`${cheminZone(h.zone)}/${h.fichier}`, h.etag);
    },
    /** Crée une note libre (zone « notes ») ou de journal (zone « journal », avec `session`). Jamais d'écrasement : le nom est choisi libre. → { fichier, etag } */
    async creerNote(zone, { titre, corps = "", session = null, epingle = false, date = "" } = {}) {
      exigerEcriture();
      if (!["notes", "journal"].includes(zone)) refus("Création non prévue ici", "zone_refusee");
      const dos = cheminZone(zone);
      const texte = texteNote({ titre, corps, session: zone === "journal" ? session : null, epingle, date });
      for (let essai = 0; ; essai++) {
        const ls = await lister(dos);
        const nom = nomDeFichierNote(titre, ls.fichiers.map(f => f.name), zone === "journal" && session != null ? `Session ${session}` : "");
        try { const r = await depot.creer(`${dos}/${nom}`, texte); return { fichier: nom, etag: r.etag }; }
        catch (e) { if (essai === 0 && e instanceof FicheExiste) continue; throw e; }
      }
    },

    /** Dossiers du sac : un seul niveau sous « Inventaire ». */
    async creerDossierSac(nom) { exigerEcriture(); return depot.creerDossier(`${dossiers.inventaire}/${nom}`); },
    async renommerDossierSac(nom, nouveau) { exigerEcriture(); return depot.renommerDossier(`${dossiers.inventaire}/${nom}`, nouveau); },
    async supprimerDossierSac(nom) { exigerEcriture(); return depot.supprimerDossierVide(`${dossiers.inventaire}/${nom}`); },
    /**
     * Range un objet dans un autre dossier du sac (« » = non classé) : copie dans le dossier visé (refusée si le nom y existe), puis retrait de l'ancien
     * emplacement avec la version lue. Si le retrait échoue, la copie est retirée : jamais deux exemplaires.
     */
    async deplacerObjet(objet, versDossier) {
      exigerEcriture();
      if (!objet || !NOM_SIMPLE.test(objet.fichier)) refus("Objet non déplaçable", "zone_refusee");
      if ((objet.dossier || "") === (versDossier || "")) return { inchange: true };
      const base = dossiers.inventaire;
      const src = `${base}${objet.dossier ? "/" + objet.dossier : ""}/${objet.fichier}`;
      const dst = `${base}${versDossier ? "/" + versDossier : ""}/${objet.fichier}`;
      const f = await depot.lireFiche(src);
      if (!f) throw new ConflitEcriture(src, "disparue");
      const copie = await depot.creer(dst, f.texte);
      try { await depot.supprimer(src, f.etag); }
      catch (e) { try { await depot.supprimer(dst, copie.etag); } catch (_) { /* la copie reste : l'erreur d'origine est celle qu'on rend */ } throw e; }
      return { fichier: objet.fichier, dossier: versDossier || "" };
    },
    /** Retire un objet du sac (corbeille OneDrive). Confirmation demandée AVANT par l'interface. */
    async retirerObjet(objet) {
      exigerEcriture();
      if (!objet || !NOM_SIMPLE.test(objet.fichier)) refus("Objet non retirable", "zone_refusee");
      const chemin = `${dossiers.inventaire}${objet.dossier ? "/" + objet.dossier : ""}/${objet.fichier}`;
      const f = await depot.lireFiche(chemin);
      if (!f) return false;
      await depot.supprimer(chemin, f.etag);
      return true;
    }
  });
  return api;
}
