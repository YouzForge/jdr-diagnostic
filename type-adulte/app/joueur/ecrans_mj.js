// Écrans du MJ (D47, tranche 1, lecture seule) : l'accueil avec la liste des lieux et la session de jeu à venir, et la lecture d'un document du coffre.
// Pensés pour l'ordinateur (deux colonnes, large) et lisibles sur téléphone (une colonne). Rien ne s'écrit ici.
import { parseDoc } from "../../src/md/doc.js";
import { ETATS_LIEU, STATUTS_SESSION, filtrerLieux, compterEtats } from "../../src/mj/accueil.js";
import { h, icon, message, rendreMarkdown, pastille } from "./ui.js";

const enc = encodeURIComponent;
const COPIE_ANCIENNE = "Copie enregistrée sur cet appareil : la connexion ne répond pas.";
const libelleEtat = cle => (ETATS_LIEU.find(e => e.cle === cle) || {}).libelle;
const libelleStatut = cle => (STATUTS_SESSION.find(e => e.cle === cle) || {}).libelle;
const taille = n => (n >= 1000 ? `${Math.round(n / 1000)} Ko` : `${n} car.`);

/** Pastille d'état d'un lieu ; une valeur non reconnue est montrée telle que le MJ l'a écrite, avec un avertissement. */
function badgeEtat(l) {
  if (l.etat === "") return h("span", { class: "mj-etat sans", title: "Aucun état écrit dans l'en-tête (champ « etat »)" }, "—");
  if (l.etat === "?") return h("span", { class: "mj-etat inconnu", title: "Valeur non reconnue : à venir, en cours ou joué" }, `${l.etatBrut} ?`);
  return h("span", { class: "mj-etat " + l.etat }, libelleEtat(l.etat));
}
function badgeStatut(s) {
  if (s.statut === "") return h("span", { class: "mj-etat sans" }, "—");
  if (s.statut === "?") return h("span", { class: "mj-etat inconnu" }, `${s.statutBrut} ?`);
  return h("span", { class: "mj-etat " + (s.statut === "jouee" ? "joue" : s.statut === "prete" ? "en_cours" : "a_venir") }, libelleStatut(s.statut));
}

function barreHaut(ctx, titre, sous) {
  const a = ctx.actions;
  return h("div", { class: "mj-haut" },
    h("div", { class: "mj-haut-titre" }, h("h1", null, titre), sous ? h("p", { class: "jr-meta" }, sous) : null),
    h("div", { class: "mj-haut-actions" },
      h("a", { class: "jr-bouton", href: "#/mj/joueurs" }, icon("user", 18), "Voir comme un joueur"),
      a.versMoteur ? h("button", { class: "jr-bouton", type: "button", onclick: () => a.versMoteur() }, icon("scroll", 18), "Listes du moteur") : null,
      h("button", { class: "jr-bouton", type: "button", onclick: () => a.actualiser() }, icon("clock", 18), "Actualiser"),
      h("button", { class: "jr-bouton", type: "button", onclick: () => a.deconnecter() }, icon("lock", 18), "Se déconnecter")));
}

/** Bloc « Prochaine session ». */
function blocSession(ctx, r) {
  if (r.absent) return h("section", { class: "mj-prochaine" }, h("h2", null, "Prochaine session"), message("Ce JDR ne déclare pas de collection « session » : rien à montrer ici.", "info"));
  const dos = (ctx.profil.collections || []).find(c => c.id === "session");
  if (!r.aVenir) {
    return h("section", { class: "mj-prochaine vide" }, h("h2", null, "Prochaine session"),
      h("p", { class: "jr-vide" }, `Aucune session de jeu n'est prête. Prépare un fichier dans « ${dos ? dos.dossier : "Sessions"} » avec « statut: prête » dans son en-tête : il apparaîtra ici.`),
      r.sessions.length ? h("p", { class: "jr-meta" }, `${r.sessions.length} session${r.sessions.length > 1 ? "s" : ""} dans le dossier (aucune prête).`) : null);
  }
  const s = r.aVenir.session;
  const repere = [s.saison != null ? `Saison ${s.saison}` : "", s.numero != null ? `Session ${s.numero}` : "", s.lieu ? `Lieu : ${s.lieu}` : "", s.date ? s.date : ""].filter(Boolean).join(" · ");
  return h("section", { class: "mj-prochaine" },
    h("h2", null, "Prochaine session"),
    h("div", { class: "mj-prochaine-corps" },
      h("div", { class: "mj-prochaine-texte" }, h("div", { class: "mj-prochaine-titre" }, s.titre), repere ? h("div", { class: "jr-meta" }, repere) : null),
      h("a", { class: "jr-bouton gros", href: `#/mj/session/${enc(s.fichier)}` }, icon("book", 20), "Ouvrir la session de jeu")),
    r.aVenir.autres > 0 ? h("p", { class: "jr-meta" }, `${r.aVenir.autres} autre${r.aVenir.autres > 1 ? "s" : ""} session${r.aVenir.autres > 1 ? "s" : ""} aussi « prête${r.aVenir.autres > 1 ? "s" : ""} » : la première (saison puis numéro) est montrée.`) : null,
    r.sessions.length > 1 || (r.sessions.length === 1 && !r.aVenir)
      ? h("details", { class: "mj-autres" }, h("summary", null, `Toutes les sessions de jeu (${r.sessions.length})`),
        h("ul", { class: "mj-liste-simple" }, r.sessions.map(x => h("li", null, h("a", { href: `#/mj/session/${enc(x.fichier)}` }, h("span", { class: "mj-num" }, x.saison != null && x.numero != null ? `S${x.saison}·${x.numero}` : x.numero != null ? String(x.numero) : "·"), h("span", { class: "mj-li-titre" }, x.titre), badgeStatut(x))))))
      : null);
}

/** Carte d'un lieu dans la liste. */
function carteLieu(l) {
  const reperes = [l.type, l.region].filter(Boolean).join(" · ");
  return h("li", null, h("a", { class: "mj-lieu", href: `#/mj/lieu/${enc(l.fichier)}` },
    h("span", { class: "mj-num" }, l.numero || "·"),
    h("span", { class: "mj-lieu-col" },
      h("span", { class: "mj-lieu-titre" }, l.titre),
      h("span", { class: "jr-meta" }, [reperes, l.sections.length ? `${l.sections.length} sections` : "", taille(l.caracteres), l.secrets ? "🔴 secrets MJ" : ""].filter(Boolean).join(" · "))),
    badgeEtat(l)));
}

/** Accueil du MJ. */
export async function ecranAccueilMJ(ctx) {
  const [rl, rs] = await Promise.all([ctx.donnees.lieux(), ctx.donnees.sessions()]);
  const filtre = ctx.etat.accueilMJ || (ctx.etat.accueilMJ = { texte: "", etat: "" });
  const nom = ctx.profil.nom || "Ton JDR";
  const page = h("div", { class: "mj" }, barreHaut(ctx, nom, "Écran du MJ"));
  if (rl.perime || rs.perime) page.append(message(COPIE_ANCIENNE, "alerte"));
  page.append(blocSession(ctx, rs));

  const zone = h("ul", { class: "mj-lieux" });
  const compte = h("div", { class: "jr-meta mj-compte" });
  const pastilles = h("div", { class: "jr-puces mj-filtres", role: "group", "aria-label": "Filtrer par état" });
  const c = compterEtats(rl.lieux);
  const dessiner = () => {
    const vus = filtrerLieux(rl.lieux, filtre);
    zone.replaceChildren(...vus.map(carteLieu));
    compte.textContent = vus.length === rl.lieux.length ? `${rl.lieux.length} lieu${rl.lieux.length > 1 ? "x" : ""}` : `${vus.length} sur ${rl.lieux.length}`;
    pastilles.replaceChildren(
      pastille(`Tous ${c.tous}`, { actif: !filtre.etat, onclick: () => { filtre.etat = ""; dessiner(); } }),
      ...ETATS_LIEU.map(e => pastille(`${e.libelle} ${c[e.cle]}`, { actif: filtre.etat === e.cle, onclick: () => { filtre.etat = filtre.etat === e.cle ? "" : e.cle; dessiner(); } })),
      c.sans + c.inconnu ? pastille(`Sans état ${c.sans + c.inconnu}`, { actif: filtre.etat === "sans", onclick: () => { filtre.etat = filtre.etat === "sans" ? "" : "sans"; dessiner(); } }) : null);
    if (!vus.length && rl.lieux.length) zone.append(h("li", null, h("p", { class: "jr-vide" }, "Aucun lieu ne correspond.")));
  };
  const champ = h("input", { class: "mj-recherche", type: "search", placeholder: "Chercher un lieu (nom, région, numéro)", value: filtre.texte, "aria-label": "Chercher un lieu", oninput: () => { filtre.texte = champ.value; dessiner(); } });

  const dosLieu = (ctx.profil.collections || []).find(x => x.id === "lieu");
  page.append(h("section", { class: "mj-lieux-bloc" },
    h("div", { class: "mj-lieux-tete" }, h("h2", null, "Lieux"), compte),
    rl.absent ? message(dosLieu ? `Le dossier « ${dosLieu.dossier} » n'existe pas encore : crée-le (le générateur le fait) et dépose-y tes fichiers de lieu en Markdown.` : "Ce JDR ne déclare pas de collection « lieu ».", "info")
      : !rl.lieux.length ? message(`Aucun fichier de lieu dans « ${dosLieu.dossier} ». Un fichier par ville ou lieu, au format Markdown (.md).`, "info")
        : [champ, pastilles, zone]));
  if (rl.lieux.length) dessiner();
  return { page };
}

/** Lecture d'un lieu ou d'une session de jeu : sommaire des sections, texte complet (tableaux compris). */
export async function ecranDocumentMJ(ctx, collection, fichier) {
  const [liste, r] = await Promise.all([collection === "lieu" ? ctx.donnees.lieux() : ctx.donnees.sessions(), ctx.donnees.document(collection, fichier)]);
  const entree = (collection === "lieu" ? liste.lieux : liste.sessions).find(x => x.fichier === fichier) || null;
  const retour = h("a", { class: "jr-retour", href: "#/mj" }, icon("back", 18), "Accueil du MJ");
  if (r.texte == null) return { page: h("div", { class: "mj mj-doc" }, retour, message("Ce fichier n'existe plus dans le dossier.", "erreur")) };
  const d = parseDoc(r.texte);
  const titre = (entree && entree.titre) || d.title || fichier.replace(/\.md$/i, "");
  const reperes = entree
    ? (collection === "lieu"
      ? [entree.type, entree.region, entree.numero ? `n° ${entree.numero}` : ""]
      : [entree.saison != null ? `Saison ${entree.saison}` : "", entree.numero != null ? `Session ${entree.numero}` : "", entree.lieu ? `Lieu : ${entree.lieu}` : "", entree.date]).filter(Boolean).join(" · ")
    : "";
  const noeuds = rendreMarkdown(d.body);   // le premier « # titre » est retiré : il est dans l'en-tête
  const corps = h("article", { class: "jr-md mj-corps" }, noeuds);
  // Sommaire : un lien par section de niveau 2 (« ## » est dessiné en h3) ; défilement par script, les adresses de la page servent au routeur.
  const sections = noeuds.filter(n => n.tagName === "H3");
  sections.forEach(n => { if (/🔴|secret/i.test(n.textContent)) n.classList.add("mj-secret"); });
  const sommaire = sections.length
    ? h("nav", { class: "mj-sommaire", "aria-label": "Sections" }, h("h2", null, "Sections"),
      h("ul", null, sections.map(n => h("li", null, h("button", { type: "button", class: /🔴|secret/i.test(n.textContent) ? "mj-secret" : "", onclick: () => n.scrollIntoView({ behavior: "smooth", block: "start" }) }, n.textContent)))))
    : null;
  const page = h("div", { class: "mj mj-doc" }, retour,
    h("div", { class: "mj-doc-tete" }, h("h1", null, titre), reperes ? h("p", { class: "jr-meta" }, reperes) : null, entree ? (collection === "lieu" ? badgeEtat(entree) : badgeStatut(entree)) : null),
    r.perime ? message(COPIE_ANCIENNE, "alerte") : null,
    h("div", { class: "mj-doc-corps" }, sommaire, corps));
  return { page };
}
