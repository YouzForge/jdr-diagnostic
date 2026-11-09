// Écrans « Fiche » et « Compétences ». Un appui sur une valeur ouvre la fenêtre de jet. Si le joueur peut écrire (tranche 2) : les points de vie se règlent avec − et +.
import { h, icon, message, NOMBRE } from "./ui.js?v=0.17.0";
import { peut, executer } from "./edition.js?v=0.17.0";
import { ouvrirJet } from "./jet.js?v=0.17.0";
import { aplatir } from "../../src/joueur/recherche.js?v=0.17.0";

const vide = texte => ({ node: h("div", { class: "jr-page" }, message(texte, "info")) });

function avertir(r) { return r && r.perime ? message("Copie enregistrée sur ce téléphone : la connexion ne répond pas.", "alerte") : null; }

/** Tuile de la fiche : valeur en grand ; devient un bouton de jet si `jet` est donné. */
function tuile({ libelle, valeur, ic, jet, ctx, detail }) {
  const contenu = [h("div", { class: "jr-tuile-ic" }, icon(ic, 20)), h("div", { class: "jr-tuile-val" }, NOMBRE(valeur)), h("div", { class: "jr-tuile-lib" }, libelle)];
  if (jet && valeur != null) return h("button", { class: "jr-tuile jet", "aria-label": `${libelle} ${valeur} : lancer un jet`, onclick: () => ouvrirJet(ctx, { titre: libelle, valeur, detail }) }, contenu, h("div", { class: "jr-tuile-jet" }, icon("dice", 14), "jet"));
  return h("div", { class: "jr-tuile" }, contenu);
}

const DELAI_PV_MS = 900;   // les appuis sur − et + sont regroupés : une seule écriture quand le doigt s'arrête

/** Tuile des points de vie. Joueur qui peut écrire : boutons − et +, un seul enregistrement après une courte pause ; en cas d'échec la valeur revient à celle de la fiche. */
function tuilePV(ctx, f) {
  const ecrire = peut(ctx) && f.pv != null;
  let enregistre = f.pv, souhait = f.pv, minuterie = null, enCours = Promise.resolve();
  const valeur = h("div", { class: "jr-tuile-val" });
  const barre = h("div", { class: "jr-pvbarre", role: "img" }, h("div"));
  const etat = h("div", { class: "jr-pv-etat", role: "status" });
  const moins = ecrire ? h("button", { class: "jr-pv-bouton", type: "button", "aria-label": "Retirer un point de vie", onclick: () => regler(-1) }, icon("minus", 22)) : null;
  const plus = ecrire ? h("button", { class: "jr-pv-bouton", type: "button", "aria-label": "Ajouter un point de vie", onclick: () => regler(1) }, icon("plus", 22)) : null;
  function dessiner() {
    valeur.textContent = souhait != null ? (f.pvMax ? `${souhait}/${f.pvMax}` : String(souhait)) : "—";
    const p = souhait != null && f.pvMax ? Math.max(0, Math.min(100, Math.round((souhait / f.pvMax) * 100))) : null;
    barre.hidden = p == null;
    if (p != null) { barre.firstChild.style.width = `${p}%`; barre.setAttribute("aria-label", `${p} % des points de vie`); }
    if (moins) moins.disabled = souhait <= 0;
    if (plus) plus.disabled = f.pvMax != null && souhait >= f.pvMax;
  }
  function regler(delta) {
    const n = souhait + delta;
    if (n < 0 || (f.pvMax != null && n > f.pvMax)) return;
    souhait = n; dessiner(); etat.textContent = "";
    clearTimeout(minuterie);
    minuterie = setTimeout(envoyer, DELAI_PV_MS);
  }
  function envoyer() {
    enCours = enCours.then(async () => {
      if (souhait === enregistre) return;
      const cible = souhait;
      etat.textContent = "Enregistrement…";
      const r = await executer(ctx, () => ctx.donnees.changerPV(cible));
      if (r.ok) { enregistre = cible; ctx.vider(); etat.textContent = souhait === cible ? "Enregistré" : ""; }
      else { if (souhait === cible) { souhait = enregistre; dessiner(); } etat.replaceChildren(h("span", { class: "jr-pv-erreur" }, r.m.texte)); }
    });
  }
  dessiner();
  // Sans écriture : la tuile reste celle de la tranche 1.
  return h("div", { class: "jr-tuile pv" + (ecrire ? " reglable" : "") }, h("div", { class: "jr-tuile-ic" }, icon("heart", 20)),
    ecrire ? h("div", { class: "jr-pv-ligne" }, moins, valeur, plus) : valeur,
    h("div", { class: "jr-tuile-lib" }, "Points de vie"), barre, ecrire ? etat : null);
}

export async function ecranFiche(ctx) {
  const r = await ctx.charger();
  const f = r.fiche;
  if (!f) return { onglet: "fiche", ...vide("Ta fiche n'est pas encore dans ton dossier. Demande au MJ de la déposer.") };
  const identite = [f.classe ? f.classe.nom : "", ...f.identite].filter(Boolean);
  const carac = f.caracteristiques.filter(c => c.valeur != null);
  const page = h("div", { class: "jr-page" },
    avertir(r),
    h("header", { class: "jr-entete-fiche" }, h("h2", { class: "jr-nom-grand" }, f.nom || "—"), identite.length ? h("div", { class: "jr-meta" }, identite.join(" · ")) : null),
    h("div", { class: "jr-tuiles" + (peut(ctx) && f.pv != null ? " ecriture" : "") },
      tuilePV(ctx, f),
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
