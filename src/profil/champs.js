// Types de champs d'une collection : text, int, bool, image, area, visibilite,
// enum:a|b|c, ref:<collection>, list:<type>.

export const TYPES_SIMPLES = ["text", "int", "bool", "image", "area", "visibilite"];

/** Décompose un type de champ. Retourne { genre, valeur }. */
export function analyserType(t) {
  if (typeof t !== "string" || t === "") return { genre: "inconnu", valeur: "" };
  const i = t.indexOf(":");
  if (i === -1) return { genre: t, valeur: "" };
  return { genre: t.slice(0, i), valeur: t.slice(i + 1) };
}
