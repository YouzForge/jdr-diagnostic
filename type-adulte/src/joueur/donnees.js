// Accès aux données de l'application « joueur » : fiche, sac, savoirs, quêtes, journal, rencontres, notes, carte, recherche.
// Tout passe par le dépôt du moteur (copie hors ligne, accès contrôlé) ; aucun navigateur ici, donc tout se teste dans Node avec un faux OneDrive.
//
// Deux façons d'ouvrir : un JOUEUR lit son dossier (racine « joueur ») et la table ; le MJ, pour « voir comme un joueur », lit
// `Joueurs/<pseudo>` dans son propre OneDrive. Dans les deux cas l'application ne demande que des chemins relatifs au dossier du joueur.
import { pool } from "../graph/pool.js";
import { lireFiche } from "./fiche.js";
import { lireElement, lireObjet, lireRencontre, lireEtiquettes, lireRecit, cleCible, clesDe } from "./cartes.js";
import { entreeIndex } from "./recherche.js";

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

export function creerDonneesJoueur({ profil, depot, role, pseudo }) {
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
  async function dossier(chemin, lecteur, { sousDossier = "" } = {}) {
    if (!chemin) return { items: [], perime: false };
    const ls = await lister(chemin);
    let perime = ls.perime;
    const noms = ls.fichiers.filter(f => !f.dir && MARKDOWN.test(f.name)).map(f => f.name).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    const items = (await pool(noms, async nom => {
      const r = await lire(`${chemin}/${nom}`);
      if (r.perime) perime = true;
      return r.texte == null ? null : lecteur(r.texte, nom, sousDossier);
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

    savoirs: () => dossier(dossiers.savoirs && dansJoueur(dossiers.savoirs), lireElement),
    quetes: () => dossier(dossiers.quetes && dansJoueur(dossiers.quetes), lireElement),
    notes: () => dossier(dossiers.notes && dansJoueur(dossiers.notes), lireElement),
    notesDeJournal: () => dossier(dossiers.journal && dansJoueur(dossiers.journal), lireElement),
    rencontres: () => dossier(dossiers.rencontres && dansJoueur(dossiers.rencontres), lireRencontre),
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
      const racine = await dossier(dansJoueur(base), (t, nom) => lireObjet(t, nom, ""));
      perime = perime || racine.perime;
      const objets = [...racine.items];
      for (const d of sous) {
        const r = await dossier(`${dansJoueur(base)}/${d}`, (t, nom) => lireObjet(t, nom, d), { sousDossier: d });
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
    /** Étiquettes du joueur pour un élément (l'élément lui-même ou un nom de fichier) : le fichier peut désigner l'élément par son fichier, son nom sans numéro ou son titre. */
    etiquettesDe(map, e) {
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
    }
  };
  return api;
}
