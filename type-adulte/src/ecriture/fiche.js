// Édition « fidèle » des fiches Markdown (D30, R4 et R5) : on ne modifie QUE ce qui a été demandé, le reste du fichier
// reste identique à l'octet près (autres champs, commentaires, ordre, fins de ligne, ligne manquante de l'ancien format…).
// `parseDoc` lit avec perte (guillemets, nombres, lignes ignorées) : on ne réécrit donc JAMAIS un fichier à partir de ce qu'il a lu.
// Sans DOM, sans réseau : fonctionne dans le navigateur et dans Node.
import { norm } from "../md/doc.js?v=0.18.0";

export class EcritureInvalide extends Error {
  constructor(message, raison) { super(message); this.name = "EcritureInvalide"; this.raison = raison; }
}

export const TAILLE_MAX_FICHE = 200000;     // caractères ; au-delà on refuse (une fiche de jeu n'est pas un roman)
const CLES_INTERDITES = new Set(["__proto__", "constructor", "prototype"]);
const ENTETE = /^---\n([\s\S]*?)\n---\n?/;   // la MÊME expression que `parseDoc` : on édite exactement la zone que l'application lit
const LIGNE_CHAMP = /^([A-Za-z_À-ÿŒœ0-9]+)\s*:\s*(.*)$/;

const refuser = (message, raison) => { throw new EcritureInvalide(message, raison); };

/** Une valeur de champ qui se relira à l'identique : une seule ligne, sans espace de bord, sans guillemets qui l'entourent. */
export function verifierValeur(cle, v) {
  if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) return String(v);
  if (typeof v !== "string") refuser(`Champ « ${cle} » : valeur de type non permis`, "valeur_type");
  if (/[\r\n\u0000]/.test(v)) refuser(`Champ « ${cle} » : une valeur tient sur une seule ligne`, "valeur_multiligne");
  if (v !== v.trim()) refuser(`Champ « ${cle} » : espaces au début ou à la fin`, "valeur_espaces");
  if (/^(["']).*\1$/.test(v)) refuser(`Champ « ${cle} » : la valeur ne peut pas commencer et finir par le même guillemet`, "valeur_guillemets");
  return v;
}

function verifierCle(cle) {
  const c = typeof cle === "string" ? norm(cle) : "";
  if (!c || CLES_INTERDITES.has(c)) refuser("Nom de champ interdit : " + JSON.stringify(cle), "cle_interdite");
  return c;
}

/** Fins de ligne : tout en « \n » pour travailler, et on remet « \r\n » à la fin si le fichier d'origine n'en avait QUE de ce type. */
function normaliserFins(texte) {
  let bom = "";
  if (texte.charCodeAt(0) === 0xFEFF) { bom = "﻿"; texte = texte.slice(1); }
  const crlf = (texte.match(/\r\n/g) || []).length;
  const lf = (texte.match(/\n/g) || []).length - crlf;
  if (/\r(?!\n)/.test(texte) || (crlf && lf)) refuser("Fins de ligne mélangées : fichier à corriger à la main", "fins_de_ligne");
  return { bom, crlf: crlf > 0, texte: crlf ? texte.replace(/\r\n/g, "\n") : texte };
}
const restituer = (t, { bom, crlf }) => bom + (crlf ? t.replace(/\n/g, "\r\n") : t);

const echapper = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Remplace le texte de la section « ## titre » (créée à la fin si elle n'existe pas). Tout le reste du corps est conservé tel quel. */
function remplacerSection(corps, titre, texte) {
  if (typeof titre !== "string" || !titre.trim() || /[\r\n]/.test(titre) || titre !== titre.trim()) refuser("Titre de section invalide", "titre_invalide");
  if (typeof texte !== "string") refuser(`Section « ${titre} » : texte attendu`, "section_type");
  texte = texte.replace(/\r\n/g, "\n");
  if (/\r/.test(texte) || /\u0000/.test(texte)) refuser(`Section « ${titre} » : caractère interdit`, "section_caractere");
  // un titre de niveau 1 ou 2 dans le texte changerait la structure de la fiche (et pourrait « ouvrir » une autre section)
  if (/^#{1,2}[ \t]/m.test(texte) || /^#{1,2}$/m.test(texte)) refuser(`Section « ${titre} » : le texte ne peut pas contenir de titre « # » ou « ## »`, "titre_dans_texte");
  const nouveau = texte.replace(/^\n+/, "").replace(/\s+$/, "");
  const re = new RegExp(`^## ${echapper(titre)}[ \\t]*(?:\\n|$)`, "m");
  const m = corps.match(re);
  if (!m) {
    if (!nouveau) return corps;
    const base = corps === "" ? "" : corps.replace(/\n*$/, "") + "\n\n";
    return `${base}## ${titre}\n${nouveau}\n`;
  }
  const debut = m.index + m[0].length;
  const suite = corps.slice(debut).search(/^## /m);
  const fin = suite === -1 ? corps.length : debut + suite;
  const ancien = corps.slice(debut, fin);
  const avant = (ancien.match(/^\n*/) || [""])[0];
  const apres = (ancien.match(/\n*$/) || [""])[0];
  const interieur = nouveau
    ? (avant.length >= ancien.length ? "" : avant) + nouveau + (apres || "\n")
    : (fin === corps.length ? "" : "\n");               // section vidée : le titre reste, suivi d'une seule ligne vide
  const enTete = m[0].endsWith("\n") ? m[0] : m[0] + "\n";
  return corps.slice(0, m.index) + enTete + interieur + corps.slice(fin);
}

/** Renomme le premier « # titre » de l'introduction (avant la 1re section « ## ») s'il vaut exactement `ancien`. Rien d'autre ne bouge. */
function renommerTitre(corps, ancien, nouveau) {
  if (typeof ancien !== "string" || typeof nouveau !== "string" || ancien === nouveau) return corps;
  verifierValeur("titre", nouveau);
  const fin = corps.search(/^## /m);
  const intro = fin === -1 ? corps : corps.slice(0, fin);
  const m = intro.match(/^# (.*)$/m);
  if (!m || m[1].trim() !== ancien.trim()) return corps;
  return corps.slice(0, m.index) + "# " + nouveau + corps.slice(m.index + m[0].length);
}

/**
 * Modifie une fiche en conservant tout le reste.
 * @param {string} texte
 * @param {{champs?:Object<string,string|number|boolean>, sections?:Object<string,string>, titre?:{ancien:string, nouveau:string}}} changements
 *   `titre` : renomme le premier « # titre » du texte, seulement s'il porte exactement l'ancien nom (un titre différent est laissé tel quel)
 * @returns {string} le nouveau texte (identique à `texte` si rien ne change)
 * @throws EcritureInvalide si la fiche n'est pas au format à en-tête « --- » (ancien format : jamais réécrit) ou si une valeur est refusée
 */
export function modifierFiche(texte, { champs = {}, sections = {}, titre = null } = {}) {
  if (typeof texte !== "string") refuser("Texte de fiche attendu", "texte_type");
  const { bom, crlf, texte: t } = normaliserFins(texte);
  const m = t.match(ENTETE);
  if (!m) refuser("Fiche sans en-tête « --- » (ancien format) : non modifiable par formulaire", "format_non_editable");
  const lignes = m[1].split("\n");
  const vus = new Set();
  for (const [cle, v] of Object.entries(champs)) {
    const c = verifierCle(cle);
    if (vus.has(c)) refuser(`Champ « ${cle} » donné deux fois`, "cle_double");
    vus.add(c);
    const valeur = verifierValeur(cle, v);
    let idx = -1;
    lignes.forEach((l, i) => { const k = l.match(LIGNE_CHAMP); if (k && norm(k[1]) === c) idx = i; });   // la dernière ligne gagne, comme à la lecture
    const nom = idx >= 0 ? lignes[idx].match(LIGNE_CHAMP)[1] : c;
    const ligne = valeur === "" ? `${nom}:` : `${nom}: ${valeur}`;
    if (idx >= 0) lignes[idx] = ligne; else lignes.push(ligne);
  }
  let corps = t.slice(m[0].length);
  if (titre) corps = renommerTitre(corps, titre.ancien, titre.nouveau);
  for (const [titreSection, contenu] of Object.entries(sections)) corps = remplacerSection(corps, titreSection, contenu);
  const sortie = "---\n" + lignes.join("\n") + "\n---\n" + corps;
  // l'en-tête d'origine pouvait ne pas finir par un saut de ligne (« --- » en toute fin de fichier) : on le garde tel quel si le corps est vide
  const final = m[0].endsWith("\n") || corps !== "" ? sortie : sortie.slice(0, -1);
  if (final.length > TAILLE_MAX_FICHE) refuser("Fiche trop volumineuse", "trop_grosse");
  return restituer(final, { bom, crlf });
}

/** Texte d'une nouvelle fiche : en-tête de champs + corps. Valeurs contrôlées comme pour `modifierFiche`. */
export function creerFiche(champs = {}, corps = "") {
  const vus = new Set(), lignes = [];
  for (const [cle, v] of Object.entries(champs)) {
    const c = verifierCle(cle);
    if (vus.has(c)) refuser(`Champ « ${cle} » donné deux fois`, "cle_double");
    vus.add(c);
    const valeur = verifierValeur(cle, v);
    lignes.push(valeur === "" ? `${c}:` : `${c}: ${valeur}`);
  }
  if (typeof corps !== "string") refuser("Corps de fiche : texte attendu", "corps_type");
  if (/\u0000/.test(corps)) refuser("Corps de fiche : caractère interdit", "corps_caractere");
  const c = corps.replace(/\r\n/g, "\n").replace(/^\n+/, "");
  const texte = `---\n${lignes.join("\n")}\n---\n${c}${c && !c.endsWith("\n") ? "\n" : ""}`;
  if (!lignes.length) refuser("Une fiche a au moins un champ", "sans_champ");
  if (texte.length > TAILLE_MAX_FICHE) refuser("Fiche trop volumineuse", "trop_grosse");
  return texte;
}

const RESERVES_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Nom de fichier « .md » sûr pour OneDrive à partir d'un nom saisi : sans accent, sans espace, sans caractère interdit,
 * jamais un nom réservé (« 00_… » est réservé aux modèles et au marqueur ; CON, NUL, COM1… sont interdits par Windows),
 * et différent (sans tenir compte des majuscules) de ceux qui existent déjà.
 */
export function nomFichier(nom, existants = []) {
  let base = String(nom ?? "").normalize("NFD").replace(/œ/gi, "oe").replace(/æ/gi, "ae").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60).replace(/_+$/, "");
  if (!base) refuser("Nom vide", "nom_vide");
  if (/^00_/.test(base) || RESERVES_WINDOWS.test(base)) base = "Fiche_" + base;
  const pris = new Set((existants || []).map(x => String(x).toLowerCase()));
  let candidat = base + ".md", i = 1;
  while (pris.has(candidat.toLowerCase())) {
    if (++i > 99) refuser("Trop de fiches de même nom", "nom_pris");
    candidat = `${base}_${i}.md`;
  }
  return candidat;
}
