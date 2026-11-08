// Les « voies » d'une étape : plusieurs façons de résoudre une tâche, chacune avec un type (icône + couleur).
// Le type s'écrit dans l'histoire : « - **Voie enquêter · Titre (pouvoir) :** ». Les types proposés par un JDR viennent de son profil
// (modules.voies.types) ; ce fichier ne fait que connaître les types possibles et leurs mots-clés.

export const TYPES_VOIE = [
  { cle: "enqueter",  nom: "Enquêter",           icone: "search",  mots: ["enquet", "chercher", "trace", "empreinte", "indice", "observer"] },
  { cle: "parler",    nom: "Parler",             icone: "chat",    mots: ["parler", "discuter", "negoci", "convaincre", "interroger", "temoin", "demander"] },
  { cle: "battre",    nom: "Se battre",          icone: "sword",   mots: ["battre", "combat", "attaquer", "combattre"] },
  { cle: "forcer",    nom: "Forcer",             icone: "fist",    mots: ["forcer", "casser", "soulever", "pousser", "defoncer"] },
  { cle: "ruser",     nom: "Ruser",              icone: "key",     mots: ["ruser", "ruse", "crocheter", "piege", "deguis", "cacher", "tromper"] },
  { cle: "chemin",    nom: "Autre chemin",       icone: "detour",  mots: ["chemin", "contourner", "passage", "grimper", "explorer", "detour"] },
  { cle: "reflechir", nom: "Réfléchir",          icone: "bulb",    mots: ["reflechir", "enigme", "devinette", "puzzle", "logique"] },
  { cle: "objet",     nom: "Objet ou compagnon", icone: "bag",     mots: ["objet", "compagnon", "utiliser", "outil"] },
  { cle: "cooperer",  nom: "Coopérer",           icone: "friends", mots: ["cooper", "aider", "ensemble", "equipe"] }
];
export const TYPE_DEFAUT = { cle: "autre", nom: "", icone: "star", mots: [] };
/** Au-delà, l'écran signale qu'il y a trop de choix pour un jeune enfant. */
export const MAX_VOIES = 3;

const plat = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cherche un type dans un texte (clé exacte d'abord, puis mots-clés). */
export function typeDe(texte) {
  const t = plat(texte);
  if (!t.trim()) return null;
  for (const ty of TYPES_VOIE) if (t.trim() === ty.cle) return ty;
  for (const ty of TYPES_VOIE) if (ty.mots.some(m => t.includes(m))) return ty;
  return null;
}

/**
 * Lit l'étiquette d'une voie : « Voie enquêter · Traces et empreintes (Œil du loup) », « Voie ruser · Crocheter (pas encore : Crochetage) »,
 * ou l'ancien « Voie 1 · Traces… ». → { type, titre, pouvoir, verrou } ou null si ce n'est pas une voie.
 */
export function parseVoie(label) {
  const m = String(label ?? "").match(/^voie\b\s*(\d+)?\s*[·:\-–—]?\s*(.*)$/i);
  if (!m) return null;
  let reste = m[2].trim();
  let paren = "";
  const pm = reste.match(/\(([^)]*)\)\s*$/);
  if (pm) { paren = pm[1].trim(); reste = reste.slice(0, pm.index).trim(); }
  const morceaux = reste.split(/\s*[·|]\s*/);
  let type = null, titre = reste;
  if (morceaux.length > 1) {
    const t = typeDe(morceaux[0]);
    if (t && plat(morceaux[0]).split(/\s+/).length <= 3) { type = t; titre = morceaux.slice(1).join(" · "); }
  }
  if (!type) type = typeDe(reste) || TYPE_DEFAUT;
  let pouvoir = "", verrou = false;
  const vm = paren.match(/^pas encore\s*[:·-]?\s*(.*)$/i);
  if (vm) { verrou = true; pouvoir = vm[1].trim(); } else pouvoir = paren;
  return { type, titre: titre || type.nom, pouvoir, verrou };
}
