// Récap du soir : brouillon (prérempli depuis la séance) et fichier Markdown. Le fichier suit le modèle « Modele_Recap_du_soir.md » :
// une tâche planifiée le lit à la lettre pour écrire le compte rendu (voir Automatisation_recap).
import { texteSoins, texteGagnees, texteUtilisees } from "./potions.js?v=0.16.1";
import { finEnTexte } from "./seance.js?v=0.16.1";

const p2 = n => String(n).padStart(2, "0");
export const dateDe = t => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const slug = s => (s || "histoire").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "histoire";
const lignes = t => String(t || "").split("\n").map(x => x.trim()).filter(Boolean);
/** Une ligne de Markdown ne doit jamais en contenir deux : un saut de ligne dans un champ d'en-tête casserait le fichier. */
const une = t => String(t || "").replace(/[\r\n]+/g, " ").trim();

export const nomRecap = r => `Recap_${dateDe(r.at)}_${slug(r.titre)}.md`;

/** Brouillon neuf, prérempli depuis la séance (ou vide si on fait le récap sans avoir joué dans l'application). */
export function nouveauRecap(s, { prenom = "", mj = "", maintenant = Date.now() } = {}) {
  const r = { sid: s ? s.started : "manuel", at: s ? s.started : maintenant, titre: s ? s.titre : "", mj, joueurs: prenom, duree: "", resume: "",
    etapes: "", fin: "", phrases: "", des: "", coeursPerdus: "", armure: "", soins: "", tombee: "Non", gagnes: "", perdus: "", pouvoir: "", compagnons: "",
    lieux: "", personnages: "", creatures: "", regles: "", fils: "", prochaine: "", ressenti: "" };
  if (s) {
    r.duree = String(Math.max(1, Math.round((maintenant - s.started) / 60000)));
    r.etapes = (s.etapes || []).join("\n");
    r.fin = finEnTexte(s, prenom || "l'aventurière"); r.finSrc = r.fin;
    r.phrases = (s.phrases || []).map(x => `« ${x.t} »`).join("\n");
    r.des = (s.jets || []).map(j => `${j.a} + ${j.b} : ${j.ok ? "réussite" : "raté"}${j.a === j.b ? " (double)" : ""}`).join("\n");
    if (s.coeurs0 != null) r.coeursPerdus = String(Math.max(0, s.coeurs0 - s.coeurs));
    r.armure = String(s.armure);
    r.tombee = s.coeurs === 0 ? "Oui" : "Non";
    r.soins = texteSoins(s); r.gagnes = texteGagnees(s); r.perdus = texteUtilisees(s);
  }
  return r;
}

/** Le brouillon gardé est-il celui de cette séance ? Sinon on repart d'un brouillon neuf. Si la fin a changé depuis, elle est mise à jour. */
export function reprendreBrouillon(garde, s, options) {
  const sid = s ? s.started : "manuel";
  if (!garde || garde.sid !== sid) return { recap: nouveauRecap(s, options), change: true };
  const fin = finEnTexte(s, (options && options.prenom) || "l'aventurière");
  if (s && fin !== (garde.finSrc || "")) return { recap: { ...garde, fin, finSrc: fin }, change: true };
  return { recap: garde, change: false };
}

/** Le fichier Markdown du récap. */
export function recapMarkdown(r, prenom = "l'aventurière") {
  const L = (t, ordonne) => { const l = lignes(t); return l.length ? l.map((x, i) => (ordonne ? `${i + 1}. ` : "- ") + x).join("\n") : (ordonne ? "1." : "-"); };
  const date = dateDe(r.at);
  return `---
type: recap
date: ${date}
titre: ${une(r.titre)}
mj: ${une(r.mj)}
statut: brouillon
---
# Récap du soir — ${une(r.titre) || "sans titre"}

## L'essentiel
- **Date :** ${date}
- **Titre de l'histoire (même provisoire) :** ${une(r.titre)}
- **Qui a joué :** ${une(r.joueurs)}
- **MJ :** ${une(r.mj)}
- **Durée environ :** ${r.duree ? une(r.duree) + " min" : ""}
- **Résumé en 3 lignes :** ${une(r.resume)}

## Ce qui s'est passé (dans l'ordre)
${L(r.etapes, true)}

## Comment l'histoire s'est terminée
${(r.fin || "").trim() ? (r.fin || "").trim() : "-"}

## Les idées et les phrases de ${prenom}
${L(r.phrases)}

## Les jets de dés marquants
${L(r.des)}

## Cœurs, armure et soins
- Cœurs perdus : ${une(r.coeursPerdus)}
- Armure : ${une(r.armure)}
- Potions ou soins : ${une(r.soins)}
- Est-elle tombée dans les pommes ? ${une(r.tombee)}

## Ce qu'elle a gagné ou perdu
- Objets gagnés : ${lignes(r.gagnes).join(", ")}
- Objets perdus ou utilisés : ${lignes(r.perdus).join(", ")}
- Nouveau pouvoir ou progression : ${une(r.pouvoir)}

## Compagnon(s) parti(s) avec elle
${L(r.compagnons)}

## Lieux visités
${L(r.lieux)}

## Personnages rencontrés
${L(r.personnages)}

## Créatures rencontrées
${L(r.creatures)}

## Règles improvisées
${L(r.regles)}

## Fils ouverts
${L(r.fils)}

## Pour la prochaine fois
${L(r.prochaine)}

## Mon ressenti de MJ
${L(r.ressenti)}
`;
}
