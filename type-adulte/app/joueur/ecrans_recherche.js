// Recherche globale : tout ce que le joueur peut lire (savoirs, quêtes, journal, rencontres, notes, sac), avec filtres.
// L'index est construit sur les copies déjà lues (src/joueur/recherche.js) ; aucun appel supplémentaire au serveur par frappe.
import { h, icon, message, pastille, choix, surbrillance, extrait, meta, puces } from "./ui.js?v=0.18.0";
import { chercher, grouperParType, valeursDeFiltres, TYPES } from "../../src/joueur/recherche.js?v=0.18.0";

const PAR_GROUPE = 25;

function lien(r) {
  const f = encodeURIComponent(r.id);
  switch (r.type) {
    case "savoirs": return `#/savoirs/${f}`;
    case "quetes": return `#/quetes/${f}`;
    case "notes": return `#/notes/${f}`;
    case "rencontres": return `#/rencontres/${f}`;
    case "sac": return `#/sac/o/${f}`;
    case "journal": return r.session != null ? `#/journal/${r.session}` : "#/journal";
    default: return "#/";
  }
}

export async function ecranRecherche(ctx) {
  const index = await ctx.chargerIndex();
  const e = ctx.etat.recherche;   // { q, types:[], session, lieu, personnage, etiquette }
  const vals = valeursDeFiltres(index);
  const champ = h("input", { class: "jr-recherche-champ gros", type: "search", value: e.q, placeholder: "Chercher dans tout ce que tu sais", "aria-label": "Recherche", autocomplete: "off", autocapitalize: "off", enterkeyhint: "search" });
  const puceTypes = h("div", { class: "jr-puces filtre large", role: "group", "aria-label": "Types" });
  const sortie = h("div", { class: "jr-resultats", "aria-live": "polite" });
  let minuteur = 0;

  const dessiner = () => {
    e.q = champ.value;
    puceTypes.replaceChildren(...TYPES.map(([id, libelle]) => pastille(libelle, { actif: e.types.includes(id), onclick: () => { e.types = e.types.includes(id) ? e.types.filter(x => x !== id) : [...e.types, id]; dessiner(); } })));
    const filtres = !!(e.types.length || e.session !== "" || e.lieu || e.personnage || e.etiquette);
    if (!e.q.trim() && !filtres) { sortie.replaceChildren(h("p", { class: "jr-vide" }, "Tape un mot, ou choisis un filtre.")); return; }
    const res = chercher(index, e.q, { types: e.types, sessions: e.session === "" ? null : [Number(e.session)], etiquette: e.etiquette, lieu: e.lieu, personnage: e.personnage });
    if (!res.length) { sortie.replaceChildren(h("p", { class: "jr-vide" }, "Rien ne correspond.")); return; }
    sortie.replaceChildren(h("div", { class: "jr-meta" }, `${res.length} résultat${res.length > 1 ? "s" : ""}`),
      ...grouperParType(res).map(g => h("section", { class: "jr-groupe" }, h("h3", null, `${g.libelle} (${g.resultats.length})`),
        h("ul", { class: "jr-cartes" }, g.resultats.slice(0, PAR_GROUPE).map(r => h("li", null, h("a", { class: "jr-carte", href: lien(r) },
          h("div", { class: "jr-carte-tete" }, h("span", { class: "jr-carte-titre" }, surbrillance(r.titre, e.q))),
          meta(r), r.texte ? h("div", { class: "jr-carte-extrait" }, surbrillance(extrait(r.texte, e.q, 120), e.q)) : null, puces(r.etiquettes))))),
        g.resultats.length > PAR_GROUPE ? h("p", { class: "jr-vide" }, `et ${g.resultats.length - PAR_GROUPE} autres : précise ta recherche.`) : null)));
  };
  champ.addEventListener("input", () => { clearTimeout(minuteur); minuteur = setTimeout(dessiner, 120); });
  const opt = (liste, tous = "Tous") => [["", tous], ...liste.map(v => [String(v), String(v)])];
  const filtres = h("details", { class: "jr-reglages", open: !!(e.session !== "" || e.lieu || e.personnage || e.etiquette) },
    h("summary", null, icon("sliders", 18), "Filtres"),
    h("div", { class: "jr-reglages-corps" },
      vals.sessions.length ? choix("Session", e.session, [["", "Toutes"], ...vals.sessions.map(s => [String(s), `Session ${s}`])], v => { e.session = v; dessiner(); }) : null,
      vals.lieux.length ? choix("Lieu", e.lieu, opt(vals.lieux), v => { e.lieu = v; dessiner(); }) : null,
      vals.personnages.length ? choix("Personnage", e.personnage, opt(vals.personnages), v => { e.personnage = v; dessiner(); }) : null,
      vals.etiquettes.length ? choix("Étiquette", e.etiquette, opt(vals.etiquettes), v => { e.etiquette = v; dessiner(); }) : null,
      h("button", { class: "jr-bouton", onclick: () => { Object.assign(e, { q: "", types: [], session: "", lieu: "", personnage: "", etiquette: "" }); champ.value = ""; dessiner(); } }, "Tout effacer")));
  dessiner();
  const noeud = h("div", { class: "jr-page" },
    h("div", { class: "jr-filtre" }, icon("search", 18), champ),
    puceTypes, filtres, index.length ? null : message("Il n'y a encore rien à chercher.", "info"), sortie);
  setTimeout(() => { if (!e.q) champ.focus(); }, 60);
  return { onglet: null, node: noeud, titre: "Recherche" };
}
