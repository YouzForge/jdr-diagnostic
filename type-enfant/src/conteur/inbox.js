// Notes du parent (« Inbox ») : une seule page où le parent dépose idées et notes ; un traitement automatique les range ensuite sous « Traité ».
// Logique pure, testée dans Node.
export const TITRE_INBOX = "# Inbox — idées et notes du MJ";

/** Range une nouvelle entrée à la fin de la section « À traiter » (la crée si besoin). Le reste du fichier n'est pas touché. */
export function ajouterAInbox(texte, entree) {
  let t = String(texte || "").trimEnd();
  if (!/^## À traiter\s*$/m.test(t)) t = (t || TITRE_INBOX) + "\n\n## À traiter\n\n## Traité";
  const i = t.search(/^## Traité\s*$/m);
  if (i < 0) return t + "\n\n" + entree + "\n";
  return t.slice(0, i).trimEnd() + "\n\n" + entree + "\n\n" + t.slice(i) + "\n";
}

const p2 = n => String(n).padStart(2, "0");
export const horodatageNote = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** Texte d'une entrée : « ### date », la note, puis « Type » et « À reprendre » si renseignés. */
export function entreeInbox({ date = new Date(), note, type = "", reprendre = [] }) {
  const reprise = reprendre.length ? `\n**À reprendre :** ${reprendre.join(", ")}` : "";
  const ligneType = type ? `\n**Type :** ${type}` : "";
  return `### ${horodatageNote(date)}\n${String(note).trim()}${ligneType}${reprise}`;
}
