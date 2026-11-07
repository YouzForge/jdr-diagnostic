// Catalogue des objets d'un JDR conteur (couleur + icône fixes pour chaque objet). Il vient du profil : modules.objets.catalogue.
//   { id, nom, couleur "#rrggbb", icone, motif (expression régulière, texte), equipe (porté sur le héros), emojis[] }
export const COULEUR_OBJET_DEFAUT = "#2F7F6F";

/** Catalogue prêt à l'emploi : les motifs texte deviennent des expressions régulières (sans respect de la casse). */
export function preparerCatalogue(liste) {
  return (Array.isArray(liste) ? liste : []).map(o => {
    let motif = null;
    try { motif = o.motif ? new RegExp(o.motif, "i") : null; } catch { motif = null; }
    return { id: o.id, nom: o.nom, couleur: o.couleur, icone: o.icone || "star", motif, equipe: o.equipe === true, emojis: Array.isArray(o.emojis) ? o.emojis : [] };
  });
}

/** Retrouve un objet à partir d'une ligne d'inventaire (« ⚔️ Épée », « Casque en fer : porté »). */
export function trouverObjet(catalogue, texte) {
  return (catalogue || []).find(o => o.motif && o.motif.test(String(texte ?? ""))) || null;
}

/** Texte lisible (encre sombre) ou blanc sur la couleur donnée, selon sa luminosité. */
export function encreSur(hex) {
  const n = parseInt(String(hex).slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.58 ? "#3A2618" : "#FFFFFF";
}

const plat = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").toLowerCase();

/** Apparence d'une fiche d'objet : couleur et icône du catalogue, sinon selon sa catégorie. */
export function aspectObjet(catalogue, nom, categorie) {
  const o = trouverObjet(catalogue, nom);
  if (o) return { couleur: o.couleur, icone: o.icone, encre: encreSur(o.couleur) };
  const t = plat(categorie);
  const icone = /arme/.test(t) ? "sword" : /armure/.test(t) ? "helmet" : /soin|potion/.test(t) ? "potion" : /souvenir|lettre|carte/.test(t) ? "note" : "star";
  return { couleur: COULEUR_OBJET_DEFAUT, icone, encre: "#FFFFFF" };
}
