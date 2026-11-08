// Interface du moteur : connexion, liaison des dossiers, menu, liste, fiche, et (si la configuration l'active) formulaires de création, modification et suppression.
// Toute la logique est dans `src/` (testée dans Node) ; ici, seulement l'affichage. RÈGLE : jamais de innerHTML, uniquement du texte
// (un test vérifie cette règle) : une fiche ne peut donc ni exécuter de code ni charger d'image.
import { creerAuthNavigateur, creerClientGraph, chargerProfil, ouvrirSession, bibliotheque, listerJoueurs, collectionsVisibles,
  validerAutorisations, AccesRefuse, creerStockageNavigateur, cheminCollection, peutEcrire, modeleFormulaire, ouvrirPourModifier,
  enregistrerModification, enregistrerCreation, supprimerFiche, messageEcriture } from "../src/index.js";

import { icone } from "./icones.js";

const $ = id => document.getElementById(id);
const h = (tag, attrs, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === "class") e.className = v; else if (k.startsWith("on")) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v); }
  for (const c of enfants.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};

let auth, profil, allowed, session = null, client = null;
let nav = 0;   // numéro de la navigation en cours : une réponse lente d'un ancien écran ne doit jamais remplacer l'écran actuel
const stockage = creerStockageNavigateur(window.localStorage);
const mots = () => profil.vocabulaire || {};
const ecritureActive = () => window.JDR_APP.ecriture === true;     // interrupteur de la configuration : éteint par défaut
const peutModifier = col => ecritureActive() && peutEcrire(profil, session.role, col);
const lien = (col, pseudo, fichier) => fichier ? `#/f/${encodeURIComponent(col.id)}/${encodeURIComponent(fichier)}${pseudo ? "/" + encodeURIComponent(pseudo) : ""}` : `#/c/${encodeURIComponent(col.id)}${pseudo ? "/" + encodeURIComponent(pseudo) : ""}`;

/* ---------- habillage ---------- */
// L'habillage (profil.theme.habillage) ne change que l'apparence (feuille de style) : « sobre » (défaut) ou « conte » (carton, ombres décalées, tuiles colorées).
// Les couleurs viennent du profil (collection.couleur, "#rrggbb") ou, à défaut, d'une suite de couleurs du kit « conte ».
const HABILLAGES = ["sobre", "conte"];
const COULEURS_CONTE = ["#C23B2E", "#1F6F5E", "#2F5FA8", "#6B3FA0", "#9A5B2B", "#F2B63D"];
const HEX = /^#[0-9a-f]{6}$/i;
const encre = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.58 ? "#3A2618" : "#FFFFFF"; };
function couleurDe(col) {
  if (col && HEX.test(col.couleur || "")) return col.couleur;
  const i = Math.max(0, profil.collections.findIndex(c => c.id === (col && col.id)));
  return COULEURS_CONTE[i % COULEURS_CONTE.length];
}
/** Disque coloré avec l'icône de la collection (visible seulement avec l'habillage « conte »). */
function disque(nom, couleur, taille = 52) {
  const d = h("span", { class: "disque", style: `--c:${couleur};--t:${taille}px` });
  d.append(icone(nom || "book", Math.round(taille * 0.52), encre(couleur), 2.2));
  return d;
}
const iconeDe = col => (col && col.icone) || "book";

/* ---------- affichage de base ---------- */
function montrer(...noeuds) { const c = $("contenu"); c.textContent = ""; c.append(...noeuds.flat().filter(Boolean)); window.scrollTo(0, 0); }
const bandeau = (texte, type = "alerte") => h("p", { class: "bandeau " + type, role: "status" }, texte);
function entete() {
  $("btnDeconnexion").hidden = !(auth && auth.connecte());
  $("qui").textContent = session ? (session.role === "mj" ? mots().mj || "MJ" : session.pseudo || mots().joueur || "joueur") : "";
}

function rendreBlocs(blocs) {
  return blocs.map(b => {
    const morceaux = ms => ms.map(m => (m.gras ? h("strong", {}, m.texte) : m.italique ? h("em", {}, m.texte) : m.texte));
    if (b.t === "h") return h("h" + Math.min(4, b.n + 1), {}, b.texte);
    if (b.t === "p") return h("p", {}, morceaux(b.morceaux));
    if (b.t === "ul" || b.t === "ol") return h(b.t, {}, b.items.map(it => h("li", {}, morceaux(it))));
    if (b.t === "cite") return h("blockquote", {}, morceaux(b.morceaux));
    return h("hr");
  });
}

/* ---------- écrans ---------- */
/** Déconnexion locale (voir auth.logout). On RECHARGE ensuite la page : sans redirection, MSAL garde une interaction « en cours » et refuse
 *  le bouton « Se connecter » tant que la page n'est pas rechargée (relevé sur iPhone le 6 novembre). Au rechargement : écran de connexion. */
async function sortir() {
  nav++;
  try { await auth.logout(); } catch { /* la déconnexion locale a eu lieu même si l'effacement a échoué */ }
  window.location.reload();
}

function ecranConnexion(message, type = "alerte") {
  session = null; entete();
  montrer(accueilTitre(), message ? bandeau(message, type) : null,
    h("p", {}, "Connecte-toi avec le compte Microsoft que le MJ a autorisé."),
    h("p", {}, h("button", { class: "principal", onclick: () => auth.login() }, "Se connecter avec Microsoft")));
}

/** Titre de l'accueil : pastille d'emblème (habillage « conte ») + nom du JDR. */
function accueilTitre() {
  const emb = h("span", { class: "emblem", "aria-hidden": "true" }, icone((profil.theme && profil.theme.icone) || "book", 38, "var(--encre)", 2.2));
  return h("div", { class: "bonjour" }, emb, h("h2", {}, profil.nom));
}

const SOURCES = { memorise: "dans la mémoire de l'appareil", lien: "par un lien", raccourci: "par un raccourci OneDrive", partagesAvecMoi: "par « Partagés avec moi »" };
const PROBLEMES = {
  acces_retire: p => `L'accès à ${p.role === "table" ? "la table" : "ton dossier"} a été retiré ou n'existe plus : redemande un lien au MJ.`,
  marqueur_change: p => `Le dossier « ${p.role === "table" ? "table" : "joueur"} » ne ressemble plus à celui d'avant : redemande un lien au MJ.`,
  lien: p => `Le lien n° ${p.numero} n'ouvre rien avec ce compte. Vérifie que tu es connecté avec le bon compte Microsoft, ou redemande un lien au MJ.`,
  ambigu: p => `Plusieurs dossiers « ${p.role} » sont partagés avec ce compte : demande au MJ d'en retirer un.`,
  marqueur_sans_pseudo: () => "Un dossier « joueur » partagé avec ce compte n'a pas de pseudo dans son marqueur : il n'est pas utilisé. Demande au MJ de le régénérer.",
  coffre_partage: () => "Attention : le coffre du MJ est partagé avec ce compte. Préviens le MJ tout de suite : cette application ne l'utilisera jamais.",
  marqueur_illisible: p => `Un dossier retrouvé ${SOURCES[p.source] || "ailleurs"} n'a pas pu être lu (${p.status ? "code " + p.status + (p.code ? " · " + p.code : "") : "réseau ou blocage"}). ${p.status === 403 ? "C'est sans doute un ancien partage ou raccourci : il est ignoré." : "Il est ignoré ; réessaie si un dossier manque."}`,
  reseau: () => "Microsoft ne répond pas pour le moment. Réessaie dans un instant.",
  dossier_mj_introuvable: () => "Le dossier du JDR est introuvable sur ton OneDrive."
};
const NOMS_MANQUE = { table: "la table", joueur: "ton dossier", unique: "le dossier du JDR" };

async function ecranLiaison(s, message) {
  const zone = h("textarea", { id: "liens", placeholder: "https://1drv.ms/…", autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Liens reçus du MJ" });
  const btn = h("button", { class: "principal" }, "Relier");
  btn.onclick = async () => {
    const liens = zone.value.split(/\s+/).map(x => x.trim()).filter(Boolean);
    if (!liens.length) return;
    btn.disabled = true; await lancer(liens); btn.disabled = false;
  };
  // D27 : plus d'écran « compte non autorisé ». Un compte sans dossier arrive ici ; la bonne réponse est de relier ses dossiers ou de changer de compte.
  // L'empreinte (SHA-256 de l'adresse, jamais l'adresse) ne sert qu'à déclarer un compte MJ dans la configuration ; elle ne donne aucun droit.
  let empreinte = ""; try { empreinte = await auth.empreinte(); } catch { /* sans empreinte */ }
  montrer(h("h2", {}, "Relier tes dossiers"),
    message ? bandeau(message) : null,
    s.problemes.map(p => (PROBLEMES[p.type] ? bandeau(PROBLEMES[p.type](p)) : null)),
    h("p", {}, "Le MJ t'a envoyé ", s.manque.length > 1 ? "deux liens" : "un lien", ". Colle-", s.manque.length > 1 ? "les" : "le", " ici (un par ligne). Tu ne le feras qu'une fois sur cet appareil."),
    h("p", { class: "discret" }, "Il manque : " + s.manque.map(x => NOMS_MANQUE[x] || x).join(" et ") + "."),
    zone, h("p", {}, btn),
    h("p", { class: "discret" }, "Les liens ne sont pas gardés : l'application mémorise seulement les dossiers retrouvés."),
    h("p", { class: "discret" }, "Les dossiers du MJ ne s'ouvrent qu'avec le compte Microsoft auquel il les a partagés. Ce n'est pas le bon ? ",
      h("button", { id: "btnChangerCompte", onclick: () => sortir() }, "Changer de compte")),
    empreinte ? h("details", { class: "discret" }, h("summary", {}, "Infos pour le MJ"),
      h("p", {}, "Empreinte de ce compte (utile seulement pour déclarer un compte MJ) : "),
      h("p", { id: "empreinte", style: "word-break:break-all;user-select:all" }, empreinte)) : null);
}

async function ecranMenu(mien = nav) {
  const cols = collectionsVisibles(profil, session.role);
  const joueurs = session.role === "mj" && cols.some(c => c.zone === "joueur") ? await listerJoueurs({ session, profil }).catch(() => []) : [];
  if (mien !== nav) return;
  const items = [];
  const tuile = (c, href, texte) => h("li", {}, h("a", { href }, disque(iconeDe(c), couleurDe(c), 60), h("span", { class: "etiquette" }, texte)));
  for (const c of cols) {
    if (c.zone === "joueur" && session.role === "mj") for (const p of joueurs) items.push(tuile(c, `#/c/${encodeURIComponent(c.id)}/${encodeURIComponent(p)}`, `${c.label} — ${p}`));
    else items.push(tuile(c, `#/c/${encodeURIComponent(c.id)}`, c.label));
  }
  entete();
  const retourJoueur = profil.application === "joueur" && session.role === "mj" ? h("p", {}, h("button", { class: "principal", onclick: () => { location.hash = "#/mj"; lancerJoueur(); } }, "Retour à l'application joueur")) : null;
  montrer(retourJoueur, session.horsLigne ? bandeau("Hors connexion : tu vois la dernière copie enregistrée sur cet appareil.") : null,
    session.problemes.map(p => (PROBLEMES[p.type] ? bandeau(PROBLEMES[p.type](p)) : null)),
    accueilTitre(), items.length ? h("ul", { class: "liste menu" }, items) : h("p", {}, "Rien à afficher pour l'instant."));
}

/** Badge de visibilité (MJ). Une visibilité absente ou inconnue n'est PAS un secret voulu : la fiche est cachée aux joueurs par prudence, et le badge le dit. */
function badgeVisibilite(f) {
  if (f.visibiliteOrigine === "absente") return h("span", { class: "badge sans", title: "Aucune visibilité écrite : fiche cachée aux joueurs par prudence." }, "Sans visibilité");
  if (f.visibiliteOrigine === "inconnue") return h("span", { class: "badge sans", title: "Valeur de visibilité non reconnue : fiche cachée aux joueurs par prudence." }, "Visibilité non reconnue");
  return h("span", { class: "badge " + f.visibilite }, profil.securite.visibilites?.[f.visibilite] || f.visibilite);
}

async function ecranListe(colId, pseudo, mien = nav) {
  const col = collectionsVisibles(profil, session.role).find(c => c.id === colId);
  if (!col) return ecranMenu(mien);
  const titreListe = h("h2", {}, pseudo ? `${col.label} — ${pseudo}` : col.label);
  montrer(h("p", { class: "fil" }, h("a", { href: "#/" }, "← Retour")), titreListe, h("p", {}, "Chargement…"));
  const r = await bibliotheque({ session, profil, col, pseudo });
  if (mien !== nav) return;
  montrer(h("p", { class: "fil" }, h("a", { href: "#/" }, "← Retour")), titreListe,
    r.perime ? bandeau("Hors connexion : copie enregistrée sur cet appareil, peut-être pas à jour.") : null,
    r.illisibles.length ? bandeau(`${r.illisibles.length} fichier(s) n'ont pas pu être lus.`) : null,
    peutModifier(col) ? h("p", {}, h("a", { class: "bouton principal", href: `#/n/${encodeURIComponent(col.id)}${pseudo ? "/" + encodeURIComponent(pseudo) : ""}` }, "+ Nouvelle fiche")) : null,
    r.absent || !r.fiches.length ? h("p", { class: "discret" }, "Rien ici pour l'instant.") :
      h("ul", { class: "liste" }, r.fiches.map(f => h("li", {}, h("a", { href: `#/f/${encodeURIComponent(col.id)}/${encodeURIComponent(f.fichier)}${pseudo ? "/" + encodeURIComponent(pseudo) : ""}` },
        disque(iconeDe(col), couleurDe(col), 40), h("span", { style: "flex:1" }, f.nom), session.role === "mj" && profil.securite.mode === "separe" && f.visibilite !== "accessible" ? badgeVisibilite(f) : null)))));
}

async function ecranFiche(colId, pseudo, fichier, mien = nav) {
  const col = collectionsVisibles(profil, session.role).find(c => c.id === colId);
  if (!col) return ecranMenu(mien);
  const r = await bibliotheque({ session, profil, col, pseudo });
  if (mien !== nav) return;
  const f = r.fiches.find(x => x.fichier === fichier);
  const retour = h("p", { class: "fil" }, h("a", { href: `#/c/${encodeURIComponent(col.id)}${pseudo ? "/" + encodeURIComponent(pseudo) : ""}` }, "← " + col.label));
  if (!f) return montrer(retour, h("p", {}, "Cette fiche n'existe pas ou n'est pas visible."));
  montrer(retour, r.perime ? bandeau("Hors connexion : copie enregistrée sur cet appareil.") : null,
    h("article", { class: "fiche" }, h("h2", {}, f.nom),
      f.champs.length ? h("dl", { class: "champs" }, f.champs.map(c => h("div", {}, h("dt", {}, c.libelle), h("dd", {}, c.valeur)))) : null,
      rendreBlocs(f.blocs)),
    peutModifier(col) ? actionsFiche(col, pseudo, fichier) : null);
}

/** Modifier / supprimer. La suppression demande confirmation à l'écran (pas de fenêtre du navigateur) et envoie la fiche à la corbeille OneDrive. */
function actionsFiche(col, pseudo, fichier) {
  const zone = h("div", { class: "actions" });
  const normal = () => {
    zone.textContent = "";
    zone.append(h("a", { class: "bouton", href: `#/m/${encodeURIComponent(col.id)}/${encodeURIComponent(fichier)}${pseudo ? "/" + encodeURIComponent(pseudo) : ""}` }, "Modifier"),
      h("button", { class: "danger", onclick: confirmer }, "Supprimer"));
  };
  const confirmer = () => {
    zone.textContent = "";
    const oui = h("button", { class: "danger" }, "Oui, supprimer");
    oui.onclick = async () => {
      oui.disabled = true;
      try { await supprimerFiche({ session, profil, col, pseudo, fichier }); location.hash = lien(col, pseudo); }
      catch (e) { const m = messageEcriture(e); if (m.type === "auth") return gerer(e); zone.prepend(bandeau(m.texte, "erreur")); oui.disabled = false; }
    };
    zone.append(h("p", {}, "Supprimer cette fiche ? Elle ira dans la corbeille OneDrive."), oui, h("button", { onclick: normal }, "Annuler"));
  };
  normal();
  return zone;
}

/* ---------- formulaire de création et de modification ---------- */
async function ecranFormulaire(colId, pseudo, fichier, mien = nav) {
  const col = collectionsVisibles(profil, session.role).find(c => c.id === colId);
  if (!col || !peutModifier(col)) return ecranMenu(mien);
  const retour = h("p", { class: "fil" }, h("a", { href: lien(col, pseudo, fichier) }, "← Annuler"));
  let ouverture = null, modele, existants = [];
  if (fichier) {
    try { ouverture = await ouvrirPourModifier({ session, profil, col, pseudo, fichier }); }
    catch (e) { if (e && e.status === 401) return gerer(e); return montrer(retour, bandeau(messageEcriture(e).texte, "erreur")); }
    if (mien !== nav) return;
    if (!ouverture) return montrer(retour, bandeau("Cette fiche n'existe plus.", "erreur"));
    modele = ouverture.modele;
  } else {
    modele = modeleFormulaire(profil, session.role, col);
    try { existants = (await session.depot.lister(cheminCollection(profil, session.role, col, pseudo))).donnees.map(x => x.name); } catch (e) { if (e && e.status === 401) return gerer(e); }
    if (mien !== nav) return;
  }
  const controles = new Map(), erreursZone = new Map();
  const champ = (cle, libelle, controle, aide, requis) => {
    const err = h("p", { class: "erreur-champ", role: "alert" });
    erreursZone.set(cle, err);
    return h("div", { class: "champ" }, h("label", {}, libelle, requis ? " *" : ""), controle, aide ? h("p", { class: "discret" }, aide) : null, err);
  };
  const blocs = [];
  for (const c of modele.champs) {
    let ctl;
    if (c.genre === "bool") ctl = h("input", { type: "checkbox", checked: c.initial === "true" });
    else if (c.options) {
      ctl = h("select", {}, c.options.length && !c.requis ? h("option", { value: "" }, "—") : null,
        c.options.map(o => h("option", { value: o, selected: o === c.initial }, (c.libellesOptions && c.libellesOptions[o]) || o.replace(/_/g, " "))));
    } else if (c.genre === "area") ctl = h("textarea", { rows: "3" }, c.initial);
    else ctl = h("input", { type: "text", value: c.initial, autocomplete: "off", inputmode: c.genre === "int" ? "numeric" : null });
    controles.set("c:" + c.cle, ctl);
    blocs.push(champ(c.cle, c.libelle, ctl, c.aide, c.requis));
  }
  for (const sct of modele.sections) {
    const ctl = h("textarea", { rows: "6" }, sct.initial);
    controles.set("s:" + sct.titre, ctl);
    blocs.push(champ("§" + sct.titre, sct.titre, ctl, null, false));
  }
  const message = h("div", {});
  const btn = h("button", { class: "principal", type: "button" }, "Enregistrer");
  const lire = () => ({
    champs: Object.fromEntries(modele.champs.map(c => { const e = controles.get("c:" + c.cle); return [c.cle, c.genre === "bool" ? e.checked : e.value]; })),
    sections: Object.fromEntries(modele.sections.map(x => [x.titre, controles.get("s:" + x.titre).value]))
  });
  btn.onclick = async () => {
    message.textContent = ""; for (const e of erreursZone.values()) e.textContent = "";
    btn.disabled = true;
    try {
      const saisies = lire();
      const r = fichier ? await enregistrerModification({ session, profil, col, pseudo, fichier, ouverture, saisies })
                        : await enregistrerCreation({ session, profil, col, pseudo, modele, saisies, existants });
      if (r.erreurs) { for (const [k, v] of Object.entries(r.erreurs)) if (erreursZone.has(k)) erreursZone.get(k).textContent = v; message.append(bandeau("Corrige les champs signalés.")); btn.disabled = false; return; }
      location.hash = r.inchange ? lien(col, pseudo, fichier) : lien(col, pseudo, r.fichier);
    } catch (e) {
      const m = messageEcriture(e);
      if (m.type === "auth") return gerer(e);
      message.append(bandeau(m.texte, "erreur"));
      // ce que la personne a tapé reste à l'écran ; en cas de conflit elle peut recharger la dernière version (ses saisies seront alors remplacées)
      if (m.type === "conflit" && fichier) message.append(h("p", {}, h("button", { onclick: () => ecranFormulaire(colId, pseudo, fichier, ++nav) }, "Recharger la dernière version")));
      btn.disabled = false;
    }
  };
  const avertissement = session.role === "mj" && col.zone === "table" ? bandeau("Cette fiche sera lisible par tous les joueurs si sa visibilité est « Accessible ». Ne mets aucun secret ici.") : null;
  montrer(retour, h("h2", {}, (fichier ? "Modifier : " : "Nouvelle fiche : ") + (col.singular || col.label)), avertissement, h("form", { onsubmit: ev => ev.preventDefault() }, blocs), message, h("p", { class: "barre-actions" }, btn));
}

/* ---------- navigation ---------- */
async function route() {
  if (!session || session.statut !== "pret") return;
  const mien = ++nav;
  // chaque segment est décodé APRÈS le découpage (un nom ne peut pas fabriquer un faux séparateur)
  const p = (location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return ""; } });
  try {
    if (p[0] === "c" && p[1] && p.length <= 3) return await ecranListe(p[1], p[2], mien);          // #/c/<collection>[/<pseudo>]
    if (p[0] === "f" && p[1] && p[2] && p.length <= 4) return await ecranFiche(p[1], p[3], p[2], mien);   // #/f/<collection>/<fichier>[/<pseudo>]
    if (p[0] === "n" && p[1] && p.length <= 3) return await ecranFormulaire(p[1], p[2], null, mien);       // #/n/<collection>[/<pseudo>]  (nouvelle fiche)
    if (p[0] === "m" && p[1] && p[2] && p.length <= 4) return await ecranFormulaire(p[1], p[3], p[2], mien);   // #/m/<collection>/<fichier>[/<pseudo>]  (modifier)
    return await ecranMenu(mien);
  } catch (e) { gerer(e); }
}

function gerer(e) {
  if (e && (e.status === 401 || e.auth)) return ecranConnexion("Reconnexion nécessaire : clique sur « Se connecter ».");
  if (e instanceof AccesRefuse) { if (e.raison === "acces_retire") return lancer([], "L'accès à un dossier a été retiré. Redemande un lien au MJ."); return montrer(bandeau(e.message, "erreur")); }
  montrer(bandeau("Erreur inattendue : " + (e && e.message ? e.message : "inconnue"), "erreur"), h("p", {}, h("button", { onclick: () => lancer([]) }, "Réessayer")));
}

async function lancer(liens = [], message) {
  try {
    session = await ouvrirSession({ auth, client, profil, allowed, stockage, liens, cheminMJ: window.JDR_APP.racineMJ || undefined, ecriture: ecritureActive() });
    entete();
    if (session.statut === "a_relier") return await ecranLiaison(session, message);
    if (session.statut === "dossier_mj_introuvable") return montrer(session.problemes.map(p => bandeau(PROBLEMES[p.type](p), "erreur")));
    if (profil.application === "conteur") return await lancerConteur();
    if (profil.application === "joueur") return await lancerJoueur();
    if (location.hash && location.hash !== "#/") return route();
    return ecranMenu(++nav);
  } catch (e) { gerer(e); }
}

/** Application « conteur » (JDR pour enfant) : elle prend tout l'écran ; le menu générique du moteur n'est plus utilisé. */
let conteur = null;
async function lancerConteur() {
  window.removeEventListener("hashchange", route);
  if (conteur) { document.body.classList.add("conteur"); conteur.session = session; conteur.ctx.session = session; conteur.ctx.depot = session.depot; return conteur.afficher(); }
  const { demarrerConteur } = await import("./conteur/index.js");
  conteur = demarrerConteur({ profil, session, auth, ecriture: ecritureActive(), surErreur: e => { document.body.classList.remove("conteur"); gerer(e); } });
}

/** Application « joueur » (JDR pour adulte) : plein écran ; le joueur y écrit si l'interrupteur `ecriture` est ouvert. Le MJ la voit « comme un joueur » ; un lien lui donne les listes du moteur. */
let joueurApp = null;
async function lancerJoueur() {
  window.removeEventListener("hashchange", route);
  if (joueurApp) { joueurApp.arreter(); joueurApp = null; }
  const { demarrerJoueur } = await import("./joueur/index.js");
  joueurApp = demarrerJoueur({
    profil, session, auth, deconnecter: () => sortir(), ecriture: ecritureActive(),
    versMoteur: session.role === "mj" ? () => { joueurApp.arreter(); joueurApp = null; window.addEventListener("hashchange", route); location.hash = "#/"; ecranMenu(++nav); } : null,
    surErreur: e => { if (joueurApp) { joueurApp.arreter(); joueurApp = null; } gerer(e); }
  });
}

async function chargerLeProfil() {
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  // Le profil de test n'est un repli QUE sur la machine de développement : jamais en production.
  for (const u of local ? ["./profil.json", "../profils_test/profil_TEST_adulte_secrets.json"] : ["./profil.json"]) {
    try { const r = await fetch(u); if (r.ok) return chargerProfil(await r.json()).profil; } catch { /* essai suivant */ }
  }
  throw new Error("Profil de jeu introuvable");
}

async function demarrer() {
  try {
    profil = await chargerLeProfil();
    document.title = profil.nom; $("titre").textContent = profil.nom;
    const hab = profil.theme && HABILLAGES.includes(profil.theme.habillage) ? profil.theme.habillage : "sobre";
    document.documentElement.dataset.habillage = hab;
    if (hab === "conte") document.head.append(h("meta", { name: "theme-color", content: "#F4E8D3" }));
    if (profil.theme && profil.theme.palette) document.documentElement.dataset.palette = String(profil.theme.palette).replace(/[^a-z0-9_-]/gi, "");
    allowed = validerAutorisations(window.JDR_APP.allowed);
    ({ auth } = await creerAuthNavigateur(window, window.JDR_APP));
    await auth.init();
    client = creerClientGraph({ fetch: (...a) => window.fetch(...a), getToken: () => auth.getToken() });
  } catch (e) { return montrer(bandeau("Impossible de démarrer : " + (e && e.message ? e.message : "erreur"), "erreur")); }
  $("btnDeconnexion").onclick = () => sortir();
  window.addEventListener("hashchange", route);
  if (!auth.connecte()) return ecranConnexion();
  await lancer([]);
}
demarrer();
