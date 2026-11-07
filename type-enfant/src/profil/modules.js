// Registre des modules du moteur.
// Chaque module déclare : le public pour lequel il est pensé (enfant / adulte / tous)
// et les rôles qui peuvent l'utiliser (mj / joueur).
// PROPOSITION de Claude (décision D19, à valider par le MJ) : ces valeurs décrivent l'outil,
// pas des règles de jeu. Un profil choisit ses modules et peut restreindre leurs rôles.

export const PUBLICS = ["enfant", "adulte", "tous"];
export const ROLES = ["mj", "joueur"];

export const MODULES = Object.freeze({
  d100:        { public: "tous",   roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Fiche d100 et compétences" },
  jauges:      { public: "tous",   roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Jauges et compteurs" },
  savoirs:     { public: "tous",   roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Ce que les personnages savent" },
  des:         { public: "tous",   roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Lanceur de dés" },
  coeurs:      { public: "enfant", roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Cœurs de vie" },
  voies:       { public: "enfant", roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Voies (manières d'agir)" },
  pieces:      { public: "enfant", roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Pièces (bourse)" },
  objets:      { public: "enfant", roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Catalogue d'objets (couleurs et icônes)" },
  potions:     { public: "enfant", roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Potions (boire en deux fois)" },
  jouer:       { public: "enfant", roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Mode Jouer pas à pas" },
  recap:       { public: "tous",   roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Récapitulatif de session" },
  journal:     { public: "tous",   roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Journal" },
  notes_mj:    { public: "tous",   roles: ["mj"],           jalon: "v1.0", libelle: "Notes du MJ" },
  photos:      { public: "tous",   roles: ["mj", "joueur"], jalon: "v1.0", libelle: "Photos" },
  carte:       { public: "tous",   roles: ["mj", "joueur"], jalon: "apres-v1.0", libelle: "Carte" },
  importation: { public: "tous",   roles: ["mj"],           jalon: "apres-v1.0", libelle: "Importation" },
});

export function nomsModules() {
  return Object.keys(MODULES);
}

/** Un module convient-il au public du profil ? « tous » convient partout. */
export function convientAuPublic(nomModule, publicProfil) {
  const m = MODULES[nomModule];
  if (!m) return false;
  return m.public === "tous" || publicProfil === "tous" || m.public === publicProfil;
}
