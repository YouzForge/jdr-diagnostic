// Formulaires de création, de modification et de suppression des fiches. Tout vient du profil (collection, champs, sections) :
// aucun formulaire écrit à la main pour un JDR. Sans DOM : l'interface (app/app.js) ne fait qu'afficher ce modèle et lire les saisies.
//
// Principe de sécurité : une modification n'envoie QUE ce qui a changé (`modifierFiche`), donc un champ ou une section que la personne
// ne voit pas (masqués pour un joueur) ou que le formulaire ne connaît pas n'est jamais touché.
import { norm, getSection, parseDoc } from "../md/doc.js?v=0.18.0";
import { analyserType } from "../profil/champs.js?v=0.18.0";
import { cheminCollection } from "../collections/charger.js?v=0.18.0";
import { modifierFiche, creerFiche, nomFichier, verifierValeur, EcritureInvalide } from "../ecriture/fiche.js?v=0.18.0";
import { CHAMPS_TECHNIQUES } from "./affichage.js?v=0.18.0";
import { FicheExiste, ConflitEcriture, FicheVerrouillee } from "../graph/client.js?v=0.18.0";
import { AccesRefuse, AccesRetire } from "../depot/depot.js?v=0.18.0";

const sec = profil => (profil && profil.securite) || {};
const masque = profil => sec(profil).masque || {};
const contient = (titre, motifs) => (motifs || []).some(m => String(titre).toLowerCase().includes(String(m).toLowerCase()));

/** Cette personne peut-elle écrire dans cette collection ? (Le dépôt refuse de toute façon ce qui sort de son périmètre.) */
export function peutEcrire(profil, role, col) {
  if (role === "mj") return true;
  if (role !== "joueur") return false;
  return sec(profil).mode === "separe" ? col.zone === "joueur" : col.zone !== "mj";
}

/** Champ qui sert de nom à la fiche : « nom », sinon « titre ». */
export const cleDuNom = col => ((col.champs || []).find(c => norm(c.k) === "nom") || (col.champs || []).find(c => norm(c.k) === "titre") || {}).k || null;

const enTexte = v => (v === true ? "true" : v === false ? "false" : v == null ? "" : String(v));

/**
 * Ce que le formulaire affiche. `fiche` = { meta, body } d'une fiche existante (parseDoc), ou null pour une création.
 * @returns {{champs:object[], sections:object[], creation:boolean}}
 */
export function modeleFormulaire(profil, role, col, fiche = null, { images = false } = {}) {
  const m = masque(profil), vis = sec(profil).visibilites || { accessible: "accessible", conditionnel: "conditionnel", secret: "secret" };
  const champs = [];
  for (const def of col.champs || []) {
    const { genre, valeur } = analyserType(def.t);
    if ((genre === "image" && !images) || CHAMPS_TECHNIQUES.includes(def.k)) continue;
    if (role !== "mj" && ((m.champs || []).includes(def.k) || genre === "visibilite")) continue;   // un joueur ne voit pas les champs masqués et ne règle pas la visibilité
    const brut = fiche ? fiche.meta[norm(def.k)] : undefined;
    let options = genre === "enum" ? valeur.split("|") : genre === "visibilite" ? Object.keys(vis) : null;
    let initial = fiche ? enTexte(brut) : "";
    if (!fiche && genre === "visibilite") initial = col.zone === "table" ? "accessible" : "secret";
    if (options && initial !== "" && !options.includes(initial)) options = [...options, initial];   // valeur étrangère gardée telle quelle, jamais effacée en silence
    champs.push({
      cle: def.k, libelle: def.l || def.k, genre: ["text", "int", "bool", "area", "enum", "visibilite", "image"].includes(genre) ? genre : "text",
      options, libellesOptions: genre === "visibilite" ? vis : null, requis: !!def.req, initial,
      ref: genre === "ref" ? valeur : null,
      aide: genre === "ref" ? "Nom de la fiche liée" : genre === "list" ? "Plusieurs valeurs : sépare-les par des virgules" : null
    });
  }
  const sections = (col.sections || [])
    .filter(t => role === "mj" || !contient(t, m.sections))
    .map(titre => ({ titre, initial: fiche ? getSection(fiche.body, titre) : "" }));
  return { champs, sections, creation: !fiche };
}

/**
 * Contrôle les saisies et en déduit ce qui change. `saisies` = { champs: {cle: texte | booléen}, sections: {titre: texte} }.
 * @returns {{erreurs:Object<string,string>, champs:object, sections:object, nom:string|null}}
 */
export function preparerEcriture(modele, saisies, col) {
  const erreurs = {}, champs = {}, sections = {};
  for (const c of modele.champs) {
    const brut = saisies.champs ? saisies.champs[c.cle] : undefined;
    let valeur, texte;
    if (c.genre === "bool") {
      valeur = brut === true || brut === "true"; texte = String(valeur);
      const avant = c.initial === "true";
      if (modele.creation ? valeur : valeur !== avant) champs[c.cle] = valeur;
      continue;
    }
    texte = enTexte(brut).replace(/\s*\n\s*/g, " ").trim();      // une valeur d'en-tête tient sur une ligne
    if (c.requis && texte === "") { erreurs[c.cle] = "Obligatoire"; continue; }
    if (c.genre === "image" && texte !== "" && !/^[A-Za-z0-9_.-]+\.(jpe?g|png|webp)$/i.test(texte)) { erreurs[c.cle] = "Nom de photo non valide"; continue; }
    if (c.genre === "int" && texte !== "") {
      if (!/^-?\d+$/.test(texte)) { erreurs[c.cle] = "Un nombre entier est attendu"; continue; }
      valeur = Number(texte); texte = String(valeur);
    } else valeur = texte;
    if (c.options && texte !== "" && !c.options.includes(texte)) { erreurs[c.cle] = "Valeur non prévue"; continue; }
    try { verifierValeur(c.cle, valeur); } catch (e) { erreurs[c.cle] = e instanceof EcritureInvalide ? messageValeur(e) : "Valeur refusée"; continue; }
    if (modele.creation ? (texte !== "" || c.requis) : texte !== c.initial) champs[c.cle] = valeur;
  }
  for (const s of modele.sections) {
    const texte = String((saisies.sections && saisies.sections[s.titre]) ?? "").replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "");
    if (/^#{1,2}([ \t]|$)/m.test(texte)) { erreurs["§" + s.titre] = "Pas de titre « # » ou « ## » dans le texte (utilise « ### »)"; continue; }
    if (texte !== s.initial) sections[s.titre] = texte;
  }
  const cleNom = col ? cleDuNom(col) : null;
  const nom = cleNom ? (champs[cleNom] ?? (modele.champs.find(c => c.cle === cleNom) || {}).initial ?? null) : null;
  return { erreurs, champs, sections, nom: nom == null ? null : String(nom) };
}

function messageValeur(e) {
  return { valeur_multiligne: "Une seule ligne", valeur_espaces: "Pas d'espace au début ou à la fin", valeur_guillemets: "Ne pas entourer par des guillemets", valeur_type: "Valeur non permise" }[e.raison] || "Valeur refusée";
}

/** Texte et nom de fichier d'une NOUVELLE fiche. `existants` = noms de fichiers déjà présents dans le dossier. */
export function nouvelleFiche(prep, col, existants = []) {
  if (!prep.nom) throw new EcritureInvalide("Donne un nom à la fiche", "nom_vide");
  const fichier = nomFichier(prep.nom, existants);
  const corps = [`# ${prep.nom}`, ...Object.entries(prep.sections).filter(([, t]) => t !== "").map(([t, x]) => `## ${t}\n${x}`)].join("\n\n");
  return { fichier, texte: creerFiche(prep.champs, corps + "\n") };
}

/** Traduit une erreur d'écriture en phrase pour la personne. `type` : « conflit », « existe », « refus », « invalide », « acces », « verrou », « autre ». */
export function messageEcriture(e) {
  if (e instanceof ConflitEcriture) return { type: "conflit", texte: e.raison === "disparue" ? "Cette fiche a été supprimée ailleurs. Rien n'a été enregistré." : "Cette fiche a été modifiée ailleurs depuis que tu l'as ouverte. Rien n'a été enregistré : recharge-la, puis refais ta modification." };
  if (e instanceof FicheExiste) return { type: "existe", texte: "Une fiche porte déjà ce nom. Choisis un autre nom." };
  if (e instanceof FicheVerrouillee) return { type: "verrou", texte: "La fiche est ouverte ailleurs. Réessaie dans un instant." };
  if (e instanceof AccesRetire) return { type: "acces", texte: "L'accès à ce dossier a été retiré. Redemande un lien au MJ." };
  if (e instanceof AccesRefuse) return { type: "refus", texte: e.raison === "ecriture_desactivee" ? "L'écriture n'est pas activée pour ce JDR." : e.raison === "ecriture_refusee" ? "OneDrive refuse l'écriture dans ce dossier (droits en lecture seule ?)." : "Écriture non permise ici (" + e.raison + ")." };
  if (e instanceof EcritureInvalide) return { type: "invalide", texte: e.raison === "format_non_editable" ? "Cette fiche est dans l'ancien format : elle ne peut pas être modifiée ici." : e.message };
  if (e && e.status === 401) return { type: "auth", texte: "Reconnexion nécessaire." };
  return { type: "autre", texte: "L'enregistrement a échoué" + (e && e.status ? " (code " + e.status + ")" : "") + ". Rien n'a été perdu : réessaie." };
}

const chemin = (profil, session, col, pseudo, fichier) => `${cheminCollection(profil, session.role, col, pseudo)}/${fichier}`;

/** Ouvre une fiche pour la modifier : texte actuel + version. → { modele, texte, etag } ou null si la fiche n'existe plus. */
export async function ouvrirPourModifier({ session, profil, col, pseudo, fichier, images = false }) {
  const f = await session.depot.lireFiche(chemin(profil, session, col, pseudo, fichier));
  if (!f) return null;
  const d = parseDoc(f.texte);
  if (!d.structured) throw new EcritureInvalide("Ancien format", "format_non_editable");
  return { modele: modeleFormulaire(profil, session.role, col, d, { images }), texte: f.texte, etag: f.etag };
}

/** Enregistre une modification. → { fichier } ; lève une erreur traduisible par `messageEcriture`. Rien à écrire = rien d'envoyé. */
export async function enregistrerModification({ session, profil, col, pseudo, fichier, ouverture, saisies }) {
  const prep = preparerEcriture(ouverture.modele, saisies, col);
  if (Object.keys(prep.erreurs).length) return { erreurs: prep.erreurs };
  if (!Object.keys(prep.champs).length && !Object.keys(prep.sections).length) return { inchange: true };
  // le nom change : le titre « # nom » du texte, s'il répétait l'ancien nom, suit (sinon l'ancien nom resterait affiché et ne serait plus modifiable)
  const cleNom = col ? cleDuNom(col) : null, champNom = cleNom && ouverture.modele.champs.find(c => c.cle === cleNom);
  const titre = champNom && prep.nom != null && champNom.initial !== "" && prep.nom !== champNom.initial ? { ancien: champNom.initial, nouveau: prep.nom } : null;
  const texte = modifierFiche(ouverture.texte, { champs: prep.champs, sections: prep.sections, titre });
  await session.depot.modifier(chemin(profil, session, col, pseudo, fichier), texte, ouverture.etag);
  return { fichier };
}

/** Crée une fiche. → { fichier } ou { erreurs }. */
export async function enregistrerCreation({ session, profil, col, pseudo, modele, saisies, existants }) {
  const prep = preparerEcriture(modele, saisies, col);
  if (Object.keys(prep.erreurs).length) return { erreurs: prep.erreurs };
  const { fichier, texte } = nouvelleFiche(prep, col, existants);
  await session.depot.creer(chemin(profil, session, col, pseudo, fichier), texte);
  return { fichier };
}

/** Supprime une fiche (corbeille OneDrive) en s'assurant qu'on supprime bien la version qu'on a sous les yeux. */
export async function supprimerFiche({ session, profil, col, pseudo, fichier }) {
  const p = chemin(profil, session, col, pseudo, fichier);
  const f = await session.depot.lireFiche(p);
  if (!f) return;                       // déjà supprimée
  await session.depot.supprimer(p, f.etag);
}
