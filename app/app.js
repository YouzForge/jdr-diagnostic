// Interface du moteur (lecture seule pour l'instant : connexion, liaison des dossiers, menu, liste, fiche).
// Toute la logique est dans `src/` (testée dans Node) ; ici, seulement l'affichage. RÈGLE : jamais de innerHTML, uniquement du texte
// (un test vérifie cette règle) : une fiche ne peut donc ni exécuter de code ni charger d'image.
import { creerAuthNavigateur, creerClientGraph, chargerProfil, ouvrirSession, bibliotheque, listerJoueurs, collectionsVisibles,
  validerAutorisations, CompteNonAutorise, AccesRefuse, creerStockageNavigateur } from "../src/index.js";

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
function ecranConnexion(message, type = "alerte") {
  session = null; entete();
  montrer(h("h2", {}, profil.nom), message ? bandeau(message, type) : null,
    h("p", {}, "Connecte-toi avec le compte Microsoft que le MJ a autorisé."),
    h("p", {}, h("button", { class: "principal", onclick: () => auth.login() }, "Se connecter avec Microsoft")));
}

const SOURCES = { memorise: "dans la mémoire de l'appareil", lien: "par un lien", raccourci: "par un raccourci OneDrive", partagesAvecMoi: "par « Partagés avec moi »" };
const PROBLEMES = {
  acces_retire: p => `L'accès à ${p.role === "table" ? "la table" : "ton dossier"} a été retiré ou n'existe plus : redemande un lien au MJ.`,
  marqueur_change: p => `Le dossier « ${p.role === "table" ? "table" : "joueur"} » ne ressemble plus à celui d'avant : redemande un lien au MJ.`,
  lien: p => `Le lien n° ${p.numero} n'ouvre rien avec ce compte. Vérifie que tu es connecté avec le bon compte Microsoft, ou redemande un lien au MJ.`,
  ambigu: p => `Plusieurs dossiers « ${p.role} » sont partagés avec ce compte : demande au MJ d'en retirer un.`,
  coffre_partage: () => "Attention : le coffre du MJ est partagé avec ce compte. Préviens le MJ tout de suite : cette application ne l'utilisera jamais.",
  marqueur_illisible: p => `Un dossier retrouvé ${SOURCES[p.source] || "ailleurs"} n'a pas pu être lu (${p.status ? "code " + p.status : "réseau ou blocage"}). ${p.status === 403 ? "C'est sans doute un ancien partage ou raccourci : il est ignoré." : "Il est ignoré ; réessaie si un dossier manque."}`,
  reseau: () => "Microsoft ne répond pas pour le moment. Réessaie dans un instant.",
  dossier_mj_introuvable: () => "Le dossier du JDR est introuvable sur ton OneDrive."
};
const NOMS_MANQUE = { table: "la table", joueur: "ton dossier", unique: "le dossier du JDR" };

function ecranLiaison(s, message) {
  const zone = h("textarea", { id: "liens", placeholder: "https://1drv.ms/…", autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Liens reçus du MJ" });
  const btn = h("button", { class: "principal" }, "Relier");
  btn.onclick = async () => {
    const liens = zone.value.split(/\s+/).map(x => x.trim()).filter(Boolean);
    if (!liens.length) return;
    btn.disabled = true; await lancer(liens); btn.disabled = false;
  };
  montrer(h("h2", {}, "Relier tes dossiers"),
    message ? bandeau(message) : null,
    s.problemes.map(p => (PROBLEMES[p.type] ? bandeau(PROBLEMES[p.type](p)) : null)),
    h("p", {}, "Le MJ t'a envoyé ", s.manque.length > 1 ? "deux liens" : "un lien", ". Colle-", s.manque.length > 1 ? "les" : "le", " ici (un par ligne). Tu ne le feras qu'une fois sur cet appareil."),
    h("p", { class: "discret" }, "Il manque : " + s.manque.map(x => NOMS_MANQUE[x] || x).join(" et ") + "."),
    zone, h("p", {}, btn),
    h("p", { class: "discret" }, "Les liens ne sont pas gardés : l'application mémorise seulement les dossiers retrouvés."));
}

async function ecranMenu(mien = nav) {
  const cols = collectionsVisibles(profil, session.role);
  const joueurs = session.role === "mj" && cols.some(c => c.zone === "joueur") ? await listerJoueurs({ session, profil }).catch(() => []) : [];
  if (mien !== nav) return;
  const items = [];
  for (const c of cols) {
    if (c.zone === "joueur" && session.role === "mj") for (const p of joueurs) items.push(h("li", {}, h("a", { href: `#/c/${encodeURIComponent(c.id)}/${encodeURIComponent(p)}` }, h("span", {}, `${c.label} — ${p}`))));
    else items.push(h("li", {}, h("a", { href: `#/c/${encodeURIComponent(c.id)}` }, h("span", {}, c.label))));
  }
  entete();
  montrer(session.horsLigne ? bandeau("Hors connexion : tu vois la dernière copie enregistrée sur cet appareil.") : null,
    session.problemes.map(p => (PROBLEMES[p.type] ? bandeau(PROBLEMES[p.type](p)) : null)),
    h("h2", {}, profil.nom), items.length ? h("ul", { class: "liste" }, items) : h("p", {}, "Rien à afficher pour l'instant."));
}

async function ecranListe(colId, pseudo, mien = nav) {
  const col = collectionsVisibles(profil, session.role).find(c => c.id === colId);
  if (!col) return ecranMenu(mien);
  montrer(h("p", { class: "fil" }, h("a", { href: "#/" }, "← Retour")), h("h2", {}, pseudo ? `${col.label} — ${pseudo}` : col.label), h("p", {}, "Chargement…"));
  const r = await bibliotheque({ session, profil, col, pseudo });
  if (mien !== nav) return;
  montrer(h("p", { class: "fil" }, h("a", { href: "#/" }, "← Retour")), h("h2", {}, pseudo ? `${col.label} — ${pseudo}` : col.label),
    r.perime ? bandeau("Hors connexion : copie enregistrée sur cet appareil, peut-être pas à jour.") : null,
    r.illisibles.length ? bandeau(`${r.illisibles.length} fichier(s) n'ont pas pu être lus.`) : null,
    r.absent || !r.fiches.length ? h("p", { class: "discret" }, "Rien ici pour l'instant.") :
      h("ul", { class: "liste" }, r.fiches.map(f => h("li", {}, h("a", { href: `#/f/${encodeURIComponent(col.id)}/${encodeURIComponent(f.fichier)}${pseudo ? "/" + encodeURIComponent(pseudo) : ""}` },
        h("span", { style: "flex:1" }, f.nom), session.role === "mj" && f.visibilite !== "accessible" ? h("span", { class: "badge " + f.visibilite }, profil.securite.visibilites?.[f.visibilite] || f.visibilite) : null)))));
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
      f.champs.length ? h("dl", { class: "champs" }, f.champs.map(c => [h("dt", {}, c.libelle), h("dd", {}, c.valeur)])) : null,
      rendreBlocs(f.blocs)));
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
    return await ecranMenu(mien);
  } catch (e) { gerer(e); }
}

async function compteNonAutorise() {
  // L'empreinte (SHA-256 de l'adresse, pas l'adresse) permet au MJ d'autoriser ce compte sans connaître l'adresse écrite dans le code.
  let empreinte = ""; try { empreinte = await auth.empreinte(); } catch { /* sans empreinte */ }
  session = null; entete();
  montrer(h("h2", {}, profil.nom), bandeau("Le compte Microsoft avec lequel tu es connecté n'est pas autorisé pour ce JDR.", "erreur"),
    h("p", {}, "Si le MJ t'a donné un autre compte, change de compte ci-dessous."),
    h("p", {}, h("button", { class: "principal", onclick: () => auth.logout() }, "Changer de compte")));
  if (empreinte) $("contenu").append(h("p", { class: "discret" }, "Si c'est bien le bon compte, envoie cette empreinte au MJ : "), h("p", { class: "discret", id: "empreinte", style: "word-break:break-all;user-select:all" }, empreinte));
}

function gerer(e) {
  if (e instanceof CompteNonAutorise) return compteNonAutorise();
  if (e && (e.status === 401 || e.auth)) return ecranConnexion("Reconnexion nécessaire : clique sur « Se connecter ».");
  if (e instanceof AccesRefuse) { if (e.raison === "acces_retire") return lancer([], "L'accès à un dossier a été retiré. Redemande un lien au MJ."); return montrer(bandeau(e.message, "erreur")); }
  montrer(bandeau("Erreur inattendue : " + (e && e.message ? e.message : "inconnue"), "erreur"), h("p", {}, h("button", { onclick: () => lancer([]) }, "Réessayer")));
}

async function lancer(liens = [], message) {
  try {
    session = await ouvrirSession({ auth, client, profil, allowed, stockage, liens, cheminMJ: window.JDR_APP.racineMJ || undefined });
    entete();
    if (session.statut === "a_relier") return ecranLiaison(session, message);
    if (session.statut === "dossier_mj_introuvable") return montrer(session.problemes.map(p => bandeau(PROBLEMES[p.type](p), "erreur")));
    if (location.hash && location.hash !== "#/") return route();
    return ecranMenu(++nav);
  } catch (e) { gerer(e); }
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
    if (profil.theme && profil.theme.palette) document.documentElement.dataset.palette = String(profil.theme.palette).replace(/[^a-z0-9_-]/gi, "");
    allowed = validerAutorisations(window.JDR_APP.allowed);
    ({ auth } = await creerAuthNavigateur(window, window.JDR_APP));
    await auth.init();
    client = creerClientGraph({ fetch: (...a) => window.fetch(...a), getToken: () => auth.getToken() });
  } catch (e) { return montrer(bandeau("Impossible de démarrer : " + (e && e.message ? e.message : "erreur"), "erreur")); }
  $("btnDeconnexion").onclick = () => auth.logout();
  window.addEventListener("hashchange", route);
  if (!auth.connecte()) return ecranConnexion();
  await lancer([]);
}
demarrer();
