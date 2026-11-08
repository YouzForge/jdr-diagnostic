// Textes écrits par le joueur (tranche 2) : étiquettes, notes, note de rencontre, points de vie, bourse. Sans DOM, sans réseau.
// Tout passe par l'édition fidèle du moteur (`modifierFiche`, `creerFiche`) : seul ce qui est demandé change, le reste du fichier
// reste identique à l'octet près. Une valeur refusée lève `EcritureInvalide` (jamais corrigée en silence).
import { modifierFiche, creerFiche, verifierValeur, EcritureInvalide, nomFichier } from "../ecriture/fiche.js";
import { norm } from "../md/doc.js";

export const MAX_ETIQUETTE = 30;
export const MAX_ETIQUETTES_PAR_ELEMENT = 12;
export const MAX_TITRE = 120;
export const MAX_CORPS_NOTE = 20000;
export const MAX_NOTE_RENCONTRE = 5000;
export const MAX_BOURSE = 80;

const refuser = (m, r) => { throw new EcritureInvalide(m, r); };

/** Une étiquette : un mot ou une courte expression, sans virgule ni point-virgule (ils séparent les étiquettes), sur une seule ligne. */
export function verifierEtiquette(e) {
  if (typeof e !== "string") refuser("Étiquette : texte attendu", "etiquette_type");
  const v = e.replace(/\s+/g, " ").trim();
  if (!v) refuser("Étiquette vide", "etiquette_vide");
  if (v.length > MAX_ETIQUETTE) refuser(`Étiquette trop longue (${MAX_ETIQUETTE} caractères au plus)`, "etiquette_longue");
  if (/[,;:\u0000]/.test(v)) refuser("Une étiquette ne contient ni virgule, ni point-virgule, ni deux-points", "etiquette_caractere");
  if (/^[-*]\s/.test(v) || /^(["']).*\1$/.test(v)) refuser("Étiquette refusée", "etiquette_forme");
  return v;
}

/**
 * Les étiquettes déjà posées par le joueur (tous éléments confondus), pour les lui proposer à l'ajout : sans doublon à la casse près (la première graphie
 * rencontrée est gardée), triées à la française, sans celles de `sauf` (déjà sur l'élément). `map` : Map(cible → [étiquettes]) de « Etiquettes.md ».
 */
export function etiquettesUtilisees(map, { sauf = [] } = {}) {
  const ecartees = new Set(sauf.map(t => String(t).toLowerCase()));
  const vues = new Map();
  for (const liste of map ? map.values() : []) for (const t of liste || []) {
    if (typeof t !== "string" || !t.trim()) continue;
    const k = t.toLowerCase();
    if (!ecartees.has(k) && !vues.has(k)) vues.set(k, t);
  }
  return [...vues.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

/**
 * Pose les étiquettes d'un élément dans le fichier « Etiquettes.md » du joueur (lignes « - cible : étiquette, étiquette »).
 * `texte` : contenu actuel (`null` = fichier à créer) ; `cible` : nom de fichier de l'élément (sans « .md ») ; `liste` : les étiquettes voulues
 * (vide = on retire la ligne). Les autres lignes, leur ordre et les fins de ligne sont conservés tels quels.
 * @returns {string} le nouveau contenu
 */
export function poserEtiquettes(texte, cible, liste) {
  if (typeof cible !== "string" || !cible.trim() || /[:\r\n\u0000]/.test(cible) || cible !== cible.trim()) refuser("Cible d'étiquette invalide", "cible_invalide");
  const cibleNet = cible.replace(/\.md$/i, "");
  const vues = new Set(), propres = [];
  for (const e of liste || []) { const v = verifierEtiquette(e); const k = norm(v); if (!vues.has(k)) { vues.add(k); propres.push(v); } }
  if (propres.length > MAX_ETIQUETTES_PAR_ELEMENT) refuser(`Trop d'étiquettes (${MAX_ETIQUETTES_PAR_ELEMENT} au plus par élément)`, "etiquettes_trop");
  const entete = "# Étiquettes\n\nFichier tenu par l'application : une ligne par élément, « - fichier : étiquette, étiquette ».\n\n";
  let t = texte == null ? entete : String(texte);
  const crlf = /\r\n/.test(t) && !/(^|[^\r])\n/.test(t);
  if (crlf) t = t.replace(/\r\n/g, "\n");
  const lignes = t.split("\n");
  const cleCible = norm(cibleNet);
  let idx = -1;
  lignes.forEach((l, i) => { const x = l.match(/^\s*[-*]\s+(.+?)\s*:\s*(.+)$/); if (x && norm(x[1].replace(/\.md$/i, "")) === cleCible) idx = i; });   // la dernière ligne gagne, comme à la lecture
  const ligne = `- ${cibleNet} : ${propres.join(", ")}`;
  if (idx >= 0) {
    if (propres.length) lignes[idx] = ligne; else lignes.splice(idx, 1);
  } else if (propres.length) {
    if (lignes[lignes.length - 1] === "") lignes.splice(lignes.length - 1, 0, ligne); else lignes.push(ligne, "");
  }
  let sortie = lignes.join("\n");
  if (sortie.length && !sortie.endsWith("\n")) sortie += "\n";
  return crlf ? sortie.replace(/\n/g, "\r\n") : sortie;
}

function verifierTitre(titre) {
  if (typeof titre !== "string") refuser("Titre : texte attendu", "titre_type");
  const v = titre.replace(/\s+/g, " ").trim();
  if (!v) refuser("Le titre est obligatoire", "titre_vide");
  if (v.length > MAX_TITRE) refuser(`Titre trop long (${MAX_TITRE} caractères au plus)`, "titre_long");
  return verifierValeur("titre", v);
}
function verifierCorps(corps, max, nom = "Texte") {
  if (typeof corps !== "string") refuser(`${nom} : texte attendu`, "corps_type");
  const v = corps.replace(/\r\n/g, "\n").replace(/\s+$/, "").replace(/^\n+/, "");
  if (/\u0000/.test(v)) refuser(`${nom} : caractère interdit`, "corps_caractere");
  if (/^#[ \t]/m.test(v)) refuser(`${nom} : une ligne ne peut pas commencer par « # » (titre de niveau 1)`, "titre_dans_texte");   // la lecture retire un « # » d'ouverture : il disparaîtrait de l'affichage
  if (v.length > max) refuser(`${nom} trop long (${max} caractères au plus)`, "corps_long");
  return v;
}
const oui = b => (b ? "oui" : "non");

/** Texte d'une nouvelle note (note libre, ou note de journal si `session` est donnée). */
export function texteNote({ titre, corps = "", session = null, epingle = false, date = "" } = {}) {
  const champs = { titre: verifierTitre(titre) };
  if (session != null) {
    if (!Number.isInteger(session) || session < 0 || session > 9999) refuser("Numéro de séance invalide", "session_invalide");
    champs.session = session;
  }
  if (date) champs.date = verifierValeur("date", String(date));
  if (epingle) champs.epingle = "oui";
  return creerFiche(champs, verifierCorps(corps, MAX_CORPS_NOTE, "La note"));
}

const ENTETE = /^---\n([\s\S]*?)\n---\n?/;
/** Remplace tout le texte d'une note en gardant son en-tête et, s'il existe, son titre « # … » d'ouverture (renommé si le titre change). */
function remplacerCorpsNote(texte, nouveau, ancienTitre, nouveauTitre) {
  const crlf = /\r\n/.test(texte) && !/(^|[^\r])\n/.test(texte);
  const bom = texte.charCodeAt(0) === 0xFEFF ? "﻿" : "";
  let t = (bom ? texte.slice(1) : texte).replace(/\r\n/g, "\n");
  const m = t.match(ENTETE);
  if (!m) refuser("Note sans en-tête « --- » : non modifiable par formulaire", "format_non_editable");
  const corps = t.slice(m[0].length);
  const h1 = corps.match(/^\s*# (.*)\n?/);
  let tete = "";
  if (h1) { const nom = h1[1].trim() === (ancienTitre || "").trim() && nouveauTitre ? nouveauTitre : h1[1]; tete = `# ${nom}\n\n`; }
  const suite = nouveau ? nouveau + "\n" : "";
  const sortie = t.slice(0, m[0].length) + (m[0].endsWith("\n") ? "" : "\n") + tete + suite;
  return bom + (crlf ? sortie.replace(/\n/g, "\r\n") : sortie);
}

/**
 * Modifie une note : titre, texte, épinglage. Ce qui n'est pas demandé ne bouge pas (autres champs, ordre, fins de ligne).
 * @param {string} texte contenu actuel ; @param {{titre?:string, corps?:string, epingle?:boolean}} c ; @param {string} [titreActuel] titre affiché avant (pour renommer le « # titre » du texte)
 */
export function modifierNote(texte, { titre, corps, epingle } = {}, titreActuel = "") {
  const champs = {};
  if (titre !== undefined) champs.titre = verifierTitre(titre);
  if (epingle !== undefined) champs.epingle = oui(!!epingle);
  let sortie = modifierFiche(texte, { champs });
  if (corps !== undefined) sortie = remplacerCorpsNote(sortie, verifierCorps(corps, MAX_CORPS_NOTE, "La note"), titreActuel, champs.titre);
  return sortie;
}

/** Texte à partir duquel on nomme le fichier d'une note : « Note du 5 novembre » ou le titre ; jamais vide. */
export function nomDeFichierNote(titre, existants, prefixe = "") {
  return nomFichier(prefixe ? `${prefixe} ${titre}` : titre, existants);
}

/** Note du joueur sur une rencontre : seule la section « Ma note » change ; la présentation du MJ n'est jamais touchée. */
export function noteRencontre(texte, note) {
  return modifierFiche(texte, { sections: { "Ma note": verifierCorps(note, MAX_NOTE_RENCONTRE, "La note") } });
}

/** Bourse : une ligne de texte libre (aucune monnaie supposée) ; vide = on efface. */
export function verifierBourse(v) {
  if (typeof v !== "string") refuser("Bourse : texte attendu", "bourse_type");
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length > MAX_BOURSE) refuser(`Bourse trop longue (${MAX_BOURSE} caractères au plus)`, "bourse_longue");
  if (t) verifierValeur("bourse", t);
  return t;
}
export function changerBourse(texteFiche, bourse) { return modifierFiche(texteFiche, { champs: { bourse: verifierBourse(bourse) } }); }

/** Points de vie : entier de 0 à `max` (si le maximum est connu). La règle « plafonné au maximum » est celle de la barre de la fiche. */
export function changerPV(texteFiche, pv, { max = null } = {}) {
  if (!Number.isInteger(pv) || pv < 0 || pv > 9999) refuser("Points de vie : entier de 0 à 9999", "pv_invalide");
  if (max != null && pv > max) refuser(`Points de vie : au plus ${max}`, "pv_au_dessus_du_max");
  return modifierFiche(texteFiche, { champs: { pv } });
}
