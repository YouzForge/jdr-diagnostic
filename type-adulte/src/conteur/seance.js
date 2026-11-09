// Séance de jeu (mode Jouer) : l'état gardé sur le téléphone pendant la partie, les dés, les fins. Logique pure, testée dans Node.
import { coeursMax } from "./potions.js?v=0.16.1";

/** Réussite au 2d6 : au moins un dé au seuil du profil (5 par défaut : 5 ou 6), ou un double. */
export const estReussite = (a, b, seuil = 5) => a >= seuil || b >= seuil || a === b;

/** Nouvelle séance. `etat` = état du héros (coeurs, armure) ; `etapes` = les étapes lues de l'histoire. */
export function nouvelleSeance({ file, titre, etat = {}, etapes = [], maintenant = Date.now(), regles = {} }) {
  const coeurs = Number.isInteger(etat.coeurs) ? etat.coeurs : (regles.coeursDepart ?? 3);
  const armure = Number.isInteger(etat.armure) ? etat.armure : (regles.armureDepart ?? 0);
  return { file, titre, step: 0, coeurs, armure, coeurs0: coeurs, coeursMax: coeurs, armure0: armure,
    potions: [], bus: [], ajoutees: [], etapes: etapes.map(e => e.title), phrases: [], jets: [], started: maintenant };
}

/** Garde l'étape courante dans les bornes. */
export const bornerEtape = (s, nb) => { s.step = Math.max(0, Math.min(s.step, Math.max(nb - 1, 0))); return s.step; };

/** Enregistre un jet et renvoie sa réussite. */
export function ajouterJet(s, a, b, seuil = 5, maintenant = Date.now()) {
  const ok = estReussite(a, b, seuil);
  s.jets = s.jets || []; s.jets.push({ a, b, ok, at: maintenant });
  return ok;
}

/** Deux jets ratés de suite → proposer un plan B (règle « pas d'accumulation d'échecs »). */
export const deuxRatesDeSuite = s => (s.jets || []).slice(-2).filter(j => !j.ok).length >= 2 && (s.jets || []).length >= 2;

/** Les fins prévues d'une étape (champs « Fin A », « Fin B »…). → [{code, texte}] */
export function finsDe(fields) {
  return fields.filter(f => /^fin\s*[a-z0-9]*\s*$/i.test(f.label)).map(f => {
    const code = (f.label.match(/^fin\s*([a-z0-9]*)/i) || [, ""])[1].toUpperCase();
    return { code: code || "1", texte: [f.text, ...f.items].filter(Boolean).join(" · ").replace(/\*\*|\*|`/g, "") };
  });
}

/** La fin choisie, en une ligne pour le récap. */
export function finEnTexte(s, prenom = "l'aventurière") {
  if (!s || !s.fin) return "";
  return s.fin.code === "autre" ? `Autre fin imaginée par ${prenom} : ${s.fin.texte}` : `Fin ${s.fin.code} : ${s.fin.texte}`;
}

/** Libellé de la pastille d'une voie : pouvoir demandé, « Pas encore » si verrouillée, sinon « Automatique ». */
export function pastilleVoie(v) {
  if (v.verrou) return "Pas encore" + (v.pouvoir ? " · " + v.pouvoir : "");
  if (v.pouvoir) return v.pouvoir + " · 2d6";      // le contrat : un pouvoir entre parenthèses demande un jet, quel que soit son nom
  return "Automatique";
}

/** Cœurs affichables au maximum pendant la partie. */
export const plafondCoeurs = coeursMax;
