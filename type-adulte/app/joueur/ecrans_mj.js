// Écrans du MJ (D47, lecture seule) : l'accueil avec la liste des lieux et la session de jeu à venir, la lecture d'un document du coffre, le tableau de bord des joueurs et leurs notes MJ.
// Même charte que les écrans du joueur : bandeau dégradé, panneau qui monte, onglets rouges (orange = écran actif), cartes sombres à bord arrondi, titres en Cinzel.
// Pensés pour l'ordinateur (deux colonnes, large) et lisibles sur téléphone (une colonne). Rien ne s'écrit ici.
import { parseDoc, norm } from "../../src/md/doc.js?v=0.16.1";
import { ETATS_LIEU, STATUTS_SESSION, filtrerLieux, compterEtats } from "../../src/mj/accueil.js?v=0.16.1";
import { h, icon, message, rendreMarkdown, feuille, boiteImage } from "./ui.js?v=0.16.1";

const enc = encodeURIComponent;
const COPIE_ANCIENNE = "Copie enregistrée sur cet appareil : la connexion ne répond pas.";
const libelleEtat = cle => (ETATS_LIEU.find(e => e.cle === cle) || {}).libelle;
const libelleStatut = cle => (STATUTS_SESSION.find(e => e.cle === cle) || {}).libelle;
const taille = n => (n >= 1000 ? `${Math.round(n / 1000)} Ko` : `${n} car.`);

/** Pastille d'état d'un lieu ; une valeur non reconnue est montrée telle que le MJ l'a écrite, avec un avertissement. */
function badgeEtat(l) {
  if (l.etat === "") return h("span", { class: "mj-etat sans", title: "Aucun état écrit dans l'en-tête (champ « etat »)" }, "Sans état");
  if (l.etat === "?") return h("span", { class: "mj-etat inconnu", title: "Valeur non reconnue : idée, à venir, en cours ou joué" }, `${l.etatBrut} ?`);
  return h("span", { class: "mj-etat " + l.etat }, libelleEtat(l.etat));
}
const CLASSE_STATUT = { idee: "idee", prete: "en_cours", jouee: "joue" };
function badgeStatut(s) {
  if (s.statut === "") return h("span", { class: "mj-etat sans", title: "Aucun statut écrit dans l'en-tête (champ « statut »)" }, "Sans statut");
  if (s.statut === "?") return h("span", { class: "mj-etat inconnu", title: "Valeur non reconnue : idée, prête ou jouée" }, `${s.statutBrut} ?`);
  return h("span", { class: "mj-etat " + CLASSE_STATUT[s.statut] }, libelleStatut(s.statut));
}
const chip = texte => h("span", { class: "jr-puce" }, texte);

/**
 * Cadre commun des écrans du MJ : bandeau (nom du JDR, actualiser, menu), panneau avec onglets, puis le contenu.
 * `actif` : "accueil" | "joueurs". Le panneau « monte » sur le bandeau comme sur l'application du joueur.
 */
export function cadreMJ(ctx, { actif = "accueil", titre } = {}, ...contenu) {
  const a = ctx.actions;
  const nom = titre || ctx.profil.nom || "Ton JDR";
  const menu = () => {
    const fermer = feuille("Menu du MJ", h("div", { class: "jr-menu" },
      h("p", { class: "jr-meta" }, "Écran du MJ : lecture seule pour l'instant."),
      h("button", { class: "jr-bouton", type: "button", onclick: () => { fermer(); a.actualiser(); } }, icon("clock", 18), "Actualiser"),
      h("button", { class: "jr-bouton", type: "button", onclick: () => { fermer(); a.deconnecter(); } }, icon("lock", 18), "Se déconnecter")));
  };
  const onglet = (id, ic, libelle, { href, onclick } = {}) => h(href ? "a" : "button", { class: "mj-onglet" + (id === actif ? " on" : ""), href, type: href ? null : "button", onclick, "aria-current": id === actif ? "page" : null }, icon(ic, 20), h("span", null, libelle));
  return h("div", { class: "mj" },
    h("div", { class: "mj-bandeau" },
      h("div", { class: "mj-nom" }, h("span", { class: "mj-kicker" }, "Écran du MJ"), h("h1", null, nom)),
      h("div", { class: "mj-ronds" },
        h("button", { class: "jr-rond", type: "button", "aria-label": "Actualiser", title: "Actualiser", onclick: () => a.actualiser() }, icon("clock", 22)),
        h("button", { class: "jr-rond", type: "button", "aria-label": "Menu", title: "Menu", onclick: menu }, icon("dots", 22)))),
    h("div", { class: "mj-panneau" },
      h("nav", { class: "mj-onglets", "aria-label": "Écrans du MJ" },
        onglet("accueil", "book", "Accueil", { href: "#/mj" }),
        onglet("joueurs", "friends", "Joueurs", { href: "#/mj/joueurs" }),
        a.versMoteur ? onglet("moteur", "scroll", "Listes", { onclick: () => a.versMoteur() }) : null),
      h("div", { class: "mj-contenu" }, contenu)));
}

/** Bloc « Prochaine session ». */
function blocSession(ctx, r) {
  const kicker = h("div", { class: "jr-kicker mj-hero-kicker" }, icon("calendar", 16), "Prochaine session");
  if (r.absent) return h("section", { class: "mj-hero vide" }, kicker, message("Ce JDR ne déclare pas de collection « session » : rien à montrer ici.", "info"));
  const dos = (ctx.profil.collections || []).find(c => c.id === "session");
  if (!r.aVenir) {
    return h("section", { class: "mj-hero vide" }, kicker,
      h("p", { class: "mj-hero-vide" }, "Aucune session de jeu n'est prête."),
      h("p", { class: "jr-meta" }, `Prépare un fichier dans « ${dos ? dos.dossier : "Sessions"} » et écris « statut: prête » dans son en-tête : il apparaîtra ici.`),
      r.sessions.length ? h("p", { class: "jr-meta" }, `${r.sessions.length} session${r.sessions.length > 1 ? "s" : ""} dans le dossier, aucune prête.`) : null,
      listeSessions(r));
  }
  const s = r.aVenir.session;
  const reperes = [s.saison != null ? `Saison ${s.saison}` : "", s.numero != null ? `Session ${s.numero}` : "", s.lieu ? `Lieu : ${s.lieu}` : "", s.date ? s.date : ""].filter(Boolean);
  const n = r.aVenir.autres;
  return h("section", { class: "mj-hero" },
    kicker,
    h("h2", { class: "mj-hero-titre" }, s.titre),
    reperes.length ? h("div", { class: "jr-puces" }, reperes.map(chip)) : null,
    h("a", { class: "jr-bouton gros mj-hero-bouton", href: `#/mj/session/${enc(s.fichier)}` }, icon("book", 22), "Ouvrir la session de jeu"),
    n > 0 ? h("p", { class: "jr-meta" }, `${n} autre${n > 1 ? "s" : ""} session${n > 1 ? "s" : ""} aussi « prête${n > 1 ? "s" : ""} » : la première (saison puis numéro) est montrée.`) : null,
    listeSessions(r));
}
function listeSessions(r) {
  if (!r.sessions.length || (r.sessions.length === 1 && r.aVenir)) return null;
  return h("details", { class: "mj-autres" }, h("summary", null, `Toutes les sessions de jeu (${r.sessions.length})`),
    h("ul", { class: "mj-liste-simple" }, r.sessions.map(x => h("li", null, h("a", { href: `#/mj/session/${enc(x.fichier)}` },
      h("span", { class: "mj-num" }, x.saison != null && x.numero != null ? `S${x.saison}·${x.numero}` : x.numero != null ? String(x.numero) : "·"),
      h("span", { class: "mj-li-titre" }, x.titre), badgeStatut(x))))));
}

/** Carte d'un lieu dans la liste. */
function carteLieu(l) {
  const etat = l.etat === "" ? "sans" : l.etat === "?" ? "inconnu" : l.etat;
  const puces = [l.type, l.region].filter(Boolean);
  const meta = [l.sections.length ? `${l.sections.length} section${l.sections.length > 1 ? "s" : ""}` : "", taille(l.caracteres)].filter(Boolean).join(" · ");
  return h("li", null, h("a", { class: "mj-lieu e-" + etat, href: `#/mj/lieu/${enc(l.fichier)}` },
    h("span", { class: "mj-num-tuile" }, l.numero || "·"),
    h("span", { class: "mj-lieu-col" },
      h("span", { class: "mj-lieu-ligne" }, h("span", { class: "mj-lieu-titre" }, l.titre), badgeEtat(l)),
      puces.length ? h("span", { class: "jr-puces" }, puces.map(chip)) : null,
      h("span", { class: "mj-lieu-meta" }, meta, l.secrets ? h("span", { class: "mj-secrets", title: "Contient des sections réservées au MJ" }, icon("lock", 13), "Secrets MJ") : null))));
}

/** Accueil du MJ. */
export async function ecranAccueilMJ(ctx) {
  const [rl, rs] = await Promise.all([ctx.donnees.lieux(), ctx.donnees.sessions()]);
  const filtre = ctx.etat.accueilMJ || (ctx.etat.accueilMJ = { texte: "", etat: "" });
  const zone = h("ul", { class: "mj-lieux" });
  const compte = h("span", { class: "jr-meta mj-compte" });
  const pastilles = h("div", { class: "jr-puces filtre mj-filtres", role: "group", "aria-label": "Filtrer par état" });
  const c = compterEtats(rl.lieux);
  const bascule = cle => { filtre.etat = filtre.etat === cle ? "" : cle; dessiner(); };
  const puce = (cle, libelle, n, { toujours = true } = {}) => (!toujours && !n && filtre.etat !== cle ? null
    : h("button", { class: "jr-pastille petite" + (filtre.etat === cle ? " on" : "") + (!n && cle ? " zero" : ""), type: "button", "aria-pressed": String(filtre.etat === cle), onclick: () => bascule(cle) },
      cle && cle !== "sans" && cle !== "inconnu" ? h("span", { class: "mj-point " + cle }) : null, libelle, h("span", { class: "mj-n" }, String(n))));
  const dessiner = () => {
    const vus = filtrerLieux(rl.lieux, filtre);
    zone.replaceChildren(...vus.map(carteLieu));
    compte.textContent = vus.length === rl.lieux.length ? `${rl.lieux.length} lieu${rl.lieux.length > 1 ? "x" : ""}` : `${vus.length} sur ${rl.lieux.length}`;
    pastilles.replaceChildren(...[
      h("button", { class: "jr-pastille petite" + (!filtre.etat ? " on" : ""), type: "button", "aria-pressed": String(!filtre.etat), onclick: () => { filtre.etat = ""; dessiner(); } }, "Tous", h("span", { class: "mj-n" }, String(c.tous))),
      ...ETATS_LIEU.map(e => puce(e.cle, e.libelle, c[e.cle])),
      puce("sans", "Sans état", c.sans, { toujours: false }),
      puce("inconnu", "À vérifier", c.inconnu, { toujours: false })
    ].filter(Boolean));
    if (!vus.length && rl.lieux.length) zone.append(h("li", { class: "mj-aucun" }, h("p", { class: "jr-vide" }, "Aucun lieu ne correspond à ce filtre.")));
  };
  const champ = h("input", { class: "mj-recherche-champ", type: "search", placeholder: "Chercher un lieu…", value: filtre.texte, "aria-label": "Chercher un lieu", oninput: () => { filtre.texte = champ.value; dessiner(); } });
  const recherche = h("label", { class: "mj-recherche" }, icon("search", 20), champ);

  const dosLieu = (ctx.profil.collections || []).find(x => x.id === "lieu");
  const lieux = h("section", { class: "mj-lieux-bloc" },
    h("div", { class: "mj-lieux-tete" }, h("h2", null, "Lieux"), compte),
    rl.absent ? message(dosLieu ? `Le dossier « ${dosLieu.dossier} » n'existe pas encore : crée-le (le générateur le fait) et dépose-y tes fichiers de lieu en Markdown.` : "Ce JDR ne déclare pas de collection « lieu ».", "info")
      : !rl.lieux.length ? message(`Aucun fichier de lieu dans « ${dosLieu.dossier} ». Un fichier par ville ou lieu, au format Markdown (.md).`, "info")
        : [recherche, pastilles, zone]);
  const page = cadreMJ(ctx, { actif: "accueil" }, (rl.perime || rs.perime) ? message(COPIE_ANCIENNE, "alerte") : null, blocSession(ctx, rs), lieux);
  if (rl.lieux.length) dessiner();
  return { page };
}

/** Lecture d'un lieu ou d'une session de jeu : sommaire des sections, texte complet (tableaux compris). */
export async function ecranDocumentMJ(ctx, collection, fichier) {
  const [liste, r] = await Promise.all([collection === "lieu" ? ctx.donnees.lieux() : ctx.donnees.sessions(), ctx.donnees.document(collection, fichier)]);
  const entree = (collection === "lieu" ? liste.lieux : liste.sessions).find(x => x.fichier === fichier) || null;
  const retour = h("a", { class: "jr-retour", href: "#/mj" }, icon("back", 18), "Accueil du MJ");
  if (r.texte == null) return { page: cadreMJ(ctx, { actif: "accueil" }, retour, message("Ce fichier n'existe plus dans le dossier.", "erreur")) };
  const d = parseDoc(r.texte);
  const titre = (entree && entree.titre) || d.title || fichier.replace(/\.md$/i, "");
  const reperes = entree
    ? (collection === "lieu"
      ? [entree.type, entree.region, entree.numero ? `n° ${entree.numero}` : ""]
      : [entree.saison != null ? `Saison ${entree.saison}` : "", entree.numero != null ? `Session ${entree.numero}` : "", entree.lieu ? `Lieu : ${entree.lieu}` : "", entree.date]).filter(Boolean)
    : [];
  const noeuds = rendreMarkdown(d.body);   // le premier « # titre » est retiré : il est dans l'en-tête
  const corps = h("article", { class: "jr-md mj-corps" }, noeuds);
  // Sommaire : un lien par section de niveau 2 (« ## » est dessiné en h3) ; défilement par script, les adresses de la page servent au routeur.
  const sections = noeuds.filter(n => n.tagName === "H3");
  const secret = n => /🔴|secret/i.test(n.textContent);
  sections.forEach(n => { if (secret(n)) n.classList.add("mj-secret"); });
  const sommaire = sections.length
    ? h("details", { class: "mj-sommaire", open: typeof matchMedia === "function" && matchMedia("(min-width: 901px)").matches },
      h("summary", null, icon("scroll", 18), `Sections (${sections.length})`, h("span", { class: "mj-sommaire-fleche" }, icon("chev_d", 18))),
      h("ul", null, sections.map(n => h("li", null, h("button", { type: "button", class: secret(n) ? "mj-secret" : "", onclick: () => n.scrollIntoView({ behavior: "smooth", block: "start" }) }, n.textContent)))))
    : null;
  const haut = h("button", { class: "jr-rond grand mj-remonter", type: "button", "aria-label": "Remonter en haut de la page", onclick: () => window.scrollTo({ top: 0, behavior: "smooth" }) }, icon("chev_u", 24));
  const page = cadreMJ(ctx, { actif: "accueil" }, retour,
    h("div", { class: "mj-doc-tete" },
      h("h2", { class: "mj-doc-titre" }, titre),
      h("div", { class: "jr-puces" }, reperes.map(chip), entree ? (collection === "lieu" ? badgeEtat(entree) : badgeStatut(entree)) : null)),
    r.perime ? message(COPIE_ANCIENNE, "alerte") : null,
    h("div", { class: "mj-doc-corps" }, sommaire, corps), haut);
  return { page };
}

/* ------------------------------------------------------------------ Joueurs (tranche 2) */
const nomJoueur = p => String(p).replace(/_/g, " ");
const nombreOuTiret = v => (v == null ? "–" : String(v));

/** Une carte de joueur : portrait, nom, PV, valeurs de la fiche, bourse, compte des savoirs / quêtes / rencontres, et les deux accès. */
function carteJoueur(ctx, j) {
  const f = j.fiche;
  const enfant = ctx.donnees.pour(j.pseudo);
  const tete = h("div", { class: "mj-joueur-tete" },
    boiteImage({ donnees: enfant }, f && f.portrait, "jr-vignette ronde mj-portrait", "user"),
    h("div", { class: "mj-joueur-id" },
      h("h3", { class: "mj-joueur-nom" }, (f && f.nom) || nomJoueur(j.pseudo)),
      h("div", { class: "jr-meta" }, [f && norm(f.nom) === norm(nomJoueur(j.pseudo)) ? "" : nomJoueur(j.pseudo), f && f.classe ? f.classe.nom : ""].filter(Boolean).join(" · "))));
  const actions = h("div", { class: "mj-joueur-actions" },
    h("a", { class: "jr-bouton", href: `#/mj/joueur/${enc(j.pseudo)}` }, icon("lock", 18), "Notes MJ"),
    h("button", { class: "jr-bouton", type: "button", onclick: () => ctx.actions.voirComme(j.pseudo) }, icon("eye", 18), "Voir comme lui"));
  if (!f) {
    return h("li", null, h("article", { class: "mj-joueur sans-fiche" }, tete,
      message(j.erreur ? "Ce dossier ne s'est pas lu correctement." : "Aucune fiche lisible dans le dossier de ce joueur.", j.erreur ? "erreur" : "info"), actions));
  }
  const rapport = f.pv != null && f.pvMax ? Math.max(0, Math.min(1, f.pv / f.pvMax)) : null;
  const niveau = rapport == null ? "" : rapport <= 0.3 ? "bas" : rapport <= 0.6 ? "moyen" : "haut";
  const pv = h("div", { class: "mj-pv" + (niveau ? " " + niveau : "") },
    h("div", { class: "mj-pv-texte" }, h("span", null, "Points de vie"), h("strong", null, f.pv == null ? "–" : f.pvMax ? `${f.pv} / ${f.pvMax}` : String(f.pv))),
    rapport == null ? null : h("div", { class: "jr-pvbarre mj-pv-barre", role: "img", "aria-label": `${f.pv} points de vie sur ${f.pvMax}` }, h("div", { style: `width:${Math.round(rapport * 100)}%` })));
  const stat = (lib, v) => h("div", { class: "mj-stat" }, h("strong", null, nombreOuTiret(v)), h("span", null, lib));
  const c = j.comptes;
  const pl = (n, un, plus) => `${n} ${n > 1 ? plus : un}`;
  return h("li", null, h("article", { class: "mj-joueur" }, tete, pv,
    h("div", { class: "mj-stats" }, stat("Armure", f.armure), stat("Chance", f.chance), stat("Idée", f.idee)),
    f.bourse ? h("div", { class: "mj-bourse" }, icon("purse", 18), h("span", null, f.bourse)) : null,
    h("div", { class: "jr-puces" }, chip(pl(c.savoirs, "savoir", "savoirs")), chip(pl(c.quetes, "quête", "quêtes")), chip(pl(c.rencontres, "rencontre", "rencontres"))),
    actions));
}

/** Tableau de bord des joueurs. */
export async function ecranJoueursMJ(ctx) {
  const r = await ctx.donnees.joueurs();
  const contenu = [
    h("div", { class: "mj-doc-tete" }, h("h2", { class: "mj-doc-titre" }, "Joueurs"),
      h("p", { class: "jr-meta" }, "L'état de chaque joueur d'après son dossier. Lecture seule : « Voir comme lui » ouvre exactement ce qu'il voit.")),
    (r.perime) ? message(COPIE_ANCIENNE, "alerte") : null,
    r.absent ? message(`Le dossier « ${(ctx.profil.securite || {}).joueurs || "Joueurs"} » n'existe pas encore : crée-le avec le générateur.`, "info")
      : !r.joueurs.length ? message("Aucun dossier de joueur pour l'instant. Un dossier par joueur, créé par le générateur, avec sa fiche.", "info")
        : h("ul", { class: "mj-joueurs" }, r.joueurs.map(j => carteJoueur(ctx, j)))];
  return { page: cadreMJ(ctx, { actif: "joueurs" }, ...contenu) };
}

/** Notes du MJ sur un joueur : ses secrets et la fiche complète, gardés au coffre. */
export async function ecranJoueurMJ(ctx, pseudo) {
  const [secrets, fiche, apercu] = await Promise.all([ctx.donnees.documentJoueur(pseudo, "Secrets_MJ.md"), ctx.donnees.documentJoueur(pseudo, "Fiche_complete.md"), ctx.donnees.pour(pseudo).apercu().catch(() => null)]);
  const retour = h("a", { class: "jr-retour", href: "#/mj/joueurs" }, icon("back", 18), "Joueurs");
  const nom = (apercu && apercu.fiche && apercu.fiche.nom) || nomJoueur(pseudo);
  const bloc = (titre, doc, nomFichier, ouvert) => {
    const corps = doc.texte == null
      ? message(doc.absent ? "Ce JDR ne déclare pas de dossier de coffre par joueur." : `Aucun fichier « ${nomFichier} » au coffre pour ce joueur.`, "info")
      : h("article", { class: "jr-md mj-corps" }, rendreMarkdown(parseDoc(doc.texte).body));
    return h("details", { class: "mj-bloc-doc", open: ouvert }, h("summary", null, h("h2", null, titre), h("span", { class: "mj-sommaire-fleche" }, icon("chev_d", 18))), corps);
  };
  const page = cadreMJ(ctx, { actif: "joueurs" }, retour,
    h("div", { class: "mj-doc-tete" }, h("h2", { class: "mj-doc-titre" }, nom), h("p", { class: "jr-meta" }, `Notes du MJ · ${nomJoueur(pseudo)} · jamais visibles par les joueurs`)),
    (secrets.perime || fiche.perime) ? message(COPIE_ANCIENNE, "alerte") : null,
    bloc("Secrets du MJ", secrets, "Secrets_MJ.md", true),
    bloc("Fiche complète (copie du coffre)", fiche, "Fiche_complete.md", false));
  return { page };
}
