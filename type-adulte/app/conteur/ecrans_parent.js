// Mode parent (celui qui raconte l'histoire du soir) : Ce soir, Histoires, Monde, Notes, listes et fiches complètes, lieux et objets, compagnons.
// Le parent voit tout (notes du MJ comprises) ; l'enfant, lui, n'a que ses écrans (ecrans_enfant.js).
import { h, icon, hearts, disc, parler, rendreMarkdown } from "./ui.js?v=0.17.0";
import { boitePhoto } from "./photo.js?v=0.17.0";
import { banniereHorsLigne } from "./banniere.js?v=0.17.0";
import { carteEtat, carte as ecranCarte } from "./ecrans_enfant.js?v=0.17.0";
import { ecranPhotos } from "./ecrans_photos.js?v=0.17.0";
import { ecranNotes } from "./ecrans_notes.js?v=0.17.0";
import { ecranFormulaire } from "./ecrans_formulaire.js?v=0.17.0";
import { ecranJouer, ecranRecap, partieEnCours } from "./ecrans_jouer.js?v=0.17.0";
import { aspectObjet } from "../../src/conteur/objets.js?v=0.17.0";
import { controleHistoire } from "../../src/conteur/controle.js?v=0.17.0";
import { lireEtapes } from "../../src/conteur/etapes.js?v=0.17.0";
import { apparitions, platNom } from "../../src/conteur/liens.js?v=0.17.0";
import { sections, parseDoc } from "../../src/md/doc.js?v=0.17.0";
import { pool } from "../../src/graph/pool.js?v=0.17.0";

const lien = (chemin, classe, ...enfants) => h("a", { class: classe, href: "#" + chemin }, ...enfants);
const plus = chemin => lien(chemin, "iconbtn plus", icon("plus", 26, "#fff", 3));
const COULEURS = { creature: "var(--purple)", personnage: "var(--yellow)", compagnon: "var(--teal)", lieu: "var(--blue)", objet: "var(--teal)" };
const SECONDAIRE = { creature: "Rencontres", personnage: "Rencontres", lieu: "Apparitions", objet: "Utilisations", compagnon: "Aventures" };
const TYPES = [["vole", "Qui vole"], ["nage", "Qui nage"], ["terre", "Sur terre"]];
const onglet = col => (col === "histoire" || col === "prochaine" ? "histoires" : "monde");
const retourListe = col => (col === "histoire" || col === "prochaine" ? "/mj/histoires" : col === "lieu" ? "/mj/lieux" : col === "objet" ? "/mj/objets" : col === "compagnon" ? "/mj/c/compagnon" : "/mj/monde");

/* ------------------------------------------------------------------ Ce soir */
export async function ceSoir(ctx) {
  let st = { coeurs: ctx.regles.coeursDepart, armure: ctx.regles.armureDepart, equip: [], compagnons: [], perime: false };
  let derniere = null, prochaine = null, perime = false;
  try { st = await ctx.donnees.etatHeros(); perime = st.perime; } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
  try { const { items } = await ctx.donnees.charger("histoire"); derniere = items[items.length - 1] || null; } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
  try { const { items } = await ctx.donnees.charger("prochaine"); prochaine = items.find(i => /^pr[eê]te?$/i.test(String(i.meta.statut || ""))) || null; } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
  const partie = partieEnCours(ctx);
  const fichierJeu = partie ? partie.file : prochaine ? prochaine.file : null;
  const nbEtapes = prochaine ? lireEtapes(prochaine.body).length : 0;
  return {
    title: "Ce soir", nav: "ce-soir",
    node: h("div", { class: "page with-nav" }, banniereHorsLigne(ctx, perime), carteEtat(ctx, st, false),
      fichierJeu
        ? h("div", { class: "card" },
            h("div", { class: "kicker" }, partie ? "Partie en cours" : "Histoire de ce soir"),
            h("h2", null, partie ? partie.titre : prochaine.name),
            prochaine && !partie ? h("div", { class: "muted" }, [prochaine.meta.duree, nbEtapes ? `${nbEtapes} étape${nbEtapes > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")) : null,
            lien("/mj/jouer/" + encodeURIComponent(fichierJeu), "btn primary block", icon("dice", 26, "#fff"), partie ? "Reprendre la partie" : "Jouer"),
            partie ? lien("/mj/recap", "btn block", "Terminer et faire le récap") : null)
        : h("div", { class: "card" }, h("h3", null, "Pas d'histoire prête pour ce soir"), h("div", { class: "muted" }, "Une histoire apparaît ici quand son fichier (dans " + ctx.donnees.colonne("prochaine").dossier + ") a le statut « prête ».")),
      derniere ? lien(`/mj/c/histoire/${encodeURIComponent(derniere.file)}`, "card", h("div", { class: "kicker" }, "Dernière histoire jouée"), h("h3", null, derniere.name)) : null)
  };
}

/* ------------------------------------------------------------------ Histoires */
export async function histoires(ctx) {
  const vide = { items: [], perime: false };
  const [attente, jouees] = await Promise.all([ctx.donnees.charger("prochaine").catch(e => { if (e && (e.status === 401 || e.auth)) throw e; return vide; }), ctx.donnees.charger("histoire")]);
  const bloc = (titre, colId, items) => [h("div", { class: "kicker" }, titre),
    items.length ? h("div", { class: "list" }, items.map(it => lien(`/mj/c/${colId}/${encodeURIComponent(it.file)}`, "card", h("div", { class: "row" },
      h("div", { class: "thumb" }, icon("book", 28, "var(--ink)")),
      h("div", { class: "grow" }, h("h3", null, it.name), it.meta.statut ? h("div", { class: "fiche-meta" }, h("span", { class: "chip" }, String(it.meta.statut))) : null)))))
      : h("div", { class: "card dashed muted" }, colId === "prochaine" ? "Aucune histoire n'est encore préparée." : "Aucune histoire jouée pour l'instant.")];
  return { title: "Histoires", nav: "histoires", node: h("div", { class: "page with-nav" }, banniereHorsLigne(ctx, attente.perime || jouees.perime), ...bloc("En attente", "prochaine", attente.items), ...bloc("Jouées", "histoire", jouees.items)) };
}

/* ------------------------------------------------------------------ Listes et fiches complètes */
function pastilles(it, colId) {
  const out = [];
  if (colId === "compagnon" && it.animal) out.push(h("span", { class: "chip" }, icon("paw", 16, "var(--ink)", 1.8, "var(--teal)"), it.animal));
  if (colId === "creature" || colId === "compagnon") {
    if (it.coeurs != null) out.push(h("span", { class: "chip" }, icon("heart", 16, "var(--ink)", 1.6, "var(--red)"), `${it.coeurs} cœur${it.coeurs > 1 ? "s" : ""}`));
    if (it.boss) out.push(h("span", { class: "chip boss" }, icon("star", 16, "var(--ink)", 1.6, "var(--yellow)"), "Boss"));
  }
  return out;
}
const etoile = (t = 26) => h("span", { class: "star" }, icon("star", t, "var(--ink)", 1.6, "var(--yellow)"));

export async function listeParent(ctx, colId) {
  const col = ctx.donnees.colonne(colId);
  const { items, perime } = await ctx.donnees.charger(colId);
  const liste = h("div", { class: "list" });
  const dessiner = q => {
    liste.textContent = "";
    const vus = items.filter(i => platNom(i.name).includes(platNom(q)));
    if (!vus.length) liste.append(h("div", { class: "muted center" }, items.length ? "Rien ne correspond." : `Aucun${/e$/.test(col.singular || "") ? "e" : ""} ${col.singular || col.label} pour l'instant.`));
    for (const it of vus) {
      liste.append(lien(`/mj/c/${colId}/${encodeURIComponent(it.file)}`, "card rel", it.boss ? etoile() : null,
        h("div", { class: "row" }, it.photo ? boitePhoto(ctx, it.photo, "thumb") : h("div", { class: "thumb" }, icon(col.icone || "book", 28, "var(--ink)")),
          h("div", { class: "grow" }, h("h3", null, it.name), h("div", { class: "fiche-meta" }, pastilles(it, colId))))));
    }
  };
  const recherche = h("div", { class: "search" }, icon("search", 22, "var(--muted)"), h("input", { type: "search", placeholder: "Chercher…", "aria-label": "Chercher", oninput: e => dessiner(e.target.value) }));
  dessiner("");
  return { title: col.label, back: retourListe(colId), nav: onglet(colId), action: ctx.ecriture ? plus(`/mj/nouveau/${colId}`) : null, node: h("div", { class: "page with-nav" }, banniereHorsLigne(ctx, perime), recherche, liste) };
}

/** Où le parent retrouve une fiche : texte des histoires jouées (y compris les récaps en attente). */
async function textesHistoires(ctx) {
  const col = ctx.donnees.colonne("histoire");
  const ls = await ctx.donnees.lister(col.dossier);
  const fichiers = ls.fichiers.filter(f => !f.dir && /\.md$/i.test(f.name));
  return (await pool(fichiers, async f => { const r = await ctx.donnees.lire(`${col.dossier}/${f.name}`); return { fichier: f.name, texte: r.texte }; }, 6)).filter(Boolean);
}

/** Tête de la fiche d'un compagnon : ses pouvoirs et le lien vers l'animal sauvage du bestiaire. */
async function teteCompagnon(ctx, it) {
  const noeuds = [];
  if (it.pouvoirs.length) noeuds.push(h("div", { class: "card" }, h("div", { class: "kicker" }, "Pouvoirs"),
    h("div", { class: "row", style: "flex-wrap:wrap;gap:8px;margin-top:6px" }, it.pouvoirs.map(p => h("span", { class: "chip" }, icon("star", 16, "var(--ink)", 1.6, "var(--yellow)"), p)))));
  if (it.animal) {
    let c = null;
    try { c = (await ctx.donnees.charger("creature")).items.find(i => platNom(i.name) === platNom(it.animal)); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
    noeuds.push(c ? lien(`/mj/c/creature/${encodeURIComponent(c.file)}`, "card", h("div", { class: "row" }, icon("monster", 26, "var(--purple)", 2),
      h("div", { class: "grow" }, h("div", { class: "kicker" }, "Animal sauvage du bestiaire"), h("h3", null, c.name)), icon("next", 22, "var(--muted)")))
      : h("div", { class: "card dashed muted" }, `Animal : ${it.animal} (pas encore dans le bestiaire)`));
  }
  return noeuds;
}

async function panneauSecondaire(ctx, it, colId) {
  const noeuds = [];
  if (colId === "creature") {   // les compagnons de cette espèce = ceux que le héros a apprivoisés
    try {
      for (const c of (await ctx.donnees.charger("compagnon")).items.filter(i => i.animal && platNom(i.animal) === platNom(it.name)))
        noeuds.push(lien(`/mj/c/compagnon/${encodeURIComponent(c.file)}`, "card", h("div", { class: "row" }, icon("paw", 26, "var(--teal)", 2),
          h("div", { class: "grow" }, h("div", { class: "kicker" }, "Apprivoisé : compagnon"), h("h3", null, c.name)), icon("next", 22, "var(--muted)"))));
    } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
  }
  const fait = sections(it.body).find(s => /^ce que \S+ a fait/i.test(s.title));
  if (fait && fait.text.trim()) noeuds.push(h("div", { class: "card md" }, h("h3", null, fait.title), rendreMarkdown(fait.text)));
  let trouves = [];
  try { trouves = apparitions(it.name, await textesHistoires(ctx)); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
  if (trouves.length) for (const f of trouves) noeuds.push(h("div", { class: "card" }, h("div", { class: "kicker" }, f.titre), h("ul", { class: "steplist", style: "font-size:16px" }, f.lignes.map(l => h("li", null, l)))));
  else if (!noeuds.length) noeuds.push(h("div", { class: "card dashed muted" }, "Pas encore mentionné dans une histoire jouée."));
  return h("div", { class: "list" }, noeuds);
}

export async function ficheParent(ctx, colId, fichier) {
  const col = ctx.donnees.colonne(colId);
  const { item, perime } = await ctx.donnees.element(colId, decodeURIComponent(fichier));
  const noeuds = [banniereHorsLigne(ctx, perime)];
  noeuds.push(h("div", { class: "rel" }, item.boss ? etoile(34) : null, item.photo ? boitePhoto(ctx, item.photo) : h("div", { class: "photo" }, icon(col.icone || "book", 56, "var(--muted)"))),
    h("h1", null, item.name), h("div", { class: "fiche-meta" }, pastilles(item, colId)));
  if (colId === "prochaine") {
    const c = controleHistoire(item.body, { maxVoies: ctx.regles.maxVoies });
    noeuds.push(c.problemes.length
      ? h("div", { class: "card tip" }, h("strong", null, c.bloquant ? "Le mode Jouer ne pourra pas lire cette histoire" : "À vérifier avant de jouer"), h("ul", { class: "steplist" }, c.problemes.map(x => h("li", null, x))))
      : h("div", { class: "muted", style: "font-size:15px" }, `Prête pour le mode Jouer : ${c.etapes} étape${c.etapes > 1 ? "s" : ""}, ${c.voies} voie${c.voies > 1 ? "s" : ""}, ${c.fins} fin${c.fins > 1 ? "s" : ""}.`));
    if (ctx.module("jouer")) noeuds.push(lien("/mj/jouer/" + encodeURIComponent(item.file), "btn primary block", icon("dice", 26, "#fff"), "Jouer cette histoire"));
  }
  const principal = [...(colId === "compagnon" ? await teteCompagnon(ctx, item) : []), h("div", { class: "card md" }, rendreMarkdown(item.body))];
  if (SECONDAIRE[colId]) {
    const volet = h("div", { class: "list" }, principal);
    const t1 = h("button", { class: "tab on" }, "Fiche"), t2 = h("button", { class: "tab" }, SECONDAIRE[colId]);
    t1.addEventListener("click", () => { t1.className = "tab on"; t2.className = "tab"; volet.replaceChildren(...principal); });
    t2.addEventListener("click", async () => {
      t2.className = "tab on"; t1.className = "tab";
      volet.replaceChildren(h("div", { class: "muted center" }, "Recherche dans les histoires…"));
      try { volet.replaceChildren(await panneauSecondaire(ctx, item, colId)); } catch (e) { volet.replaceChildren(h("div", { class: "ko center" }, "Impossible de lire les histoires pour l'instant.")); }
    });
    noeuds.push(h("div", { class: "tabs" }, t1, t2), volet);
  } else noeuds.push(...principal);
  if (ctx.ecriture) noeuds.push(lien(`/mj/modifier/${colId}/${encodeURIComponent(item.file)}`, "btn block", icon("note", 24), "Modifier la fiche"));
  return { title: item.name, back: retourListe(colId), nav: onglet(colId), node: h("div", { class: "page with-nav" }, noeuds) };
}

/* ------------------------------------------------------------------ Lieux et objets (deux onglets), compagnons */
export async function lieuxObjets(ctx, tab) {
  const colId = tab === "objets" ? "objet" : "lieu";
  const [lieux, objets] = await Promise.all([ctx.donnees.charger("lieu"), ctx.donnees.charger("objet")]);
  const cur = colId === "lieu" ? lieux : objets;
  const onglets = h("div", { class: "tabs" },
    h("a", { class: "tab center" + (colId === "lieu" ? " on" : ""), href: "#/mj/lieux" }, `Lieux · ${lieux.items.length}`),
    h("a", { class: "tab center" + (colId === "objet" ? " on" : ""), href: "#/mj/objets" }, `Objets · ${objets.items.length}`));
  const liste = h("div", { class: "list" });
  const dessiner = q => {
    liste.replaceChildren();
    if (colId === "lieu" && ctx.module("carte")) liste.append(lien("/mj/carte", "card mapcta", h("div", { class: "row" }, icon("map", 40, "#fff", 2), h("div", { class: "grow" }, h("h3", null, "Carte du monde"), h("div", null, "Voir toute la carte")), icon("next", 22, "#fff"))));
    const vus = cur.items.filter(i => platNom(i.name).includes(platNom(q)));
    if (!vus.length) liste.append(h("div", { class: "muted center" }, cur.items.length ? "Rien ne correspond." : colId === "lieu" ? "Aucun lieu pour l'instant." : "Aucun objet pour l'instant."));
    for (const it of vus) {
      const look = colId === "objet" ? aspectObjet(ctx.regles.catalogue, it.name, it.meta.categorie) : null;
      const sous = colId === "objet" ? [it.meta.categorie, it.etat].filter(Boolean).join(" · ") : String(it.meta.ou || "");
      let pastille;
      if (look) { pastille = h("div", { class: "disc", style: `background:${look.couleur};width:54px;height:54px;border:3px solid var(--ink);flex:none` }); pastille.append(icon(look.icone, 27, look.encre, 2.4)); }
      else pastille = h("div", { class: "disc", style: "background:var(--blue);width:54px;height:54px;border:3px solid var(--ink);flex:none" }, icon("pin", 26, "#fff", 2.2));
      liste.append(lien(`/mj/c/${colId}/${encodeURIComponent(it.file)}`, "card", h("div", { class: "row" }, pastille,
        h("div", { class: "grow" }, h("h3", null, it.name), sous ? h("div", { class: "muted", style: "font-size:15px" }, sous) : null), icon("next", 22, "var(--muted)"))));
    }
  };
  const recherche = h("div", { class: "search" }, icon("search", 22, "var(--muted)"), h("input", { type: "search", placeholder: colId === "lieu" ? "Rechercher un lieu" : "Rechercher un objet", "aria-label": "Chercher", oninput: e => dessiner(e.target.value) }));
  dessiner("");
  return { title: "Lieux et objets", back: "/mj/monde", nav: "monde", action: ctx.ecriture ? plus(`/mj/nouveau/${colId}`) : null, node: h("div", { class: "page with-nav" }, banniereHorsLigne(ctx, cur.perime), onglets, recherche, liste) };
}

export async function compagnonsParent(ctx) {
  const { items, perime } = await ctx.donnees.charger("compagnon");
  const noeuds = [banniereHorsLigne(ctx, perime)];
  for (const [k, l] of TYPES) {
    noeuds.push(h("div", { class: "kicker" }, l));
    const miens = items.filter(i => i.type === k);
    if (!miens.length) noeuds.push(h("div", { class: "card dashed muted" }, "Pas encore de compagnon de ce type."));
    for (const i of miens) noeuds.push(lien(`/mj/c/compagnon/${encodeURIComponent(i.file)}`, "card", h("div", { class: "row" },
      i.photo ? boitePhoto(ctx, i.photo, "thumb") : h("div", { class: "disc", style: "background:var(--teal);width:54px;height:54px;border:3px solid var(--ink);flex:none" }, icon("paw", 26, "#fff", 2)),
      h("div", { class: "grow" }, h("h3", null, i.name), h("div", { class: "fiche-meta" }, i.animal ? h("span", { class: "chip" }, i.animal) : null,
        i.coeurs != null ? h("span", { class: "chip" }, icon("heart", 16, "var(--ink)", 1.6, "var(--red)"), `${i.coeurs} cœur${i.coeurs > 1 ? "s" : ""}`) : null)),
      icon("next", 22, "var(--muted)"))));
  }
  noeuds.push(h("div", { class: "card md" }, h("p", null, h("strong", null, "Rappel : "), "le compagnon qui part avec le héros est noté dans le récap du soir : rien à cocher ici. Le compte rendu et le journal sont mis à jour ensuite.")));
  return { title: "Compagnons", back: "/mj/monde", nav: "monde", action: ctx.ecriture ? plus("/mj/nouveau/compagnon") : null, node: h("div", { class: "page with-nav" }, noeuds) };
}

/* ------------------------------------------------------------------ Monde */
async function compter(ctx, id) { try { return (await ctx.donnees.charger(id)).items.length; } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; return null; } }
export async function monde(ctx) {
  let st = { coeurs: ctx.regles.coeursDepart, armure: ctx.regles.armureDepart, prenom: "" };
  try { st = await ctx.donnees.etatHeros(); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
  const [nP, nC, nB, nL, nO] = await Promise.all(["personnage", "compagnon", "creature", "lieu", "objet"].map(id => compter(ctx, id)));
  let nPhotos = null;
  if (ctx.regles.photos) { try { const l = await ctx.donnees.lister(ctx.regles.photos); nPhotos = l.fichiers.filter(f => !f.dir && /\.(jpe?g|png|webp)$/i.test(f.name)).length; } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; } }
  const pl = (n, s, p) => n == null ? "" : n === 0 ? "Aucun pour l'instant" : `${n} ${n > 1 ? p : s}`;
  const tuile = (to, ic, couleur, nom, sous) => lien(to, "card wtile", disc(ic, couleur, 52), h("h3", null, nom), h("div", { class: "muted", style: "font-size:15px" }, sous));
  const nomHeros = st.prenom || "le héros";
  return {
    title: "Monde", nav: "monde",
    node: h("div", { class: "page with-nav" },
      lien("/mj/heros", "card", h("div", { class: "row" }, h("div", { class: "disc", style: "background:var(--yellow);width:60px;height:60px;border:3px solid var(--ink)" }, icon("helmet", 30, "var(--ink)", 2)),
        h("div", { class: "grow" }, h("h3", null, `Fiche de ${nomHeros}`), h("div", { class: "row", style: "gap:8px" }, hearts(Math.min(st.coeurs, 5), 18, 120), icon("shield", 20, "var(--ink)", 1.6, "#A9BDD1"), h("span", null, String(st.armure)))),
        icon("next", 22, "var(--muted)"))),
      ctx.module("carte") ? lien("/mj/carte", "card mapcta", h("div", { class: "row" }, icon("map", 40, "#fff", 2), h("div", { class: "grow" }, h("h3", null, "Carte du monde"), h("div", null, "Tout son monde")), icon("next", 22, "#fff"))) : null,
      h("div", { class: "tiles" },
        tuile("/mj/c/personnage", "friends", "var(--yellow)", "Personnages", pl(nP, "rencontré", "rencontrés")),
        tuile("/mj/c/compagnon", "paw", "var(--teal)", "Compagnons", pl(nC, "compagnon", "compagnons")),
        tuile("/mj/c/creature", "monster", "var(--purple)", "Bestiaire", pl(nB, "créature", "créatures")),
        tuile("/mj/lieux", "pin", "var(--blue)", "Lieux et objets", `${nL ?? 0} lieux · ${nO ?? 0} objets`),
        tuile("/mj/f/00_REGLES_PROJET.md", "book", "var(--red)", "Règles", "Le fichier de règles du jeu"),
        ctx.regles.photos ? tuile("/mj/photos", "image", "var(--muted)", "Photos", nPhotos == null ? "Dans " + ctx.regles.photos : `${nPhotos} dans ${ctx.regles.photos}`) : null))
  };
}

/** Fiche complète du héros, et n'importe quel fichier Markdown du JDR (les règles, par exemple). */
export async function fichierMarkdown(ctx, chemin, retour = "/mj/monde") {
  chemin = decodeURIComponent(chemin);
  if (!/\.md$/i.test(chemin)) throw new Error("Seuls les fichiers Markdown s'affichent ici.");
  const r = await ctx.donnees.lire(chemin);
  if (r.texte == null) throw new Error("Fichier introuvable : " + chemin);
  const d = parseDoc(r.texte);
  return { title: d.title || chemin.split("/").pop(), back: retour, nav: "monde", node: h("div", { class: "page with-nav" }, banniereHorsLigne(ctx, r.perime), h("div", { class: "card md" }, rendreMarkdown(d.body))) };
}
export async function ficheHeros(ctx) {
  const f = await ctx.donnees.trouverFicheHeros();
  if (!f) throw new Error(`Fiche du héros introuvable dans ${ctx.regles.dossierFiche} (fichier « …_Fiche_Heroine.md »).`);
  return fichierMarkdown(ctx, encodeURIComponent(f));
}

export function routesParent() {
  const dec = decodeURIComponent;
  return [
    [/^\/mj\/ce-soir$/, ctx => ceSoir(ctx), "mj"],
    [/^\/mj\/histoires$/, ctx => histoires(ctx), "mj"],
    [/^\/mj\/monde$/, ctx => monde(ctx), "mj"],
    [/^\/mj\/lieux$/, ctx => lieuxObjets(ctx, "lieux"), "mj"],
    [/^\/mj\/objets$/, ctx => lieuxObjets(ctx, "objets"), "mj"],
    [/^\/mj\/carte$/, ctx => ecranCarte(ctx, "mj"), "mj"],
    [/^\/mj\/photos$/, ctx => ecranPhotos(ctx), "mj"],
    [/^\/mj\/notes$/, ctx => ecranNotes(ctx), "mj"],
    [/^\/mj\/heros$/, ctx => ficheHeros(ctx), "mj"],
    [/^\/mj\/f\/(.+)$/, (ctx, p) => fichierMarkdown(ctx, p), "mj"],
    [/^\/mj\/c\/compagnon$/, ctx => compagnonsParent(ctx), "mj"],
    [/^\/mj\/c\/(lieu|objet)$/, (ctx, c) => lieuxObjets(ctx, c === "lieu" ? "lieux" : "objets"), "mj"],
    [/^\/mj\/c\/([a-z_]+)$/, (ctx, c) => listeParent(ctx, c), "mj"],
    [/^\/mj\/c\/([a-z_]+)\/(.+)$/, (ctx, c, f) => ficheParent(ctx, c, f), "mj"],
    [/^\/mj\/nouveau\/([a-z_]+)$/, (ctx, c) => ecranFormulaire(ctx, c, null), "mj"],
    [/^\/mj\/modifier\/([a-z_]+)\/(.+)$/, (ctx, c, f) => ecranFormulaire(ctx, c, dec(f)), "mj"],
    [/^\/mj\/jouer\/(.+)$/, (ctx, f) => ecranJouer(ctx, dec(f)), "mj"],
    [/^\/mj\/recap$/, ctx => ecranRecap(ctx), "mj"]
  ];
}
