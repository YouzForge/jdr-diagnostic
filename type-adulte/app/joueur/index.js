// Application « joueur » (JDR pour adulte) : coque (portrait, onglets qu'on tire vers le haut, loupe, d100), routeur, choix du joueur à voir pour le MJ.
// Lancée par app.js quand profil.application === "joueur" et que la session est prête (connexion, dossier relié).
// Lecture partout ; l'écriture (tranche 2 : étiquettes, notes, sac, points de vie, bourse) n'existe que pour un JOUEUR et seulement si l'interrupteur `ecriture` du JDR est ouvert.
// Le MJ qui « voit comme » un joueur ne peut rien modifier.
import { creerDonneesJoueur } from "../../src/joueur/donnees.js";
import { nature, issue } from "../../src/joueur/geste.js";
import { reglesD100 } from "../../src/joueur/d100.js";
import { listerJoueurs } from "../../src/app/bibliotheque.js";
import { h, icon, attente, message, urlImage, viderImages, feuille, feuilleOuverte } from "./ui.js";
import { ouvrirJet } from "./jet.js";
import { ecranFiche, ecranCompetences } from "./ecrans_fiche.js";
import { ecranSacDossiers, ecranSacTout, ecranSacDossier } from "./ecrans_sac.js";
import { ecranSavoirs, ecranQuetes, ecranNotes, ecranJournal, ecranRencontres, ecranRencontre } from "./ecrans_savoirs.js";
import { ecranCarte } from "./ecrans_carte.js";
import { ecranRecherche } from "./ecrans_recherche.js";
import { ecranAccueilMJ, ecranDocumentMJ, cadreMJ } from "./ecrans_mj.js";
import { creerStockageImages } from "./stockage_images.js";

const dec = decodeURIComponent;
const FRAICHEUR_MS = 60_000;   // une lecture est réutilisée une minute en mémoire de page ; « Actualiser » (menu du nom) et le retour au premier plan la rafraîchissent
const ATTENTE_REDESSIN_MS = 1_000;

/** Les quatre onglets. `portee` : écrans qui allument l'onglet. */
const ONGLETS = [
  { id: "fiche", libelle: "Fiche", ic: "fiche", href: "#/fiche" },
  { id: "competences", libelle: "Compétences", ic: "comp", href: "#/competences" },
  { id: "sac", libelle: "Sac", ic: "bag", href: "#/sac" },
  { id: "savoirs", libelle: "Savoirs", ic: "eye", href: "#/savoirs" }
];

/** [motif, fonction(ctx, ...captures)] — chaque écran renvoie { onglet, sous?, node, cleanup? } ; onglet null = panneau sans onglet allumé. */
const ROUTES = [
  [/^\/$/, () => ({ accueil: true })],
  [/^\/fiche$/, ctx => ecranFiche(ctx)],
  [/^\/competences$/, ctx => ecranCompetences(ctx)],
  [/^\/sac$/, ctx => ecranSacDossiers(ctx)],
  [/^\/sac\/tout$/, ctx => ecranSacTout(ctx)],
  [/^\/sac\/d\/(.+)$/, (ctx, n) => ecranSacDossier(ctx, dec(n))],
  [/^\/sac\/o\/(.+)$/, (ctx, f) => ecranSacTout(ctx, dec(f))],
  [/^\/savoirs$/, ctx => ecranSavoirs(ctx)],
  [/^\/savoirs\/(.+)$/, (ctx, f) => ecranSavoirs(ctx, dec(f))],
  [/^\/quetes$/, ctx => ecranQuetes(ctx)],
  [/^\/quetes\/(.+)$/, (ctx, f) => ecranQuetes(ctx, dec(f))],
  [/^\/notes$/, ctx => ecranNotes(ctx)],
  [/^\/notes\/(.+)$/, (ctx, f) => ecranNotes(ctx, dec(f))],
  [/^\/journal$/, ctx => ecranJournal(ctx)],
  [/^\/journal\/(\d+)$/, (ctx, n) => ecranJournal(ctx, Number(n))],
  [/^\/rencontres$/, ctx => ecranRencontres(ctx)],
  [/^\/rencontres\/(.+)$/, (ctx, f) => ecranRencontre(ctx, dec(f))],
  [/^\/carte$/, ctx => ecranCarte(ctx)],
  [/^\/recherche$/, ctx => ecranRecherche(ctx)]
];

/** Écrans du MJ (D47) : hors de la coque du joueur (pas de portrait ni d'onglets). Chaque écran renvoie { page }. */
const ROUTES_MJ = [
  [/^\/mj$/, ctx => ecranAccueilMJ(ctx)],
  [/^\/mj\/lieu\/(.+)$/, (ctx, f) => ecranDocumentMJ(ctx, "lieu", dec(f))],
  [/^\/mj\/session\/(.+)$/, (ctx, f) => ecranDocumentMJ(ctx, "session", dec(f))]
];

export function demarrerJoueur({ profil, session, auth, deconnecter, versMoteur, surErreur, ecriture = false }) {
  document.body.classList.add("joueur");
  if (!document.getElementById("css-joueur")) document.head.append(h("link", { id: "css-joueur", rel: "stylesheet", href: "./joueur/joueur.css" }));
  let themeMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeMeta) { themeMeta = h("meta", { name: "theme-color", content: "#1d1b1a" }); document.head.append(themeMeta); } else themeMeta.setAttribute("content", "#1d1b1a");
  const racine = document.getElementById("app-joueur") || document.body.appendChild(h("div", { id: "app-joueur" }));
  const cle = k => `jdr:${profil.id}:joueur:${k}`;
  const lireSession = k => { try { return sessionStorage.getItem(cle(k)); } catch { return null; } };
  const ecrireSession = (k, v) => { try { if (v == null) sessionStorage.removeItem(cle(k)); else sessionStorage.setItem(cle(k), v); } catch { /* stockage indisponible */ } };

  const estMJ = () => session.role === "mj";
  const ctx = {
    profil, session, auth, regles: reglesD100(profil), historique: [], donnees: null, surErreur, brouillons: new Map(),
    etat: { sac: { ordre: "recents", groupe: "dossier", min: null, max: null }, carte: 0, recherche: { q: "", types: [], session: "", lieu: "", personnage: "", etiquette: "" } },
    panneau: "ferme"
  };

  /* ---- Données ----
   * La couche de données (src/joueur/donnees.js) garde en mémoire de page ses lectures et affiche d'abord la copie locale ; elle prévient (`surMiseAJour`)
   * quand la vérification en arrière-plan a trouvé du nouveau. Ici : l'index de recherche (calculé à partir de plusieurs lectures) et le redessin discret. */
  const caches = new Map();
  const unique = (nom, f) => {
    const c = caches.get(nom);
    if (c && Date.now() - c.t < FRAICHEUR_MS) return c.p;
    const p = f().catch(e => { caches.delete(nom); throw e; });
    caches.set(nom, { t: Date.now(), p });
    return p;
  };
  ctx.charger = () => ctx.donnees.fiche();
  ctx.chargerEtiquettes = () => ctx.donnees.etiquettes();
  ctx.chargerIndex = () => unique("index", () => ctx.donnees.index());
  ctx.vider = () => { caches.clear(); if (ctx.donnees) ctx.donnees.invalider(); };
  /** Après une écriture : relit tout et redessine l'écran courant. */
  ctx.reafficher = async () => { const y = window.scrollY; ctx.vider(); await afficher(); window.scrollTo(0, y); };

  /** La vérification en arrière-plan a trouvé un changement : l'écran se redessine à la même place, sans toucher à ce que le joueur est en train de faire. */
  let redessin = null, enAttente = false, imagesChangees = false;
  const occupe = () => {
    if (feuilleOuverte()) return true;
    const a = document.activeElement, t = a && a.tagName;
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || !!(a && a.isContentEditable);
  };
  function planifierRedessin(delai = 150) {
    if (redessin) return;
    redessin = setTimeout(async function essai() {
      redessin = null;
      if (document.hidden) { enAttente = true; return; }                              // au retour au premier plan
      if (occupe()) { redessin = setTimeout(essai, ATTENTE_REDESSIN_MS); return; }    // fenêtre ouverte ou saisie en cours : on attend
      enAttente = false;
      const y = window.scrollY;
      caches.clear();
      if (imagesChangees) { imagesChangees = false; viderImages(); }   // une image a changé ailleurs : les adresses mémorisées sont relues dans la copie locale
      await afficher();
      window.scrollTo(0, y);
    }, delai);
  }
  function arreterRedessin() { if (redessin) { clearTimeout(redessin); redessin = null; } enAttente = false; }
  function surMiseAJour(info) {
    if (info && info.erreur) {
      arreterRedessin(); caches.clear(); viderImages();
      return surErreur(info.erreur);   // reconnexion (401) ou accès retiré : même chemin que pour une lecture qui échoue
    }
    if (info && info.images) imagesChangees = true;
    planifierRedessin();
  }
  const imagesLocales = auth && auth.empreinte ? creerStockageImages(window, auth.empreinte()) : null;   // copie locale des images, par compte (null si le navigateur n'a pas Cache Storage)
  function ouvrirDonnees(pseudo) {
    caches.clear(); viderImages(); arreterRedessin();
    ctx.donnees = creerDonneesJoueur({ profil, depot: ctx.session.depot, role: estMJ() ? "mj" : "joueur", pseudo, ecriture: ecriture === true, images: imagesLocales });
    ctx.donnees.surMiseAJour(surMiseAJour);
    // Les autres onglets se lisent pendant que le joueur regarde le premier : le changement d'onglet est alors immédiat.
    if (typeof ctx.donnees.prechauffer === "function") setTimeout(() => { ctx.donnees.prechauffer().catch(e => { if (e && (e.status === 401 || e.auth)) surErreur(e); }); }, 300);
  }
  // Un joueur ouvre son dossier ; le MJ ouvre sans joueur (écrans du MJ) ou, s'il l'a choisi, « comme » un joueur.
  ouvrirDonnees(estMJ() ? (lireSession("voir") || "") : (session.pseudo || ""));
  ctx.actions = { versMoteur, deconnecter, actualiser: () => { ctx.vider(); ctx.donnees.actualiser(); viderImages(); afficher(); } };
  const accueilMJ = () => { ecrireSession("voir", null); ouvrirDonnees(""); location.hash = "#/mj"; };

  /* ---- Coque ---- */
  function menu(fiche) {
    const fermer = feuille("Menu", h("div", { class: "jr-menu" },
      h("p", { class: "jr-meta" }, estMJ() ? `Tu vois l'application comme : ${ctx.donnees.pseudo.replace(/_/g, " ")}` : (fiche && fiche.nom) || ctx.donnees.pseudo || ""),
      h("button", { class: "jr-bouton", onclick: () => { fermer(); ctx.vider(); ctx.donnees.actualiser(); viderImages(); afficher(); } }, icon("clock", 18), "Actualiser"),
      estMJ() ? h("button", { class: "jr-bouton", onclick: () => { fermer(); accueilMJ(); } }, icon("book", 18), "Accueil du MJ") : null,
      estMJ() ? h("button", { class: "jr-bouton", onclick: () => { fermer(); ecrireSession("voir", null); location.hash = "#/mj/joueurs"; } }, icon("user", 18), "Changer de joueur") : null,
      estMJ() && versMoteur ? h("button", { class: "jr-bouton", onclick: () => { fermer(); versMoteur(); } }, icon("scroll", 18), "Listes du moteur (MJ)") : null,
      h("button", { class: "jr-bouton", onclick: () => { fermer(); deconnecter(); } }, icon("lock", 18), "Se déconnecter")));
  }

  function onglets(actif) {
    return h("div", { class: "jr-onglets", role: "tablist", "aria-label": "Sections" },
      ONGLETS.map(o => h("a", { class: "jr-onglet" + (o.id === actif ? " on" : ""), href: o.href, role: "tab", "aria-selected": String(o.id === actif), "data-href": o.href }, icon(o.ic, 20), h("span", null, o.libelle))));
  }

  /** Tirer la bande d'onglets vers le haut ouvre le panneau, la tirer vers le bas le ferme ; un simple appui suit le lien. */
  function gestes(panneau, bande, ouvert) {
    let depart = null, tire = false, bouge = false;
    const haut = () => panneau.getBoundingClientRect().height;
    const annule = () => { depart = null; tire = false; panneau.classList.remove("tire"); panneau.style.transform = ""; };
    // Un doigt qui a bougé n'est plus un appui : le clic qui suivrait est ignoré (délai : sur téléphone il arrive après le relâchement).
    const garde = () => { bande.dataset.glisse = "1"; setTimeout(() => { delete bande.dataset.glisse; }, 400); };
    bande.addEventListener("pointerdown", e => { depart = { x: e.clientX, y: e.clientY }; tire = false; bouge = false; });
    bande.addEventListener("pointermove", e => {
      if (!depart) return;
      const dx = e.clientX - depart.x, dy = depart.y - e.clientY;   // dy positif : vers le haut
      const n = nature(dx, dy);
      if (n !== "appui") bouge = true;
      if (!tire && n === "tire") { tire = true; bande.setPointerCapture?.(e.pointerId); panneau.classList.add("tire"); }
      if (!tire) return;
      const fermeY = haut() - bande.getBoundingClientRect().height;
      const y = ouvert ? Math.max(0, Math.min(fermeY, -dy)) : Math.max(0, Math.min(fermeY, fermeY - dy));
      panneau.style.transform = `translateY(${y}px)`;
    });
    bande.addEventListener("pointerup", e => {
      if (!depart) return;
      const dy = depart.y - e.clientY, etaitTire = tire, avaitBouge = bouge;
      annule();
      if (avaitBouge) garde();
      if (!etaitTire) return;
      // Tirer ouvre toujours la Fiche : l'onglet sous le doigt au départ ne compte pas (sinon un tirage lançait la catégorie touchée).
      const r = issue(ouvert, dy);
      if (r === "ouvrir") location.hash = "#/fiche"; else if (r === "fermer") location.hash = "#/";
    });
    bande.addEventListener("pointercancel", () => { if (bouge) garde(); annule(); });   // le navigateur reprend le geste : on ne navigue pas
    bande.addEventListener("click", e => { if (bande.dataset.glisse) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  async function cadre(ecran, fiche) {
    const accueil = !!ecran.accueil;
    const portrait = fiche && fiche.portrait ? await urlImage(ctx, fiche.portrait).catch(() => null) : null;
    const fond = h("div", { class: "jr-fond" }, portrait ? h("img", { src: portrait, alt: "", draggable: "false" }) : h("div", { class: "jr-fond-vide" }, icon("user", 72, "currentColor", 1.2)));
    const nom = h("button", { class: "jr-nom", onclick: () => menu(fiche), "aria-label": "Menu" }, h("span", null, (fiche && fiche.nom) || ctx.donnees.pseudo || "Joueur"), icon("chev_d", 16));
    const loupe = ecran.onglet === null ? null : h("a", { class: "jr-rond loupe", href: "#/recherche", "aria-label": "Rechercher" }, icon("search", 22));
    const de = h("button", { class: "jr-de", "aria-label": "Lancer un d100", onclick: () => ouvrirJet(ctx, { titre: "Jet libre" }) }, h("span", null, "d100"));
    const bande = onglets(ecran.onglet);
    const contenu = h("div", { class: "jr-contenu", id: "jr-contenu" }, accueil ? null : ecran.node);
    const panneau = h("section", { class: "jr-panneau", "aria-label": "Contenu" }, bande, contenu);
    const racineJr = h("div", { class: "jr" + (accueil ? " accueil" : "") }, fond, nom, loupe, panneau, de);
    // animation d'ouverture ou de fermeture du panneau : on part de l'état précédent, puis on bascule à l'image suivante
    const maintenant = accueil ? "ferme" : "ouvert";
    panneau.classList.add(ctx.panneau === maintenant ? maintenant : ctx.panneau);
    if (ctx.panneau !== maintenant) requestAnimationFrame(() => requestAnimationFrame(() => { panneau.classList.remove("ferme", "ouvert"); panneau.classList.add(maintenant); }));
    ctx.panneau = maintenant;
    gestes(panneau, bande, !accueil);
    return racineJr;
  }

  /* ---- Choix du joueur (MJ) ---- */
  async function ecranChoix() {
    const noms = (await listerJoueurs({ session: ctx.session, profil }).catch(e => { if (e && (e.status === 401 || e.auth)) throw e; return []; })).filter(n => !String(n).startsWith("_")); // « _Modele_joueur » n'est pas un joueur
    const page = cadreMJ(ctx, { actif: "joueurs" },
      h("div", { class: "mj-doc-tete" }, h("h2", { class: "mj-doc-titre" }, "Voir comme un joueur"),
        h("p", { class: "jr-meta" }, "Tu verras exactement ce que voit ce joueur : son dossier et la table. Rien n'est modifié.")),
      noms.length ? h("ul", { class: "jr-choix-liste" }, noms.map(n => h("li", null, h("button", { class: "jr-carte", onclick: () => { ecrireSession("voir", n); ouvrirDonnees(n); location.hash = "#/"; } },
        h("div", { class: "jr-carte-tete" }, icon("user", 20), h("span", { class: "jr-carte-titre" }, n.replace(/_/g, " "))))))) : message("Aucun dossier de joueur dans « " + (profil.securite.joueurs || "Joueurs") + " » : crée-en un avec le générateur.", "info"));
    return page;
  }

  /* ---- Routeur ---- */
  let jeton = 0, nettoyage = null;
  async function afficher() {
    const moi = ++jeton;
    let chemin = location.hash.replace(/^#/, "") || "/";
    if (!chemin.startsWith("/")) chemin = "/";
    if (nettoyage) { try { nettoyage(); } catch { /* sans importance */ } nettoyage = null; }
    const attendre = setTimeout(() => { if (moi === jeton) racine.replaceChildren(attente()); }, 250);
    try {
      if (estMJ() && !ctx.donnees.pseudo && !chemin.startsWith("/mj")) { clearTimeout(attendre); location.hash = "#/mj"; return; }   // sans joueur choisi : écrans du MJ seulement
      if (estMJ() && chemin === "/mj/joueurs") {
        const noeud = await ecranChoix();
        clearTimeout(attendre);
        if (moi === jeton) { ctx.panneau = "ferme"; racine.replaceChildren(noeud); }
        return;
      }
      if (chemin.startsWith("/mj")) {
        let mj = null;
        if (estMJ()) for (const [re, fn] of ROUTES_MJ) { const m = chemin.match(re); if (m) { mj = { fn, args: m.slice(1) }; break; } }
        if (!mj) { clearTimeout(attendre); location.hash = estMJ() ? "#/mj" : "#/"; return; }   // un joueur n'a aucun écran du MJ
        window.scrollTo(0, 0);
        const ecran = await mj.fn(ctx, ...mj.args);
        clearTimeout(attendre);
        if (moi === jeton) { ctx.panneau = "ferme"; racine.replaceChildren(ecran.page); }
        return;
      }
      let trouve = null;
      for (const [re, fn] of ROUTES) { const m = chemin.match(re); if (m) { trouve = { fn, args: m.slice(1) }; break; } }
      if (!trouve) { clearTimeout(attendre); location.hash = "#/"; return; }
      window.scrollTo(0, 0);
      const [lecture, ecran] = await Promise.all([ctx.charger().catch(e => { if (e && (e.status === 401 || e.auth)) throw e; return { fiche: null }; }), Promise.resolve(trouve.fn(ctx, ...trouve.args))]);
      clearTimeout(attendre);
      if (moi !== jeton) { if (ecran && ecran.cleanup) ecran.cleanup(); return; }
      nettoyage = ecran.cleanup || null;
      racine.replaceChildren(await cadre(ecran, lecture.fiche));
    } catch (e) {
      clearTimeout(attendre);
      if (moi !== jeton) return;
      if (e && (e.status === 401 || e.auth)) return surErreur(e);
      ctx.panneau = "ferme";
      racine.replaceChildren(h("div", { class: "jr-choix" }, h("h1", null, "Oups"), message("Ça ne marche pas : " + String((e && e.message) || e), "erreur"),
        h("button", { class: "jr-bouton", onclick: () => afficher() }, "Réessayer"), h("a", { class: "jr-bouton", href: "#/" }, "Accueil")));
    }
  }
  const surChangementDeRoute = () => { arreterRedessin(); afficher(); };
  window.addEventListener("hashchange", surChangementDeRoute);
  let masqueA = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { masqueA = Date.now(); return; }
    if (masqueA && Date.now() - masqueA > FRAICHEUR_MS && ctx.donnees) {
      // Retour au premier plan après une pause : on revérifie sur le réseau en silence ; si quelque chose a changé, l'écran se redessine (surMiseAJour).
      ctx.vider(); ctx.donnees.actualiser();
      ctx.donnees.prechauffer().catch(e => { if (e && (e.status === 401 || e.auth)) surErreur(e); });
    }
    if (enAttente) planifierRedessin();
  });
  afficher();
  return { ctx, afficher, arreter() { arreterRedessin(); window.removeEventListener("hashchange", surChangementDeRoute); document.body.classList.remove("joueur"); racine.replaceChildren(); } };
}
