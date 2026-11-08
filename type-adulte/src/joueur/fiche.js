// Fiche de personnage de l'application « joueur » : lecture d'un fichier « Fiche.md » (en-tête de champs + tableaux de compétences).
// Aucun nom de statistique ni de classe en dur : les caractéristiques et les classes viennent du profil (module « d100 »). Sans DOM.
import { parseDoc, norm, intOf } from "../md/doc.js";
import { lignesDeSection } from "./tableaux.js";
import { reglesD100, afficherCaracteristique } from "./d100.js";

export const SECTION_COMPETENCES = "Compétences";
export const SECTION_SPECIALES = "Compétences spéciales";

const texte = v => (v == null ? "" : String(v).trim());
const nombre = v => { const n = intOf(v); return n == null ? null : n; };

/** Classes décrites par le profil : [{id, nom, bloc|null, budgetCompetences|null}]. */
export function classesDuProfil(profil) {
  const l = profil && profil.modules && profil.modules.d100 && profil.modules.d100.classes;
  return Array.isArray(l) ? l.filter(c => c && typeof c.id === "string").map(c => ({
    id: norm(c.id), nom: texte(c.nom) || c.id, bloc: texte(c.bloc) || null,
    budgetCompetences: Number.isInteger(c.budget_competences) ? c.budget_competences : null
  })) : [];
}

const valeurCarac = (meta, c) => { for (const k of [c.id, c.nom]) { const v = nombre(meta[norm(k)]); if (v != null) return v; } return null; };

/** Lit une fiche. → { nom, classe:{id,nom,bloc,budget}|null, identite:[...], armure, chance, idee, pv, pvMax, caracteristiques, bloc, competences, speciales, quetePerso, portrait, avertissements } */
export function lireFiche(contenu, profil) {
  const doc = parseDoc(contenu);
  const m = doc.meta;
  const d100 = (profil && profil.modules && profil.modules.d100) || {};
  const regles = reglesD100(profil);
  const classes = classesDuProfil(profil);
  const avertissements = [];

  const idClasse = norm(m.classe || "");
  const classe = classes.find(c => c.id === idClasse || norm(c.nom) === idClasse) || null;
  if (idClasse && !classe) avertissements.push(`Classe « ${m.classe} » inconnue du profil : aucun bloc de classe affiché.`);

  const caracteristiques = (Array.isArray(d100.caracteristiques) ? d100.caracteristiques : []).map(c => {
    const valeur = valeurCarac(m, c);
    if (valeur == null) avertissements.push(`Caractéristique « ${c.nom} » absente de la fiche.`);
    return { id: c.id, nom: c.nom, valeur, ...(valeur == null ? { sur100: null, sur20: null } : afficherCaracteristique(valeur, regles)) };
  });

  const ligne = (r, special = false) => ({
    nom: texte(r.competence), liens: texte(r.liens), valeur: nombre(r.total), groupe: texte(r.groupe), special, note: texte(r.note)
  });
  const toutes = lignesDeSection(doc.body, SECTION_COMPETENCES).map(r => ligne(r)).filter(c => c.nom);
  const speciales = lignesDeSection(doc.body, SECTION_SPECIALES).map(r => ligne(r, true)).filter(c => c.nom);
  for (const c of [...toutes, ...speciales]) if (c.valeur == null) avertissements.push(`Compétence « ${c.nom} » sans valeur : ignorée dans les jets.`);

  const nomBloc = classe && classe.bloc ? norm(classe.bloc) : null;
  const bloc = nomBloc ? { titre: classe.bloc, competences: toutes.filter(c => norm(c.groupe) === nomBloc) } : null;
  const reste = toutes.filter(c => !nomBloc || norm(c.groupe) !== nomBloc);

  return {
    nom: texte(m.nom) || doc.title || "",
    classe: classe ? { id: classe.id, nom: classe.nom, bloc: classe.bloc, budgetCompetences: classe.budgetCompetences } : null,
    identite: ["profession", "age", "taille", "poids"].map(k => texte(m[k])).filter(Boolean),
    armure: nombre(m.armure), chance: nombre(m.chance), idee: nombre(m.idee), pv: nombre(m.pv), pvMax: nombre(m.pv_max),
    caracteristiques, bloc, competences: reste, speciales,
    quetePerso: texte(m.quete_perso), portrait: texte(m.portrait),
    creation: { budget: regles.budgetCaracteristiques, min: regles.min, max: regles.max, plafond: regles.plafond },
    regles, avertissements
  };
}
