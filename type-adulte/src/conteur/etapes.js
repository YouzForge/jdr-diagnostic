// Lecture des histoires du « conteur » (JDR pour enfant) : étapes de jeu, texte brut, sections de règles.
// Logique pure (aucun navigateur) : tout est testé dans Node.
import { sections } from "../md/doc.js?v=0.16.1";

/** Texte lu à voix haute : sans marques Markdown. */
export function plain(md) {
  return String(md ?? "").replace(/^#+\s*/gm, "").replace(/[*_`>|]/g, "").replace(/^\s*[-]\s+/gm, "").replace(/\n{2,}/g, ". ").replace(/\n/g, " ").trim();
}

/** Titre de la section des étapes : « Étapes de jeu », avec ou sans remarque entre parenthèses. */
export const estTitreEtapes = t => /^[ée]tapes?(\s+de\s+jeu)?(\s*[(:\-–—].*)?\s*$/i.test((t || "").trim());

/**
 * Étapes de jeu d'une histoire : section « ## Étapes de jeu », une « ### Étape N — Titre » par étape.
 * Chaque étape : lignes « - **Libellé :** texte » suivies de sous-puces. Une ligne libre (remarque en italique) est gardée comme note.
 * → [{title, fields:[{label, text, items[], note?}]}]
 */
export function lireEtapes(corps) {
  const sec = sections(String(corps ?? "")).find(s => estTitreEtapes(s.title));
  if (!sec) return [];
  return sec.text.split(/\n(?=### )/).filter(t => /^### /.test(t)).map(t => {
    const lignes = t.split("\n");
    const title = lignes[0].replace(/^###\s*/, "").replace(/^[ée]tape\s*\d+\s*[—–:-]\s*/i, "").trim();
    const fields = [];
    for (const brut of lignes.slice(1)) {
      if (!brut.trim()) continue;
      const haut = brut.match(/^[-*]\s+\*\*(.+?)\s*:?\s*\*\*\s*:?\s*(.*)$/);
      const sous = brut.match(/^\s{2,}[-*]\s+(.*)$/);
      if (haut) fields.push({ label: haut[1].trim(), text: haut[2].trim(), items: [] });
      else if (sous && fields.length) fields[fields.length - 1].items.push(sous[1].trim());
      else if (/^\s{2,}\S/.test(brut) && fields.length) {          // suite d'une ligne qui passe à la ligne
        const f = fields[fields.length - 1];
        if (f.items.length) f.items[f.items.length - 1] += " " + brut.trim(); else f.text = (f.text + " " + brut.trim()).trim();
      } else {
        const note = brut.trim().replace(/^[*_]+|[*_]+$/g, "").trim();
        if (note) fields.push({ label: "", text: note, items: [], note: true });
      }
    }
    return { title, fields };
  });
}

/** Sections « ### 4.x » du fichier de règles, pour l'aide « Règles en bref » (une seule source : le fichier maître). */
export function sectionsDeRegles(texte, voulues) {
  return String(texte ?? "").split(/\n(?=### )/).filter(p => voulues.some(w => p.startsWith("### " + w + " ") || p === "### " + w));
}
