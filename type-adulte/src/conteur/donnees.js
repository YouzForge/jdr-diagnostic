// Accès aux données d'un JDR conteur : collections, fiche du héros, journal. Tout passe par le dépôt du moteur (copie hors ligne,
// garde-fous d'écriture) ; aucun navigateur ici, donc tout se teste dans Node avec un dépôt de test.
import { pool } from "../graph/pool.js?v=0.17.0";
import { modifierFiche } from "../ecriture/fiche.js?v=0.17.0";
import { versElement, lireEtatHeros, estFicheHeros } from "./heros.js?v=0.17.0";
import { preparerCatalogue } from "./objets.js?v=0.17.0";
import { POTIONS_PAR_DEFAUT } from "./potions.js?v=0.17.0";
import { MAX_VOIES } from "./voies.js?v=0.17.0";

/** Fichiers qu'une collection n'affiche jamais : modèles « 00_… », LISEZMOI, et selon la collection les fichiers de service. */
const EXCLUS = {
  defaut: /^(00_|LISEZMOI)/i,
  histoire: /^(00_|LISEZMOI|Recap_)/i,            // les « Recap_ » attendent leur traitement : ils ne sont pas encore des histoires jouées
  personnage: /^(.*Fiche_Heroi(ne|s)|PNJ_Recurrents|00_|LISEZMOI)/i
};

/** Règles et réglages tirés du profil, avec les valeurs par défaut du conteur. */
export function reglesDuProfil(profil) {
  const m = profil.modules || {};
  const act = x => x && x.actif !== false;
  return {
    coeursDepart: act(m.coeurs) && Number.isInteger(m.coeurs.depart) ? m.coeurs.depart : 3,
    armureDepart: act(m.coeurs) && Number.isInteger(m.coeurs.armure_depart) ? m.coeurs.armure_depart : 0,
    maxVoies: m.voies && Number.isInteger(m.voies.max_par_tache) ? m.voies.max_par_tache : MAX_VOIES,
    seuilDe: m.des && Number.isInteger(m.des.seuil) ? m.des.seuil : 5,
    potions: m.potions && m.potions.catalogue ? m.potions.catalogue : POTIONS_PAR_DEFAUT,
    catalogue: preparerCatalogue(m.objets && m.objets.catalogue),
    piece: (m.pieces && m.pieces.nom) || "pièce",
    inbox: (m.notes_mj && m.notes_mj.inbox) || "06_Notes_MJ/Inbox_Idees.md",
    photos: (m.photos && m.photos.actif !== false && (m.photos.dossier || "08_Photos")) || null,
    modeleRecap: (m.recap && m.recap.modele) || null,
    compteRendu: (m.recap && m.recap.compte_rendu) || "histoire",
    titreSection: (m.jouer && m.jouer.titre_section) || "## Étapes de jeu",
    dossierJournal: (profil.heros && profil.heros.dossier_journal) || "05_Journal",
    dossierFiche: (profil.heros && profil.heros.dossier_fiche) || "03_Personnages"
  };
}

export function creerDonnees({ profil, depot, memoire = null }) {
  const regles = reglesDuProfil(profil);
  const colonne = id => { const c = profil.collections.find(x => x.id === id); if (!c) throw new Error("Collection inconnue : " + id); return c; };
  const exclus = col => EXCLUS[col.id] || EXCLUS.defaut;

  async function lister(dossier) {
    const r = await depot.lister(dossier);
    return { fichiers: r.absent ? [] : r.donnees, perime: !!r.perime, absent: !!r.absent };
  }
  async function lire(chemin) { const r = await depot.lire(chemin); return { texte: r.texte, perime: !!r.perime }; }

  return {
    profil, regles, depot, colonne, lister, lire,

    /** Tous les éléments d'une collection. → { items, perime } */
    async charger(id) {
      const col = colonne(id);
      const ls = await lister(col.dossier);
      const fichiers = ls.fichiers.filter(f => !f.dir && /\.md$/i.test(f.name) && !exclus(col).test(f.name)).sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
      let perime = ls.perime;
      const items = (await pool(fichiers, async f => {
        const r = await lire(`${col.dossier}/${f.name}`);
        if (r.perime) perime = true;
        return r.texte == null ? null : versElement(col, f.name, r.texte);
      }, 6)).filter(Boolean);
      return { items, perime };
    },

    async element(id, fichier) {
      const col = colonne(id);
      const r = await lire(`${col.dossier}/${fichier}`);
      if (r.texte == null) throw new Error("Fiche introuvable : " + fichier);
      return { item: versElement(col, fichier, r.texte), perime: r.perime };
    },

    /** Fiche du héros (fichier « …Fiche_Heroine.md » ou « …Fiche_Heros.md » dans le dossier des fiches). */
    async trouverFicheHeros() {
      const ls = await lister(regles.dossierFiche);
      const f = ls.fichiers.find(x => !x.dir && estFicheHeros(x.name));
      return f ? `${regles.dossierFiche}/${f.name}` : null;
    },

    /** État du héros (prénom, cœurs, armure, pièces, équipement, compagnons). */
    async etatHeros() {
      const vide = { prenom: "", coeurs: regles.coeursDepart, armure: regles.armureDepart, pieces: 0, equip: [], compagnons: [], perime: false, trouve: false, fichier: null };
      const fichier = await this.trouverFicheHeros();
      if (!fichier) return vide;
      const r = await lire(fichier);
      if (r.texte == null) return vide;
      const e = lireEtatHeros(r.texte, { regles: { coeurs_depart: regles.coeursDepart, armure_depart: regles.armureDepart }, catalogue: regles.catalogue });
      if (e.prenom && memoire) memoire.ecrire("prenom", e.prenom);
      let compagnons = [];
      try {
        const col = colonne("compagnon");
        const ls = await lister(col.dossier);
        compagnons = ls.fichiers.filter(f => !f.dir && /\.md$/i.test(f.name) && !EXCLUS.defaut.test(f.name)).map(f => f.name.replace(/\.md$/i, "").replace(/^\d+_/, "").replace(/_/g, " "));
      } catch (err) { if (err && (err.status === 401 || err.auth)) throw err; }
      return { ...e, compagnons, perime: r.perime, trouve: true, fichier };
    },

    /**
     * Associe une photo à une fiche (ou la retire avec "") : la fiche est relue juste avant, SEUL le champ « photo » change, le reste est conservé tel quel.
     * Refuse d'écrire sur une copie hors ligne (lireFiche ne sert jamais la copie locale).
     */
    async definirPhoto(id, fichier, nomPhoto) {
      const col = colonne(id);
      const chemin = `${col.dossier}/${fichier}`;
      const f = await depot.lireFiche(chemin);
      if (!f) throw new Error("Cette fiche n'existe plus.");
      const texte = modifierFiche(f.texte, { champs: { photo: nomPhoto || "" } });
      if (texte !== f.texte) await depot.modifier(chemin, texte, f.etag);
    },

    /** Prénom connu (lu dans la fiche, gardé sur l'appareil) ; sinon « l'aventurière » du vocabulaire. */
    prenom() { return (memoire && memoire.lire("prenom")) || ""; },

    /** Journal du héros : fichier « Journal_de_….md » du dossier du journal. */
    async journal() {
      const ls = await lister(regles.dossierJournal);
      const f = ls.fichiers.find(x => !x.dir && /^Journal_de_.*\.md$/i.test(x.name));
      if (!f) return { texte: null, perime: ls.perime };
      return lire(`${regles.dossierJournal}/${f.name}`);
    }
  };
}
