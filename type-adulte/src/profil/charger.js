import { validerProfil } from "./valider.js?v=0.17.0";

export class ProfilInvalide extends Error {
  constructor(erreurs, avertissements = []) {
    super(`Profil invalide :\n- ${erreurs.join("\n- ")}`);
    this.name = "ProfilInvalide";
    this.erreurs = erreurs;
    this.avertissements = avertissements;
  }
}

/** Charge un profil depuis un texte JSON ou un objet. Lève ProfilInvalide si une erreur bloque. */
export function chargerProfil(source) {
  let prof = source;
  if (typeof source === "string") {
    try {
      prof = JSON.parse(source);
    } catch (e) {
      throw new ProfilInvalide([`JSON illisible : ${e.message}`]);
    }
  }
  const { erreurs, avertissements } = validerProfil(prof);
  if (erreurs.length) throw new ProfilInvalide(erreurs, avertissements);
  return { profil: prof, avertissements };
}
