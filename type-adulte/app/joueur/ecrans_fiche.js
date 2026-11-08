// Écrans « Fiche » et « Compétences » : lecture seule (tranche 1). Un appui sur une valeur ouvre la fenêtre de jet.
import { h, icon, message, NOMBRE } from "./ui.js";
import { ouvrirJet } from "./jet.js";
import { aplatir } from "../../src/joueur/recherche.js";

const vide = texte => ({ node: h("div", { class: "jr-page" }, message(texte, "info")) });

function avertir(r) { return r && r.perime ? message("Copie enregistrée sur ce téléphone : la connexion ne répond pas.", "alerte") : null; }

/** Tuile de la fiche : valeur en grand ; devient un bouton de jet si `jet` est donné. */
function tuile({ libelle, valeur, ic, jet, ctx, detail }) {
  const contenu = [h("div", { class: "jr-tuile-ic" }, icon(ic, 20)), h("div", { class: "jr-tuile-val" }, NOMBRE(valeur)), h("div", { class: "jr-tuile-lib" }, libelle)];
  if (jet && valeur != null) return h("button", { class: "jr-tuile jet", "aria-label": `${libelle} ${valeur} : lancer un jet`, onclick: () => ouvrirJet(ctx, { titre: libelle, valeur, detail }) }, contenu, h("div", { class: "jr-tuile-jet" }, icon("dice", 14), "jet"));
  return h("div", { class: "jr-tuile" }, contenu);
}

export async function ecranFiche(ctx) {
  const r = await ctx.charger();
  const f = r.fiche;
  if (!f) return { onglet: "fiche", ...vide("Ta fiche n'est pas encore dans ton dossier. Demande au MJ de la déposer.") };
  const pv = f.pv != null && f.pvMax ? Math.max(0, Math.min(100, Math.round((f.pv / f.pvMax) * 100))) : null;
  const identite = [f.classe ? f.classe.nom : "", ...f.identite].filter(Boolean);
  const carac = f.caracteristiques.filter(c => c.valeur != null);
  const page = h("div", { class: "jr-page" },
    avertir(r),
    h("header", { class: "jr-entete-fiche" }, h("h2", { class: "jr-nom-grand" }, f.nom || "—"), identite.length ? h("div", { class: "jr-meta" }, identite.join(" · ")) : null),
    h("div", { class: "jr-tuiles" },
      h("div", { class: "jr-tuile pv" }, h("div", { class: "jr-tuile-ic" }, icon("heart", 20)), h("div", { class: "jr-tuile-val" }, f.pv != null ? (f.pvMax ? `${f.pv}/${f.pvMax}` : String(f.pv)) : "—"), h("div", { class: "jr-tuile-lib" }, "Points de vie"),
        pv != null ? h("div", { class: "jr-pvbarre", role: "img", "aria-label": `${pv} % des points de vie` }, h("div", { style: `width:${pv}%` })) : null),
      tuile({ libelle: "Armure", valeur: f.armure, ic: "shield", ctx }),
      tuile({ libelle: "Chance", valeur: f.chance, ic: "clover", jet: true, ctx, detail: "Chance" }),
      tuile({ libelle: "Idée", valeur: f.idee, ic: "bulb", jet: true, ctx, detail: "Idée" })),
    carac.length ? h("section", { class: "jr-bloc" }, h("h3", null, "Caractéristiques"),
      h("div", { class: "jr-caracs" }, carac.map(c =>
        h("button", { class: "jr-carac", "aria-label": `${c.nom} ${c.sur100} sur 100, ${c.valeur} sur 20 : lancer un jet`, onclick: () => ouvrirJet(ctx, { titre: c.nom, valeur: c.sur100, detail: `Caractéristique · ${c.valeur} sur 20` }) },
          h("span", { class: "jr-carac-nom" }, c.nom),
          h("span", { class: "jr-valeur grand" }, `${c.sur100}`),
          h("span", { class: "jr-carac-bas" }, `${c.valeur} / 20`))))) : null,
    f.quetePerso ? h("section", { class: "jr-bloc" }, h("h3", null, "Quête personnelle"), h("p", { class: "jr-texte" }, f.quetePerso)) : null,
    f.avertissements.length ? h("details", { class: "jr-remarques" }, h("summary", null, "Remarques sur la fiche"), h("ul", null, f.avertissements.map(a => h("li", null, a)))) : null);
  return { onglet: "fiche", node: page, portrait: f.portrait };
}

/** Une ligne de compétence. */
function ligneCompetence(ctx, c) {
  const nom = h("span", { class: "jr-ligne-nom" }, c.nom, c.liens ? h("small", null, c.liens) : null);
  if (c.valeur == null) return h("li", { class: "jr-ligne inerte", "data-nom": aplatir(c.nom) }, nom, h("span", { class: "jr-valeur nul" }, "—"));
  return h("li", { "data-nom": aplatir(c.nom) }, h("button", { class: "jr-ligne", "aria-label": `${c.nom} ${c.valeur} : lancer un jet`, onclick: () => ouvrirJet(ctx, { titre: c.nom, valeur: c.valeur, detail: [c.groupe, c.note].filter(Boolean).join(" · ") }) },
    nom, h("span", { class: "jr-valeur" }, `${c.valeur}`)));
}

export async function ecranCompetences(ctx) {
  const r = await ctx.charger();
  const f = r.fiche;
  if (!f) return { onglet: "competences", ...vide("Ta fiche n'est pas encore dans ton dossier.") };
  const groupes = [];
  if (f.bloc && f.bloc.competences.length) groupes.push({ titre: f.bloc.titre, classe: "bloc", liste: f.bloc.competences });
  const ordre = new Map();
  for (const c of f.competences) { const k = c.groupe || "Autres"; if (!ordre.has(k)) ordre.set(k, []); ordre.get(k).push(c); }
  for (const [titre, liste] of ordre) groupes.push({ titre, liste });
  if (f.speciales.length) groupes.push({ titre: "Compétences spéciales", classe: "speciales", liste: f.speciales });
  if (!groupes.length) return { onglet: "competences", ...vide("Aucune compétence dans ta fiche pour l'instant.") };

  const sections = groupes.map(g => {
    const ul = h("ul", { class: "jr-lignes" }, g.liste.map(c => ligneCompetence(ctx, c)));
    const s = h("section", { class: "jr-bloc " + (g.classe || "") }, h("h3", null, g.titre), ul);
    return s;
  });
  const vide0 = h("p", { class: "jr-vide", hidden: true }, "Aucune compétence ne correspond.");
  const filtre = h("input", { class: "jr-recherche-champ", type: "search", placeholder: "Filtrer les compétences", "aria-label": "Filtrer les compétences", autocomplete: "off", enterkeyhint: "search",
    oninput: () => {
      const q = aplatir(filtre.value);
      let total = 0;
      for (const s of sections) {
        let n = 0;
        for (const li of s.querySelectorAll("li")) { const ok = !q || (li.dataset.nom || "").includes(q); li.hidden = !ok; if (ok) n++; }
        s.hidden = n === 0; total += n;
      }
      vide0.hidden = total > 0;
    } });
  return { onglet: "competences", portrait: f.portrait, node: h("div", { class: "jr-page" }, avertir(r), h("div", { class: "jr-filtre" }, icon("search", 18), filtre), sections, vide0) };
}
