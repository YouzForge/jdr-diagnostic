// Jet d100 et affichage des valeurs de l'application « joueur » (D35). Aucun nom de jeu ici : tout vient du profil (module « d100 »).
// Règles (données par le MJ le 8 novembre 2026) : réussite si jet <= valeur ; réussite critique 1 à 5 ; échec critique 95 à 100 ;
// les critiques valent QUELLE QUE SOIT la valeur de la compétence. Sans DOM, sans stockage : testable dans Node.

export const REGLES_D100_DEFAUT = Object.freeze({ critiqueReussiteMax: 5, critiqueEchecMin: 95, multiplicateur: 5, plafond: null });

const entier = (v, defaut, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : defaut);

/** Règles du module « d100 » du profil, avec les valeurs par défaut. Les valeurs invalides sont ignorées (jamais une règle bancale en silence : le validateur les refuse). */
export function reglesD100(profil) {
  const m = (profil && profil.modules && profil.modules.d100) || {};
  const r = m.reussite && typeof m.reussite === "object" ? m.reussite : {};
  const cr = entier(r.critique_reussite_max, REGLES_D100_DEFAUT.critiqueReussiteMax, 0, 50);
  const ce = entier(r.critique_echec_min, REGLES_D100_DEFAUT.critiqueEchecMin, 51, 100);
  const c = m.creation || {};
  return {
    /** Faux tant que le profil n'écrit pas la règle de réussite : l'interface refuse alors de lancer un jet (le moteur ne devine pas une règle de jeu). */
    definie: !!(m.reussite && typeof m.reussite === "object" && m.reussite.comparaison === "inferieur_ou_egal"),
    critiqueReussiteMax: cr,
    critiqueEchecMin: ce,
    multiplicateur: entier(m.multiplicateur_total, REGLES_D100_DEFAUT.multiplicateur, 1, 100),
    plafond: Number.isInteger(c.plafond_competence_pct) ? c.plafond_competence_pct : null,
    budgetCaracteristiques: Number.isInteger(c.budget_caracteristiques) ? c.budget_caracteristiques : null,
    min: Number.isInteger(c.min) ? c.min : null,
    max: Number.isInteger(c.max) ? c.max : null
  };
}

export const CATEGORIES = Object.freeze(["reussite_critique", "reussite", "echec", "echec_critique"]);
export const LIBELLES = Object.freeze({ reussite_critique: "Réussite critique", reussite: "Réussite", echec: "Échec", echec_critique: "Échec critique" });
export const estReussite = cat => cat === "reussite" || cat === "reussite_critique";

/** Catégorie d'un jet (1 à 100) face à une valeur de compétence sur 100. Les critiques l'emportent, quelle que soit la valeur. */
export function categorie(jet, valeur, regles = REGLES_D100_DEFAUT) {
  if (!Number.isInteger(jet) || jet < 1 || jet > 100) throw new RangeError("Jet hors de 1 à 100 : " + jet);
  if (!Number.isFinite(valeur)) throw new TypeError("Valeur de compétence attendue");
  if (jet <= regles.critiqueReussiteMax) return "reussite_critique";
  if (jet >= regles.critiqueEchecMin) return "echec_critique";
  return jet <= valeur ? "reussite" : "echec";
}

/** Tirage d'un d100 (1 à 100) sans biais de modulo : tirage au hasard du navigateur si disponible, sinon `Math.random`. `alea` (tests) renvoie un réel dans [0, 1[. */
export function lancer(alea = null) {
  if (typeof alea === "function") return 1 + Math.floor(alea() * 100);
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    const t = new Uint32Array(1);
    const limite = Math.floor(0x100000000 / 100) * 100;           // rejette le haut de la plage pour que chaque jet ait la même probabilité
    do c.getRandomValues(t); while (t[0] >= limite);
    return 1 + (t[0] % 100);
  }
  return 1 + Math.floor(Math.random() * 100);
}

/** Largeur (en jets, total 100) des quatre zones de la barre : critique de réussite, réussite, échec, critique d'échec. */
export function bandes(valeur, regles = REGLES_D100_DEFAUT) {
  const cr = regles.critiqueReussiteMax, ce = regles.critiqueEchecMin;
  const v = Math.max(cr, Math.min(ce - 1, Math.floor(valeur)));      // la valeur ne déplace jamais les zones critiques
  return { reussite_critique: cr, reussite: v - cr, echec: ce - 1 - v, echec_critique: 100 - ce + 1 };
}

/** Phrase de la barre : « réussite si le jet est inférieur ou égal à 60 ». */
export const phraseSeuil = valeur => `réussite si le jet est inférieur ou égal à ${Math.floor(valeur)}`;

/** Remarque affichée quand le jet est exactement la valeur (réussi : réussite large), sinon « ». */
export function remarque(jet, valeur, regles = REGLES_D100_DEFAUT) {
  const cat = categorie(jet, valeur, regles);
  return jet === valeur && cat === "reussite" ? "Jet égal à la compétence : c’est réussi" : "";
}

/** Caractéristique : { sur100, sur20 } (le modificateur n'est jamais affiché). */
export function afficherCaracteristique(valeur, regles = REGLES_D100_DEFAUT) {
  return { sur100: valeur * regles.multiplicateur, sur20: valeur };
}
