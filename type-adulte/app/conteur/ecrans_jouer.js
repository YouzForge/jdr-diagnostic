// Mode Jouer : l'aide-mémoire de la partie, téléphone posé sur la table. Port fidèle de « Petite Feuille » : étapes, voies, fins A/B/autre,
// cœurs et armure, potions en deux moitiés (avec « Annuler »), dés 2d6, règles en bref, phrases de l'enfant, écran allumé.
// La séance entière est gardée sur le téléphone (clé « partie ») : fermer l'application ne perd rien ; le récap la relit.
import { h, icon, hearts, spinner, enligne, rendreMarkdown, ouvrirFeuille, de } from "./ui.js?v=0.17.0";
import { lireEtapes, sectionsDeRegles } from "../../src/conteur/etapes.js?v=0.17.0";
import { parseVoie } from "../../src/conteur/voies.js?v=0.17.0";
import { controleHistoire } from "../../src/conteur/controle.js?v=0.17.0";
import { ajouterPotion, boire, annuler, peutAnnuler } from "../../src/conteur/potions.js?v=0.17.0";
import { nouvelleSeance, bornerEtape, ajouterJet, deuxRatesDeSuite, finsDe, pastilleVoie, estReussite } from "../../src/conteur/seance.js?v=0.17.0";
import { recapMarkdown, reprendreBrouillon, nomRecap } from "../../src/conteur/recap.js?v=0.17.0";

const SECTIONS_REGLES = ["4.1", "4.2", "4.3", "4.4", "4.5", "4.9", "4.10"];
const aller = chemin => { location.hash = "#" + chemin; };
const alea6 = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % 6) + 1; };

/** Partie en cours (gardée sur ce téléphone) : { file, titre, … } ou null. */
export function partieEnCours(ctx) {
  try { const p = JSON.parse(ctx.memoire.lire("partie") || "null"); return p && p.file ? p : null; } catch { return null; }
}
const garder = (ctx, s) => ctx.memoire.ecrire("partie", JSON.stringify(s));
const oublier = ctx => { try { localStorage.removeItem(`jdr:${ctx.profil.id}:partie`); localStorage.removeItem(`jdr:${ctx.profil.id}:recap`); } catch { /* sans importance */ } };
const prenomDe = ctx => ctx.donnees.prenom() || "l'aventurière";

/* ------------------------------------------------------------------ Outils : dés + règles en bref */
function corpsOutils(ctx, s, apresJet) {
  const onglets = h("div", { class: "tabs" });
  const volet = h("div");
  const bDes = h("button", { class: "tab on" }, "Dés"), bRegles = h("button", { class: "tab" }, "Règles en bref");
  onglets.append(bDes, bRegles);
  const seuil = ctx.regles.seuilDe;
  const regleDes = ctx.profil.modules && ctx.profil.modules.des && ctx.profil.modules.des.regle;
  const rappel = `Réussite : au moins un ${seuil === 6 ? "6" : `${seuil} ou un 6`}, ou un double.`;

  const montrerDes = () => {
    bDes.className = "tab on"; bRegles.className = "tab";
    const dernier = (s.jets || []).at(-1);
    const faces = h("div", { class: "dice" }, de(dernier ? dernier.a : 6), de(dernier ? dernier.b : 3));
    const verdict = h("div", { class: "verdict" });
    const aide = h("div", { class: "card" }, rappel);
    const bouton = h("button", { class: "btn red block", style: "font-size:22px;padding:16px" }, "Lancer 2d6");
    const montrer = (a, b) => {
      faces.replaceChildren(de(a), de(b));
      const ok = estReussite(a, b, seuil);
      verdict.className = "verdict " + (ok ? "win" : "miss"); verdict.textContent = ok ? "Réussite !" : "Pas cette fois";
      aide.textContent = ok ? rappel : (deuxRatesDeSuite(s) ? "Deux ratés de suite : propose un indice ou un allié (plan B). Pas d'accumulation d'échecs." : "Propose-lui une autre idée ou un petit coup de pouce.");
    };
    if (dernier) montrer(dernier.a, dernier.b);
    bouton.addEventListener("click", () => {
      bouton.disabled = true; let n = 0;
      const t = setInterval(() => {
        faces.replaceChildren(de(alea6()), de(alea6()));
        if (++n >= 7) { clearInterval(t); const a = alea6(), b = alea6(); ajouterJet(s, a, b, seuil); apresJet(); montrer(a, b); bouton.disabled = false; }
      }, 80);
    });
    volet.replaceChildren(...[h("div", { class: "card center" }, faces, verdict), aide, regleDes ? h("div", { class: "muted", style: "font-size:15px" }, regleDes) : null, bouton].filter(Boolean));
  };
  const montrerRegles = async () => {
    bRegles.className = "tab on"; bDes.className = "tab";
    volet.replaceChildren(spinner("Chargement des règles…"));
    try {
      const r = await ctx.donnees.lire("00_REGLES_PROJET.md");
      const parts = r.texte ? sectionsDeRegles(r.texte, SECTIONS_REGLES) : [];
      volet.replaceChildren(h("div", { class: "card md" }, ...(parts.length ? rendreMarkdown(parts.join("\n\n")) : [h("p", null, "Règles introuvables.")])));
    } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; volet.replaceChildren(h("div", { class: "card ko" }, "Impossible de lire les règles : " + (e.message || e))); }
  };
  bDes.addEventListener("click", montrerDes); bRegles.addEventListener("click", montrerRegles);
  montrerDes();
  return h("div", { class: "list" }, onglets, volet);
}

/* ------------------------------------------------------------------ les fins : un bouton par fin prévue + « Autre fin » */
function boiteFins(fields, fin, choisir) {
  const coche = () => icon("check", 24, "#fff", 3);
  const boutons = finsDe(fields).map(e => {
    const actif = !!fin && fin.code === e.code;
    return h("button", { class: "fin-btn" + (actif ? " on" : ""), "aria-pressed": String(actif), onclick: () => choisir(actif ? null : { code: e.code, texte: e.texte }) },
      h("span", { class: "fin-code" }, actif ? coche() : "Fin " + e.code), h("span", { class: "fin-text" }, actif ? `Fin ${e.code} : ${e.texte}` : e.texte));
  });
  const autre = !!fin && fin.code === "autre";
  boutons.push(h("button", { class: "fin-btn autre" + (autre ? " on" : ""), "aria-pressed": String(autre), onclick: () => choisir("autre") },
    h("span", { class: "fin-code" }, autre ? coche() : icon("plus", 22, "currentColor", 3)), h("span", { class: "fin-text" }, autre ? "Autre fin : " + fin.texte : "Autre fin")));
  return h("div", { class: "fins" }, h("div", { class: "kicker" }, "Comment l'histoire se termine ?"),
    h("div", { style: "font-size:15px;color:var(--muted)" }, "Touche la fin choisie : elle sera dans le récap du soir."), boutons);
}

/* ------------------------------------------------------------------ une étape */
function carteEtape(ctx, etape, surDemande, fin, surFin) {
  const enfants = [h("h2", { style: "font-size:30px" }, etape.title)];
  let nbVoies = 0, finFaite = false;
  for (const f of etape.fields) {
    if (f.note) { enfants.push(h("div", { class: "muted", style: "font-style:italic" }, f.text)); continue; }
    const cle = f.label.toLowerCase();
    const liste = f.items.length ? h("ul", { class: "steplist" }, f.items.map(i => h("li", null, enligne(i)))) : null;
    const texte = f.text ? h("div", null, enligne(f.text)) : null;
    let v;
    if (/^[àa] trouver/.test(cle)) enfants.push(h("div", { style: "font-size:19px" }, h("span", { style: "color:var(--red);font-weight:800" }, "À trouver : "), h("span", null, enligne(f.text))));
    else if ((v = parseVoie(f.label))) {
      nbVoies++;
      enfants.push(h("div", { class: "voie vt-" + v.type.cle + (v.verrou ? " verrou" : "") },
        h("div", { class: "voie-head" }, icon(v.verrou ? "lock" : v.type.icone, 24, "currentColor"), h("strong", null, v.titre), v.type.nom ? h("span", { class: "vtype" }, v.type.nom) : null,
          h("span", { class: "pill" + (v.verrou ? " pill-lock" : "") }, pastilleVoie(v))), texte, liste));
    } else if (/^fin\s*[a-z0-9]*\s*$/i.test(cle)) {
      if (finFaite) continue;                                  // toutes les fins sont regroupées au premier « Fin … »
      finFaite = true; enfants.push(boiteFins(etape.fields, fin, surFin));
    } else if (/^si elle h[ée]site/.test(cle)) enfants.push(h("div", { class: "tip" }, h("strong", null, "Si elle hésite : "), h("span", null, enligne(f.text)), liste));
    else enfants.push(h("div", { class: "card" }, h("strong", null, f.label), texte, liste));
  }
  const max = ctx.regles.maxVoies;
  if (nbVoies > max) enfants.push(h("div", { style: "font-size:15px;color:var(--muted)" }, `Plus de ${max} voies dans cette étape : c'est beaucoup pour un jeune enfant (à alléger).`));
  enfants.push(h("button", { class: "ask", onclick: surDemande }, "Que fais-tu ?"));
  return h("div", { class: "card stepcard" }, enfants);
}

/* ------------------------------------------------------------------ l'écran Jouer */
export async function ecranJouer(ctx, fichier) {
  const { item } = await ctx.donnees.element("prochaine", fichier).catch(async e => { if (e && (e.status === 401 || e.auth)) throw e; return ctx.donnees.element("histoire", fichier); });
  const etapes = lireEtapes(item.body);
  let s = partieEnCours(ctx);
  if (!s || s.file !== fichier) {
    let etat = {}; try { etat = await ctx.donnees.etatHeros(); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
    s = nouvelleSeance({ file: fichier, titre: item.name, etat, etapes, regles: ctx.regles });
    garder(ctx, s);
  }
  const sauver = () => garder(ctx, s);
  const prenom = prenomDe(ctx);

  let veille = null;
  const garderEveille = async () => { try { if ("wakeLock" in navigator && document.visibilityState === "visible") veille = await navigator.wakeLock.request("screen"); } catch { /* tant pis */ } };
  garderEveille();
  const auRetour = () => garderEveille();
  document.addEventListener("visibilitychange", auRetour);
  const fermetures = [];
  let flash = "";
  const racine = h("div", { class: "jouer" });

  const dessiner = () => {
    bornerEtape(s, etapes.length);
    const entete = h("div", { class: "jhead" },
      h("div", { class: "grow" }, h("div", { class: "muted", style: "font-size:15px" }, item.name), h("div", { style: "font-size:19px;font-weight:800" }, etapes.length ? `Étape ${s.step + 1} sur ${etapes.length}` : "Aucune étape")),
      h("button", { class: "btn", onclick: () => fermetures.push(ouvrirFeuille("Outils", corpsOutils(ctx, s, sauver))) }, icon("dice", 24), "Outils"));
    const barres = h("div", { class: "bars" }, etapes.map((_, i) => h("button", { class: "bar" + (i <= s.step ? " on" : ""), "aria-label": `Étape ${i + 1}`, onclick: () => { s.step = i; sauver(); dessiner(); } })));
    const noeudEtape = etapes.length
      ? carteEtape(ctx, etapes[s.step], demander, s.fin, choisirFin)
      : h("div", { class: "card md" }, h("h3", null, "Cette histoire n'a pas d'étapes de jeu lisibles"),
          h("div", { class: "muted" }, controleHistoire(item.body, { maxVoies: ctx.regles.maxVoies }).problemes.join(" ") + " Voir le modèle d'histoire. En attendant, voici son contenu :"), ...rendreMarkdown(item.body, { titreARetirer: item.name }));
    const nav = etapes.length > 1 ? h("div", { class: "row", style: "gap:10px" },
      h("button", { class: "btn grow", disabled: s.step === 0, onclick: () => { s.step--; sauver(); dessiner(); window.scrollTo(0, 0); } }, icon("back", 22), "Précédente"),
      h("button", { class: "btn grow", disabled: s.step >= etapes.length - 1, onclick: () => { s.step++; sauver(); dessiner(); window.scrollTo(0, 0); } }, "Suivante", icon("next", 22))) : null;

    const compteur = (nom, valeur, regler, max, remplissage) => h("div", { class: "counter" },
      h("button", { class: "iconbtn big", "aria-label": `Moins de ${nom}`, onclick: () => { regler(Math.max(0, valeur - 1)); sauver(); dessiner(); } }, icon("minus", 30)),
      h("div", { class: "cval", role: "status", "aria-label": `${valeur} ${nom}` },
        valeur > 0 && remplissage === "coeurs" ? hearts(valeur, 34, 150) : null,
        remplissage === "armure" ? [icon("shield", 38, "var(--ink)", 1.6, "#A9BDD1"), h("span", { style: "font:600 34px Fredoka" }, String(valeur))] : null,
        valeur === 0 && remplissage === "coeurs" ? h("span", { class: "muted" }, "0 cœur") : null),
      h("button", { class: "iconbtn big", "aria-label": `Plus de ${nom}`, onclick: () => { regler(Math.min(max, valeur + 1)); sauver(); dessiner(); } }, icon("plus", 30)));
    const boutonPotion = p => h("button", { class: "potion" + (p.reste === 1 ? " half" : ""),
      "aria-label": p.reste === 2 ? `${p.nom} : boire la moitié (${p.moitie} cœur${p.moitie > 1 ? "s" : ""})` : `${p.nom} : finir la potion (${p.entiere - p.moitie} cœur${p.entiere - p.moitie > 1 ? "s" : ""})`,
      onclick: () => {
        const r = boire(s, p.id); sauver();
        flash = r.ok ? `+${r.gain} cœur${r.gain > 1 ? "s" : ""}` + (r.fini ? " : potion finie !" : " : il reste la moitié.") : r.raison === "pleins" ? `Les cœurs de ${prenom} sont déjà pleins : la potion reste pour plus tard.` : "";
        dessiner();
      } }, icon("potion", 40, "var(--ink)", 1.8, p.reste === 2 ? "#C23B2E" : "#E9A9A2"), h("span", { class: "plabel" }, p.reste === 2 ? "Boire ½" : "Finir ½"));
    const ajouter = h("button", { class: "potion add", "aria-label": "Ajouter une potion", onclick: () => {
      const types = Object.keys(ctx.regles.potions);
      const ajout = t => { ajouterPotion(s, t, ctx.regles.potions); sauver(); flash = ""; dessiner(); };
      if (types.length === 1) return ajout(types[0]);
      let fermer;
      fermer = ouvrirFeuille("Ajouter une potion", h("div", { class: "list" }, types.map(t => h("button", { class: "btn block", onclick: () => { fermer(); ajout(t); } }, ctx.regles.potions[t].nom))));
      fermetures.push(fermer);
    } }, icon("plus", 26), h("span", { class: "plabel" }, "Potion"));
    const potions = h("div", { class: "potions" }, h("div", { class: "kicker" }, "Potions"),
      h("div", { class: "row", style: "gap:10px;flex-wrap:wrap" }, (s.potions || []).map(boutonPotion), ajouter,
        peutAnnuler(s) ? h("button", { class: "linkbtn", onclick: () => { annuler(s); sauver(); flash = ""; dessiner(); } }, "Annuler") : null),
      flash ? h("div", { class: "pflash", role: "status" }, flash) : null);
    const etat = h("div", { class: "card" }, compteur("cœurs", s.coeurs, v => { s.coeurs = v; }, 30, "coeurs"), potions, compteur("armure", s.armure, v => { s.armure = v; }, 5, "armure"),
      s.coeurs === 0 && ctx.profil.modules.coeurs && ctx.profil.modules.coeurs.jamais_mort !== false ? h("div", { class: "tip" }, `${prenom} tombe dans les pommes : elle va se reposer, puis elle repart. Rien de grave !`) : null);

    const phrase = h("button", { class: "btn primary block", style: "font-size:20px;padding:16px", onclick: noterPhrase }, icon("mic", 26, "#fff"), `Noter une phrase de ${prenom}` + (s.phrases.length ? ` (${s.phrases.length})` : ""));
    const terminer = h("button", { class: "btn block", style: "background:var(--ink);color:#fff;font-size:20px;padding:16px", onclick: () => { sauver(); aller("/mj/recap"); } }, "Terminer et faire le récap", icon("next", 24, "#fff"));
    const quitter = h("a", { class: "muted center", href: "#/mj/ce-soir", style: "font-size:15px;text-decoration:underline" }, "Quitter sans terminer (la partie est gardée)");
    racine.replaceChildren(...[entete, barres, noeudEtape, nav, etat, phrase, terminer, quitter].filter(Boolean));
  };

  const demander = () => {
    const voile = h("div", { class: "ask-overlay", onclick: () => voile.remove() },
      h("div", { style: "font:600 56px/1.1 Fredoka" }, "Que fais-tu ?"),
      h("div", { style: "font-size:20px;max-width:22em" }, "Accepte son idée, puis demande : « D'accord, mais comment tu fais ? »"));
    document.body.append(voile); fermetures.push(() => voile.remove());
  };
  const choisirFin = v => {
    if (v === "autre") {
      const champ = h("textarea", { class: "field", placeholder: `La fin imaginée par ${prenom}… (le micro du clavier fonctionne ici)`, "aria-label": "Autre fin" });
      if (s.fin && s.fin.code === "autre") champ.value = s.fin.texte;
      let fermer;
      const bouton = h("button", { class: "btn primary block", onclick: () => { const t = champ.value.trim(); if (!t) return; s.fin = { code: "autre", texte: t }; sauver(); fermer(); dessiner(); } }, "Enregistrer cette fin");
      fermer = ouvrirFeuille("Autre fin", h("div", { class: "list" }, h("div", { class: "muted" }, `Note la fin que ${prenom} a imaginée.`), champ, bouton));
      fermetures.push(fermer); setTimeout(() => champ.focus(), 50); return;
    }
    if (v) s.fin = v; else delete s.fin;
    sauver(); dessiner();
  };
  const noterPhrase = () => {
    const champ = h("textarea", { class: "field", placeholder: `Ce que ${prenom} vient de dire ou d'inventer… (le micro du clavier fonctionne ici)`, "aria-label": "Phrase de l'enfant" });
    const liste = h("div", { class: "list" });
    const tracer = () => liste.replaceChildren(...s.phrases.slice().reverse().map(p => h("div", { class: "card" }, p.t)));
    tracer();
    let fermer;
    const bouton = h("button", { class: "btn primary block", onclick: () => { const t = champ.value.trim(); if (!t) return; s.phrases.push({ t, at: Date.now() }); sauver(); champ.value = ""; tracer(); dessiner(); } }, "Enregistrer la phrase");
    fermer = ouvrirFeuille(`Phrase de ${prenom}`, h("div", { class: "list" }, champ, bouton, s.phrases.length ? h("div", { class: "kicker" }, "Déjà notées") : null, liste));
    fermetures.push(fermer); setTimeout(() => champ.focus(), 50);
  };

  dessiner();
  return { bare: true, node: racine, cleanup: () => { document.removeEventListener("visibilitychange", auRetour); try { veille && veille.release(); } catch { /* ok */ } fermetures.forEach(f => { try { f(); } catch { /* ok */ } }); } };
}

/* ------------------------------------------------------------------ Récap du soir */
export async function ecranRecap(ctx) {
  const s = partieEnCours(ctx);
  const prenom = prenomDe(ctx);
  const cleBrouillon = "recap";
  const lire = () => { try { return JSON.parse(ctx.memoire.lire(cleBrouillon) || "null"); } catch { return null; } };
  const { recap: r, change } = reprendreBrouillon(lire(), s, { prenom, mj: "", maintenant: Date.now() });
  const sauverBrouillon = () => ctx.memoire.ecrire(cleBrouillon, JSON.stringify(r));
  if (change) sauverBrouillon();
  const dossier = ctx.donnees.colonne(ctx.regles.compteRendu).dossier;

  const etat = h("span", { class: "chip", style: "background:#E2EEE9" }, "Brouillon gardé sur ce téléphone");
  let minuterie = 0;
  const toucher = () => { clearTimeout(minuterie); minuterie = setTimeout(() => { sauverBrouillon(); etat.textContent = "Brouillon gardé sur ce téléphone"; }, 400); etat.textContent = "…"; };
  const titre = t => h("h2", { style: "color:var(--red);margin-top:10px" }, t);
  const libelle = t => h("label", { class: "kicker", style: "text-transform:none;letter-spacing:0;font-size:15px" }, t);
  const champ = (cle, lib, { zone = false, aide = "", num = false } = {}) => {
    const el = zone ? h("textarea", { class: "field", placeholder: aide || "À dicter ou écrire (le micro du clavier marche partout)", style: "min-height:96px" }) : h("input", { class: "field", placeholder: aide, ...(num ? { inputmode: "numeric" } : {}) });
    el.value = r[cle] || "";
    el.addEventListener("input", () => { r[cle] = el.value; toucher(); });
    return h("div", { class: "list", style: "gap:6px" }, libelle(lib), el);
  };
  const choix = (cle, lib, options) => {
    const rang = h("div", { class: "row", style: "gap:10px" });
    const tracer = () => rang.replaceChildren(...options.map(o => h("button", { class: "tab" + (r[cle] === o ? " on" : ""), "aria-pressed": String(r[cle] === o), onclick: () => { r[cle] = o; toucher(); tracer(); } }, o)));
    tracer();
    return h("div", { class: "list", style: "gap:6px" }, libelle(lib), rang);
  };

  const msg = h("div", { class: "muted center" }, "Rien n'est perdu si tu t'endors avant : le brouillon est gardé.");
  const bouton = h("button", { class: "btn primary block", style: "font-size:20px;padding:16px" }, "Enregistrer dans OneDrive");
  const boiteFin = h("div");
  bouton.addEventListener("click", async () => {
    sauverBrouillon();
    if (!ctx.ecriture) { msg.className = "ko center"; msg.textContent = "L'écriture n'est pas activée pour ce JDR : le brouillon reste gardé sur ce téléphone."; return; }
    bouton.disabled = true; msg.className = "muted center"; msg.textContent = "Enregistrement…";
    const nom = nomRecap(r), chemin = `${dossier}/${nom}`;
    try {
      const existant = await ctx.depot.lireFiche(chemin);
      if (existant) throw Object.assign(new Error("Un récap de ce nom existe déjà : change le titre pour ne pas l'écraser."), { dejaLa: true });
      await ctx.depot.creer(chemin, recapMarkdown(r, prenom));
      msg.className = "ok center"; msg.textContent = `Enregistré : ${chemin}`;
      boiteFin.replaceChildren(h("button", { class: "btn block", style: "margin-top:10px", onclick: () => { oublier(ctx); location.hash = "#/mj/ce-soir"; } }, "La partie est terminée : fermer la séance"));
    } catch (e) {
      if (e && (e.status === 401 || e.auth)) throw e;
      msg.className = "ko center";
      msg.textContent = e.dejaLa ? e.message : e.status ? `Échec de l'enregistrement (${e.message}). Le brouillon est gardé.` : "Pas de réseau : le brouillon est gardé, réessaie plus tard.";
    }
    bouton.disabled = false;
  });
  return {
    title: "Récap du soir", back: "/mj/ce-soir", nav: "ce-soir",
    node: h("div", { class: "page with-nav" },
      h("div", { class: "row", style: "justify-content:space-between" }, etat),
      h("div", { class: "muted" }, "Fais défiler et remplis ce que tu veux. Les champs vides ne sont pas grave."),
      titre("L'essentiel"), champ("titre", "Titre de l'histoire"), champ("mj", "Qui a mené la partie"), champ("joueurs", "Qui a joué"), champ("duree", "Durée (minutes)", { num: true }), champ("resume", "Résumé en 3 lignes", { zone: true }),
      titre("Ce qui s'est passé, dans l'ordre"), champ("etapes", "Une ligne par moment", { zone: true }),
      titre("Comment l'histoire s'est terminée"), champ("fin", `La fin choisie par ${prenom} (ou imaginée par elle)`, { zone: true }),
      titre(`Les phrases de ${prenom}`), champ("phrases", "Captées pendant la partie (une par ligne)", { zone: true }),
      titre("Les jets de dés marquants"), champ("des", "Réussites folles, échecs, doubles", { zone: true }),
      titre("Cœurs, armure et soins"), champ("coeursPerdus", "Cœurs perdus", { num: true }), champ("armure", "Armure restante", { num: true }), champ("soins", "Potions ou soins"), choix("tombee", "Est-elle tombée dans les pommes ?", ["Non", "Oui"]),
      titre("Ce qu'elle a gagné ou perdu"), champ("gagnes", "Objets gagnés (un par ligne)", { zone: true }), champ("perdus", "Objets perdus ou utilisés", { zone: true }), champ("pouvoir", "Nouveau pouvoir ou progression"),
      titre("Compagnon(s) parti(s) avec elle"), champ("compagnons", `Qui ${prenom} a choisi d'emmener`, { zone: true, aide: "Aucun pour l'instant" }),
      titre("Lieux visités"), champ("lieux", "Un par ligne", { zone: true }),
      titre("Personnages rencontrés"), champ("personnages", "Nouveaux ou récurrents : ce qu'ils ont dit, ce qu'ils veulent", { zone: true }),
      titre("Créatures rencontrées"), champ("creatures", "Nom, cœurs, ce qui s'est passé, version carton fabriquée ?", { zone: true }),
      titre("Règles improvisées"), champ("regles", "Ce que tu as tranché et qu'il faut garder", { zone: true }),
      titre("Fils ouverts"), champ("fils", "Ce qui reste à découvrir, ce que l'héroïne a laissé de côté", { zone: true }),
      titre("Pour la prochaine fois"), champ("prochaine", "Une idée de suite, un objet à reprendre, une envie de l'héroïne", { zone: true }),
      titre("Mon ressenti de MJ"), champ("ressenti", "Ce qui a bien marché, ce qu'elle a préféré, ce que je changerais", { zone: true }),
      h("div", { class: "card" }, h("strong", null, "Où ça va : "), `le récap est écrit dans ${dossier}/ (fichier Recap_date_titre.md). Un traitement automatique (tâche planifiée) le transforme ensuite en histoire propre et met à jour le journal, la fiche du héros et le bestiaire.`),
      bouton, boiteFin, msg)
  };
}
