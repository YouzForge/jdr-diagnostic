// Rendu Markdown SÛR : produit des blocs de texte, jamais de HTML. L'interface les affiche avec `textContent`.
// Rien n'est interprété comme lien, image, script ou balise : une fiche ne peut donc rien exécuter ni rien charger.

/** « texte **gras** et *italique* » → [{texte}, {texte, gras}, {texte, italique}] */
export function inline(t) {
  const out = [];
  for (const part of String(t).split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/)) {
    if (!part) continue;
    if (/^\*\*[^*]+\*\*$/.test(part)) out.push({ texte: part.slice(2, -2), gras: true });
    else if (/^(\*[^*]+\*|_[^_]+_)$/.test(part)) out.push({ texte: part.slice(1, -1), italique: true });
    else out.push({ texte: part });
  }
  return out;
}

const SEPARATEUR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
const cellules = l => l.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map(c => inline(c.trim().replace(/\\\|/g, "|")));

/**
 * @param {string} corps
 * @param {{titreARetirer?:string}} [o]  le premier « # titre » est retiré s'il répète le nom de la fiche
 * @returns {{t:"h",n:number,texte:string}|{t:"p",morceaux:object[]}|{t:"ul"|"ol",items:object[][]}|{t:"cite",morceaux:object[]}|{t:"table",entetes:object[][],lignes:object[][][]}|{t:"hr"}[]}
 */
export function blocsMarkdown(corps, { titreARetirer } = {}) {
  const lignes = String(corps ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocs = []; let para = [], liste = null, premierTitre = true;
  const finPara = () => { if (para.length) { blocs.push({ t: "p", morceaux: inline(para.join(" ")) }); para = []; } };
  const finListe = () => { if (liste) { blocs.push(liste); liste = null; } };
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i].trimEnd();
    if (!l.trim()) { finPara(); finListe(); continue; }
    let m;
    // Tableau : une ligne « | a | b | », une ligne de séparation « |---|---| », puis des lignes « | … | ». Sinon ce n'est qu'une ligne de texte.
    if (l.trim().startsWith("|") && i + 1 < lignes.length && lignes[i + 1].trim().startsWith("|") && SEPARATEUR.test(lignes[i + 1].trim())) {
      finPara(); finListe();
      const entetes = cellules(l), rangees = [];
      let j = i + 2;
      while (j < lignes.length && lignes[j].trim().startsWith("|")) { rangees.push(cellules(lignes[j])); j++; }
      blocs.push({ t: "table", entetes, lignes: rangees });
      i = j - 1;
      continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.+)$/))) {
      finPara(); finListe();
      const n = m[1].length, texte = m[2].trim();
      if (n === 1 && premierTitre && (!titreARetirer || texte === titreARetirer)) { premierTitre = false; continue; }
      premierTitre = false;
      blocs.push({ t: "h", n: Math.max(2, n), texte });
    } else if (/^(-{3,}|\*{3,})$/.test(l.trim())) { finPara(); finListe(); blocs.push({ t: "hr" }); }
    else if ((m = l.match(/^\s*[-*]\s+(.+)$/))) {
      finPara(); if (!liste || liste.t !== "ul") { finListe(); liste = { t: "ul", items: [] }; }
      liste.items.push(inline(m[1]));
    } else if ((m = l.match(/^\s*\d+[.)]\s+(.+)$/))) {
      finPara(); if (!liste || liste.t !== "ol") { finListe(); liste = { t: "ol", items: [] }; }
      liste.items.push(inline(m[1]));
    } else if ((m = l.match(/^>\s?(.*)$/))) { finPara(); finListe(); blocs.push({ t: "cite", morceaux: inline(m[1]) }); }
    else { finListe(); para.push(l.trim()); }
  }
  finPara(); finListe();
  return blocs;
}
