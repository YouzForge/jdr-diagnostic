// Application « conteur » (JDR pour enfant) : coque, routeur, mode enfant par défaut et mode parent derrière un appui long.
// Lancée par app.js quand profil.application === "conteur" et que la session est prête (connexion, dossier relié).
import { creerDonnees } from "../../src/conteur/donnees.js?v=0.18.0";
import { h, icon, spinner } from "./ui.js?v=0.18.0";
import * as E from "./ecrans_enfant.js?v=0.18.0";
import * as P from "./ecrans_parent.js?v=0.18.0";

const dec = decodeURIComponent;

/** Onglets du mode parent. */
const NAV = [
  { id: "ce-soir", label: "Ce soir", icon: "moon", to: "/mj/ce-soir" },
  { id: "histoires", label: "Histoires", icon: "book", to: "/mj/histoires" },
  { id: "monde", label: "Monde", icon: "map", to: "/mj/monde" },
  { id: "notes", label: "Notes", icon: "note", to: "/mj/notes" }
];

/** [motif, fonction(ctx, ...captures), mode] — mode = "child" | "mj" */
const ROUTES = [
  [/^\/$/, ctx => E.accueil(ctx), "child"],
  [/^\/child\/outils$/, ctx => E.outils(ctx), "child"],
  [/^\/child\/bourse$/, ctx => E.bourse(ctx), "child"],
  [/^\/child\/journal$/, ctx => E.journal(ctx), "child"],
  [/^\/child\/carte$/, ctx => E.carte(ctx, "child"), "child"],
  [/^\/child\/c\/objet$/, ctx => E.objetsEnfant(ctx), "child"],
  [/^\/child\/c\/lieu$/, ctx => E.lieuxEnfant(ctx), "child"],
  [/^\/child\/c\/compagnon$/, ctx => E.compagnonsEnfant(ctx), "child"],
  [/^\/child\/c\/([a-z_]+)$/, (ctx, c) => E.listeEnfant(ctx, c), "child"],
  [/^\/child\/c\/([a-z_]+)\/(.+)$/, (ctx, c, f) => E.ficheEnfant(ctx, c, f), "child"],
  ...P.routesParent()
];

export function demarrerConteur({ profil, session, auth, ecriture, surErreur }) {
  document.body.classList.add("conteur");
  if (!document.getElementById("css-conteur")) document.head.append(h("link", { id: "css-conteur", rel: "stylesheet", href: "./conteur/conteur.css?v=0.18.0" }));
  const racine = document.getElementById("app-conteur") || document.body.appendChild(h("div", { id: "app-conteur" }));
  const cle = k => `jdr:${profil.id}:${k}`;
  const memoire = {
    lire: k => { try { return localStorage.getItem(cle(k)); } catch { return null; } },
    ecrire: (k, v) => { try { localStorage.setItem(cle(k), v); } catch { /* stockage indisponible */ } }
  };
  const donnees = creerDonnees({ profil, depot: session.depot, memoire });
  const actif = n => !!(profil.modules && profil.modules[n] && profil.modules[n].actif !== false);
  const ctx = {
    profil, session, auth, depot: session.depot, donnees, regles: donnees.regles, memoire, ecriture: ecriture === true, module: actif,
    modeParent: () => sessionStorage.getItem(cle("parent")) === "1",
    ouvrirModeParent() { sessionStorage.setItem(cle("parent"), "1"); location.hash = "#/mj/ce-soir"; },
    fermerModeParent() { sessionStorage.removeItem(cle("parent")); location.hash = "#/"; }
  };

  const barreRetourEnfant = () => h("button", { class: "iconbtn", "aria-label": "Retour au mode enfant", onclick: () => ctx.fermerModeParent() }, icon("user", 24));
  function coque(ecran, mode) {
    const frag = document.createDocumentFragment();
    if (ecran.bare) { frag.append(ecran.node); return frag; }
    if (ecran.title || ecran.back || mode === "mj") {
      const barre = h("div", { class: "topbar" });
      if (ecran.back) barre.append(h("a", { class: "iconbtn", href: "#" + ecran.back, "aria-label": "Retour" }, icon("back", 24)));
      barre.append(h("h1", null, ecran.title || ""));
      if (ecran.action) barre.append(ecran.action);
      if (mode === "mj") barre.append(barreRetourEnfant());
      frag.append(barre);
    }
    frag.append(ecran.node);
    if (ecran.nav) {
      frag.append(h("nav", { class: "nav", "aria-label": "Mode parent" }, h("div", { class: "nav-in" },
        NAV.map(n => h("a", { href: "#" + n.to, class: n.id === ecran.nav ? "on" : "" }, icon(n.icon, 26, "currentColor"), n.label)))));
    }
    return frag;
  }

  let jeton = 0, nettoyage = null;
  async function afficher() {
    const moi = ++jeton;
    let chemin = location.hash.replace(/^#/, "") || "/";
    if (!chemin.startsWith("/")) chemin = "/";
    let trouve = null;
    for (const [re, fn, mode] of ROUTES) { const m = chemin.match(re); if (m) { trouve = { fn, mode, args: m.slice(1) }; break; } }
    if (!trouve) { location.hash = "#/"; return; }
    if (trouve.mode === "mj" && !ctx.modeParent()) { location.hash = "#/"; return; }
    if (nettoyage) { try { nettoyage(); } catch { /* sans importance */ } nettoyage = null; }
    racine.replaceChildren(spinner());
    window.scrollTo(0, 0);
    try {
      const ecran = await trouve.fn(ctx, ...trouve.args);
      if (moi !== jeton) return;
      nettoyage = ecran.cleanup || null;
      racine.replaceChildren(coque(ecran, trouve.mode));
    } catch (e) {
      if (moi !== jeton) return;
      if (e && (e.status === 401 || e.auth)) return surErreur(e);
      const retry = h("button", { class: "btn", onclick: () => afficher() }, "Réessayer");
      racine.replaceChildren(coque({ title: "Oups", back: trouve.mode === "mj" ? "/mj/ce-soir" : "/", node: h("div", { class: "page" },
        h("div", { class: "card" }, h("h3", null, "Oups, ça ne marche pas"), h("div", { class: "muted" }, String((e && e.message) || e)), retry)) }, trouve.mode));
    }
  }
  window.addEventListener("hashchange", afficher);
  afficher();
  return { ctx, afficher };
}
