// Accueil du MJ : lecture des fichiers de LIEU (les documents qui contiennent tout ce qui peut se passer dans une ville ou un lieu) et des fichiers
// de SESSION DE JEU (la préparation courte de la prochaine séance). Sans DOM, sans réseau : tout se teste dans Node.
//
// Un lieu se range par son numéro (« 07a - Grimforge » : 07, puis 07a), tiré de l'en-tête `numero` ou, à défaut, du début du nom de fichier.
// L'état d'un lieu (`etat`) est écrit par le MJ : « idée » (à peine esquissé), « à venir » (ou « en attente »), « en cours » (plusieurs séances), « joué ». Absent = non renseigné,
// jamais deviné. Une session de jeu a un `statut` : « idée », « prête » ou « jouée » ; la « session à venir » est la première session « prête ».
import { parseDoc, norm, intOf, humanize } from "../md/doc.js";

const t = v => (v == null ? "" : String(v).trim());

/** États d'un lieu, dans l'ordre d'affichage. `cle` sert aux filtres, `libelle` à l'affichage. */
export const ETATS_LIEU = [
  { cle: "idee", libelle: "Idée" },
  { cle: "a_venir", libelle: "À venir" },
  { cle: "en_cours", libelle: "En cours" },
  { cle: "joue", libelle: "Joué" }
];
const SYNONYMES_ETAT = {
  idee: ["idee", "piste", "brouillon", "a developper", "a ecrire"],
  a_venir: ["a venir", "en attente", "attente", "prevu", "non joue", "a jouer"],
  en_cours: ["en cours", "commence", "entame"],
  joue: ["joue", "jouee", "termine", "terminee", "fini", "finie", "fait", "faite"]
};
/** Valeur écrite par le MJ → clé d'état, ou "" (rien d'écrit), ou "?" (valeur non reconnue : montrée telle quelle, jamais remplacée par un état voisin). */
export function cleEtat(valeur) {
  const v = norm(t(valeur)).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!v) return "";
  for (const [cle, mots] of Object.entries(SYNONYMES_ETAT)) if (mots.includes(v)) return cle;
  return "?";
}

/** Statuts d'une session de jeu. */
export const STATUTS_SESSION = [
  { cle: "idee", libelle: "Idée" },
  { cle: "prete", libelle: "Prête" },
  { cle: "jouee", libelle: "Jouée" }
];
const SYNONYMES_STATUT = { idee: ["idee", "a preparer", "brouillon"], prete: ["prete", "pret", "preparee", "a jouer", "en attente"], jouee: ["jouee", "joue", "terminee", "termine", "fait", "faite"] };
export function cleStatut(valeur) {
  const v = norm(t(valeur)).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!v) return "";
  for (const [cle, mots] of Object.entries(SYNONYMES_STATUT)) if (mots.includes(v)) return cle;
  return "?";
}

/** « 07a - GAO_Module » → [7, "a"] ; sans numéro → null. */
export function numeroDeFichier(nom) {
  const m = String(nom).match(/^\s*(\d{1,4})\s*([a-z])?(?![a-z0-9])/i);
  return m ? [Number(m[1]), (m[2] || "").toLowerCase()] : null;
}

/** Clé d'ordre : (numéro, lettre, nom). Sans numéro : à la fin, par nom. */
function comparer(a, b) {
  const na = a.ordre, nb = b.ordre;
  if (na && nb) { if (na[0] !== nb[0]) return na[0] - nb[0]; if (na[1] !== nb[1]) return na[1] < nb[1] ? -1 : 1; }
  else if (na) return -1;
  else if (nb) return 1;
  return a.fichier.localeCompare(b.fichier, "fr", { numeric: true });
}
export const trierParNumero = liste => [...liste].sort(comparer);

/** Titres de niveau 2 d'un texte (sommaire). Les titres dans un bloc de code ne comptent pas (il n'y en a pas dans nos fichiers : le Markdown du moteur n'a pas de code). */
export function titresDe(corps) {
  const out = [];
  for (const l of String(corps ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const m = l.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (m) out.push({ niveau: m[1].length, titre: m[2] });
  }
  return out;
}

/**
 * Un lieu, pour la liste de l'accueil. Le texte complet n'est pas gardé : on garde de quoi ranger, filtrer, chercher et annoncer (taille, sections).
 * @returns {{fichier, titre, numero:string, ordre:[number,string]|null, type, region, etat:string, etatBrut:string, caracteres:number, sections:string[], secrets:boolean}}
 */
export function lireLieuMJ(contenu, fichier) {
  const d = parseDoc(contenu);
  const m = d.meta;
  const ordre = intOf(m.numero) != null ? [intOf(m.numero), ""] : numeroDeFichier(fichier);
  const titres = titresDe(d.body);
  return {
    fichier, titre: t(m.titre) || t(m.nom) || d.title || humanize(fichier),
    numero: ordre ? String(ordre[0]).padStart(2, "0") + ordre[1] : "",
    ordre, type: t(m.type), region: t(m.region),
    etat: cleEtat(m.etat), etatBrut: t(m.etat),
    caracteres: d.body.length, sections: titres.filter(x => x.niveau === 2).map(x => x.titre),
    secrets: titres.some(x => /🔴|secret/i.test(x.titre))
  };
}

/** Une session de jeu (préparation courte de la prochaine séance). */
export function lireSessionMJ(contenu, fichier) {
  const d = parseDoc(contenu);
  const m = d.meta;
  const numero = intOf(m.numero);
  const ordre = numero != null ? [numero, ""] : numeroDeFichier(fichier);
  return {
    fichier, titre: t(m.titre) || t(m.nom) || d.title || humanize(fichier),
    saison: intOf(m.saison), numero: ordre ? ordre[0] : null, ordre,
    lieu: t(m.lieu), date: t(m.date), table: t(m.table),
    statut: cleStatut(m.statut), statutBrut: t(m.statut),
    caracteres: d.body.length, sections: titresDe(d.body).filter(x => x.niveau === 2).map(x => x.titre)
  };
}

/** Les sessions rangées par saison puis numéro (les sans-saison avant). */
export function trierSessions(liste) {
  return [...liste].sort((a, b) => ((a.saison ?? -1) - (b.saison ?? -1)) || comparer(a, b));
}

/** La session à venir : la première session « prête » (saison puis numéro). `autres` : combien d'autres sont aussi prêtes (à signaler, jamais choisies au hasard en silence). */
export function sessionAVenir(sessions) {
  const pretes = trierSessions(sessions.filter(s => s.statut === "prete"));
  return pretes.length ? { session: pretes[0], autres: pretes.length - 1 } : null;
}

/** Filtre de la liste des lieux : `etat` ("" = tous, une clé d'état, "sans" = non renseigné, "inconnu" = valeur non reconnue) et `texte` (titre, région, type, numéro, sans accent ni casse). */
export function filtrerLieux(lieux, { etat = "", texte = "" } = {}) {
  const q = norm(t(texte));
  return lieux.filter(l => {
    if (etat === "sans" ? l.etat !== "" : etat === "inconnu" ? l.etat !== "?" : etat && l.etat !== etat) return false;
    if (!q) return true;
    return norm([l.titre, l.region, l.type, l.numero, l.fichier].join(" ")).includes(q);
  });
}

/** Comptes par état, pour les pastilles de filtre : { tous, idee, a_venir, en_cours, joue, sans, inconnu }. */
export function compterEtats(lieux) {
  const c = { tous: lieux.length, idee: 0, a_venir: 0, en_cours: 0, joue: 0, sans: 0, inconnu: 0 };
  for (const l of lieux) { if (l.etat === "") c.sans++; else if (l.etat === "?") c.inconnu++; else c[l.etat]++; }
  return c;
}
