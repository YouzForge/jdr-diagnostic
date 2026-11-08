// Fenêtre de jet d100 : compétence, caractéristique, chance, idée, ou jet libre (sans valeur à atteindre).
// Règles : src/joueur/d100.js (profil). Si le profil n'écrit pas la règle de réussite, un jet CONTRE une valeur est refusé : le moteur ne devine pas une règle de jeu.
import { h, icon, feuille, message } from "./ui.js";
import { lancer, categorie, bandes, phraseSeuil, remarque, estReussite, LIBELLES, CATEGORIES } from "../../src/joueur/d100.js";

const COULEUR = { reussite_critique: "var(--vert-vif)", reussite: "var(--vert)", echec: "var(--orange)", echec_critique: "var(--rouge)" };
const reduit = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

/** Barre à quatre zones ; `jet` (facultatif) place le repère. */
export function barreZones(valeur, regles, jet = null) {
  const b = bandes(valeur, regles);
  const barre = h("div", { class: "jr-barre", role: "img", "aria-label": `${phraseSeuil(valeur)} ; réussite critique de 1 à ${regles.critiqueReussiteMax} ; échec critique de ${regles.critiqueEchecMin} à 100` });
  for (const cat of CATEGORIES) if (b[cat] > 0) barre.append(h("div", { class: "jr-zone", style: `flex:${b[cat]} 1 0;background:${COULEUR[cat]}` }));
  const repere = h("div", { class: "jr-repere" + (jet == null ? " cache" : ""), style: jet == null ? "" : `left:${jet - 0.5}%` }, h("span", null, jet == null ? "" : String(jet)));
  const habillage = h("div", { class: "jr-barre-bloc" }, barre, repere,
    h("div", { class: "jr-barre-echelle" }, h("span", null, "1"), h("span", { style: `left:${Math.max(8, Math.min(92, Math.floor(valeur)))}%` }, String(Math.floor(valeur))), h("span", null, "100")));
  habillage.placer = n => { repere.classList.remove("cache"); repere.style.left = `${n - 0.5}%`; repere.firstChild.textContent = String(n); };
  return habillage;
}

/** Légende des quatre zones : « Réussite critique 1–5 », « Réussite 6–60 », « Échec 61–94 », « Échec critique 95–100 ». */
function legende(valeur, regles) {
  const b = bandes(valeur, regles);
  let debut = 1;
  const lignes = [];
  for (const cat of CATEGORIES) { if (b[cat] <= 0) continue; const fin = debut + b[cat] - 1; lignes.push([cat, debut === fin ? `${debut}` : `${debut}–${fin}`]); debut = fin + 1; }
  return h("ul", { class: "jr-legende" }, lignes.map(([cat, plage]) => h("li", null, h("span", { class: "jr-pastille-zone", style: `background:${COULEUR[cat]}` }), `${LIBELLES[cat]} ${plage}`)));
}

/**
 * Ouvre la fenêtre de jet.
 * @param {{titre:string, valeur?:number|null, detail?:string}} o  `valeur` absente ou null : jet libre.
 */
export function ouvrirJet(ctx, { titre, valeur = null, detail = "" }) {
  const regles = ctx.regles;
  const libre = valeur == null;
  if (!libre && !regles.definie) {
    return feuille(titre, [message("La règle de réussite de ce jeu n'est pas encore écrite dans le profil : le jet est désactivé tant que le MJ ne l'a pas fixée.", "alerte")]);
  }
  const seuil = libre ? null : Math.floor(valeur);
  const nombre = h("div", { class: "jr-grand-jet", "aria-live": "polite" }, "—");
  const verdict = h("div", { class: "jr-verdict", "aria-live": "polite" }, "");
  const note = h("div", { class: "jr-note" }, "");
  const barre = libre ? null : barreZones(seuil, regles);
  const historique = h("ol", { class: "jr-histo", "aria-label": "Derniers jets" });
  const dessinerHistorique = () => historique.replaceChildren(...ctx.historique.slice(0, 6).map(x => h("li", { class: x.cat ? (estReussite(x.cat) ? "ok" : "ko") : "" }, h("b", null, String(x.jet)), h("span", null, x.titre + (x.seuil != null ? ` (${x.seuil})` : "")))));
  dessinerHistorique();
  let enCours = false;
  const bouton = h("button", { class: "jr-bouton gros", onclick: async () => {
    if (enCours) return;
    enCours = true; bouton.disabled = true;
    const jet = lancer();
    verdict.textContent = ""; note.textContent = ""; verdict.style.color = "";
    if (!reduit()) {
      for (let i = 0; i < 9; i++) { nombre.textContent = String(1 + Math.floor(Math.random() * 100)); await new Promise(r => setTimeout(r, 55 + i * 12)); }
    }
    nombre.textContent = String(jet);
    let cat = null;
    if (!libre) {
      cat = categorie(jet, seuil, regles);
      verdict.textContent = LIBELLES[cat]; verdict.style.color = COULEUR[cat];
      note.textContent = remarque(jet, seuil, regles);
      barre.placer(jet);
    } else if (jet <= regles.critiqueReussiteMax) { verdict.textContent = "Zone de réussite critique"; verdict.style.color = COULEUR.reussite_critique; }
    else if (jet >= regles.critiqueEchecMin) { verdict.textContent = "Zone d'échec critique"; verdict.style.color = COULEUR.echec_critique; }
    ctx.historique.unshift({ jet, cat, titre, seuil });
    if (ctx.historique.length > 20) ctx.historique.length = 20;
    dessinerHistorique();
    if (navigator.vibrate) try { navigator.vibrate(cat === "reussite_critique" || cat === "echec_critique" ? [40, 40, 40] : 30); } catch { /* sans importance */ }
    bouton.textContent = "Relancer"; bouton.disabled = false; enCours = false;
  } }, icon("dice", 22), "Lancer");
  const corps = [
    detail ? h("div", { class: "jr-jet-detail" }, detail) : null,
    libre ? h("p", { class: "jr-phrase" }, "Jet libre : un d100, sans valeur à atteindre.") : h("p", { class: "jr-phrase" }, phraseSeuil(seuil)),
    barre, nombre, verdict, note, libre ? null : legende(seuil, regles), h("div", { class: "jr-jet-actions" }, bouton),
    h("div", { class: "jr-histo-bloc" }, h("div", { class: "jr-kicker" }, "Derniers jets"), historique)
  ];
  return feuille(titre, corps);
}
