// Décision du geste sur la bande d'onglets : un appui suit le lien, un tirage vertical ouvre ou ferme le panneau. Fonctions pures (testées).
/** Au-delà de ce déplacement (px), ce n'est plus un appui : le clic qui suit le doigt levé est ignoré. */
export const SEUIL_APPUI = 8;
/** Distance verticale (px) à partir de laquelle le doigt « tire » le panneau. */
export const SEUIL_TIRE = 12;
/** Distance minimale (px) pour que le panneau s'ouvre / se ferme au relâchement. */
export const SEUIL_OUVRIR = 48;
export const SEUIL_FERMER = 56;

/**
 * Nature du mouvement depuis la pose du doigt. dx, dy en px ; dy > 0 = vers le haut.
 * "appui" : presque immobile · "tire" : mouvement vertical net · "autre" : glissé de côté ou en diagonale (ni appui ni tirage).
 */
export function nature(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) <= SEUIL_APPUI) return "appui";
  if (ay >= SEUIL_TIRE && ay > ax * 1.5) return "tire";
  return "autre";
}

/** Résultat d'un tirage au relâchement. `ouvert` : le panneau est ouvert (on ne peut que le fermer, en tirant vers le bas). */
export function issue(ouvert, dy) {
  if (!ouvert) return dy >= SEUIL_OUVRIR ? "ouvrir" : "rien";
  return dy <= -SEUIL_FERMER ? "fermer" : "rien";
}
