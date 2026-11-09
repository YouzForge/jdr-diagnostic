// Messages montrés au joueur quand une écriture échoue. Sans DOM : testé dans Node. Jamais de détail technique ni de chemin.
import { ConflitEcriture, FicheExiste, FicheVerrouillee } from "../graph/client.js?v=0.17.0";
import { AccesRefuse } from "../depot/depot.js?v=0.17.0";
import { EcritureInvalide } from "../ecriture/fiche.js?v=0.17.0";

const RAISONS = {
  lecture_seule_mj: "Tu regardes comme un joueur : rien ne se modifie dans ce mode.",
  ecriture_desactivee: "La modification n'est pas activée pour ce JDR.",
  dossier_non_vide: "Ce dossier contient encore des objets : déplace-les ou retire-les d'abord.",
  zone_refusee: "Cet élément ne se modifie pas ici.",
  zone_absente: "Ce dossier n'existe pas dans ce JDR.",
  acces_retire: "Ton accès à ce dossier a été retiré. Préviens le MJ.",
  nom_dossier: "Ce nom de dossier n'est pas possible."
};

/**
 * @returns {{texte:string, genre:"conflit"|"existe"|"verrouille"|"invalide"|"refus"|"reseau"|"auth"|"autre", recharger:boolean}}
 * `recharger` : l'écran doit être relu (le fichier a changé ailleurs ou a disparu).
 */
export function messageErreur(e) {
  if (e && (e.status === 401 || e.auth)) return { texte: "Reconnexion nécessaire.", genre: "auth", recharger: false };
  if (e instanceof ConflitEcriture) return e.raison === "disparue"
    ? { texte: "Ce fichier n'existe plus (il a été supprimé ailleurs). Rien n'a été modifié.", genre: "conflit", recharger: true }
    : { texte: "Ce fichier a changé ailleurs pendant que tu le modifiais. Rien n'a été écrasé : recharge, puis recommence.", genre: "conflit", recharger: true };
  if (e instanceof FicheExiste) return { texte: "Ce nom est déjà pris. Choisis-en un autre.", genre: "existe", recharger: false };
  if (e instanceof FicheVerrouillee) return { texte: "Le fichier est en cours d'utilisation ailleurs. Réessaie dans un instant.", genre: "verrouille", recharger: false };
  if (e instanceof EcritureInvalide) return { texte: e.message, genre: "invalide", recharger: false };
  if (e instanceof AccesRefuse) return { texte: RAISONS[e.raison] || e.message || "Action refusée.", genre: "refus", recharger: e.raison === "acces_retire" };
  if (e instanceof TypeError || (e && /réseau|network|fetch|offline|hors ligne/i.test(String(e.message)))) return { texte: "Pas de connexion : rien n'a été enregistré. Réessaie quand le réseau revient.", genre: "reseau", recharger: false };
  return { texte: "L'enregistrement a échoué : rien n'a été modifié. Réessaie.", genre: "autre", recharger: false };
}
