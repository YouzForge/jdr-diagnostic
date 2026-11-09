// Écrans de l'enfant : accueil, journal, bourse, objets, lieux et carte, compagnons, monstres, amis, outils (photo).
// Chaque écran renvoie { title, back, nav, node } ; le routeur (index.js) les affiche. Aucune fiche n'est montrée avec ses notes de MJ (vueEnfant).
import { h, icon, hearts, disc, spinner, appuiLong, anneauIcone, parler, caseObjet, caseVide, rendreMarkdown } from "./ui.js?v=0.18.0";
import { boitePhoto, envoyerPhoto } from "./photo.js?v=0.18.0";
import { banniereHorsLigne } from "./banniere.js?v=0.18.0";
import { vueEnfant } from "../../src/conteur/heros.js?v=0.18.0";
import { plain } from "../../src/conteur/etapes.js?v=0.18.0";
import { aspectObjet, encreSur } from "../../src/conteur/objets.js?v=0.18.0";

const lien = (chemin, classe, ...enfants) => h("a", { class: classe, href: "#" + chemin }, ...enfants);
const aller = chemin => { location.hash = "#" + chemin; };
const plat = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").toLowerCase();

/** Pages de l'enfant par collection : titre, icône, route. La couleur vient de la collection (profil). */
export const PAGES_ENFANT = {
  objet: { titre: "Mes objets", icone: "sword" },
  lieu: { titre: "Mes lieux", icone: "pin" },
  creature: { titre: "Mes monstres", icone: "monster" },
  personnage: { titre: "Mes amis", icone: "friends" },
  compagnon: { titre: "Mes compagnons", icone: "paw" }
};
const couleurDe = (ctx, id) => (ctx.profil.collections.find(c => c.id === id) || {}).couleur || "#6B3FA0";

/** Bouton rond « écouter ». */
const boutonVoix = texte => h("button", { class: "sbtn", "aria-label": "Écouter", onclick: e => { e.preventDefault(); e.stopPropagation(); parler(texte); } }, icon("speaker", 24, "#fff"));

const carteTiretee = (ic, texte) => h("div", { class: "card dashed" }, h("div", { class: "row" },
  h("div", { class: "disc", style: "width:62px;height:62px;border:3px dashed var(--dash);flex:none" }, icon(ic, 30, "var(--dash)", 2)),
  h("div", { class: "muted", style: "font-size:19px" }, texte)));

/** Carte d'état du héros : cœurs, armure, équipement porté, compagnons. */
export function carteEtat(ctx, st, grand = true) {
  const compagnons = st.compagnons || [];
  const places = compagnons.length
    ? compagnons.slice(0, 6).map(n => { const sl = h("div", { class: "slot", style: "width:48px;height:48px;background:var(--teal)", role: "img", "aria-label": n, title: n }); sl.append(icon("paw", 27, "#fff", 2.2)); return sl; })
    : [caseVide("paw"), caseVide("paw"), caseVide("paw")];
  return h("div", { class: "card statecard" },
    h("div", { class: "state" },
      hearts(st.coeurs, grand ? 34 : 28, 200),
      h("div", { class: "row", style: "gap:8px" }, icon("shield", grand ? 34 : 28, "var(--ink)", 1.6, "#A9BDD1"), h("h2", null, String(st.armure)))),
    h("div", { class: "gear" },
      h("div", null, h("div", { class: "kicker" }, "Équipement"), h("div", { class: "slots" }, st.equip && st.equip.length ? st.equip.map(o => caseObjet(o)) : h("span", { class: "muted", style: "font-size:14px" }, "Rien pour l'instant"))),
      h("div", null, h("div", { class: "kicker" }, "Compagnons"), h("div", { class: "slots" }, places))));
}

/* ------------------------------------------------------------------ accueil */
export async function accueil(ctx) {
  let st = { prenom: "", coeurs: ctx.regles.coeursDepart, armure: ctx.regles.armureDepart, equip: [], compagnons: [], perime: false };
  try { st = await ctx.donnees.etatHeros(); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
  const { wrap, anneau } = anneauIcone("lock");
  const parents = h("div", { class: "parents no-select", role: "button", "aria-label": "Parents : appui long de 3 secondes" }, wrap, h("span", null, "Parents · appui long"));
  appuiLong(parents, anneau, 3000, () => { ctx.ouvrirModeParent(); });
  const tuiles = Object.entries(PAGES_ENFANT).filter(([id]) => ctx.profil.collections.some(c => c.id === id))
    .map(([id, p]) => lien(`/child/c/${id}`, "tile", disc(p.icone, couleurDe(ctx, id), 60), p.titre));
  if (ctx.module("pieces")) tuiles.push(lien("/child/bourse", "tile", disc("purse", "var(--leather)", 60), "Ma bourse"));
  if (ctx.regles.photos) tuiles.push(lien("/child/outils", "tile", disc("tools", "var(--muted)", 60), "Mes outils"));
  const titre = ctx.profil.heros && ctx.profil.heros.titre;
  return {
    node: h("div", { class: "page" },
      banniereHorsLigne(ctx, st.perime),
      h("div", { class: "hello" },
        h("div", { class: "avatar", "aria-hidden": "true" }, icon((ctx.profil.theme && ctx.profil.theme.icone) || "book", 38, "var(--ink)", 2)),
        h("div", null, h("h1", null, st.prenom ? `Bonjour ${st.prenom} !` : "Bonjour !"), titre ? h("div", { class: "muted" }, titre) : null)),
      carteEtat(ctx, st),
      ctx.module("journal") ? lien("/child/journal", "journal", icon("book", 56, "#fff", 2),
        h("div", null, h("h2", null, "Mon journal"), h("small", null, icon("speaker", 22, "#fff"), "Écouter mon aventure"))) : null,
      h("div", { class: "tiles" }, tuiles),
      parents)
  };
}

/* ------------------------------------------------------------------ outils : appareil photo */
export function outils(ctx) {
  const entree = h("input", { type: "file", accept: "image/*", capture: "environment", style: "display:none" });
  const etat = h("div", { class: "muted center" });
  const apercu = h("img", { alt: "", style: "max-width:100%;border-radius:18px;border:3px solid var(--ink);display:none" });
  entree.addEventListener("change", async () => {
    const f = entree.files[0]; if (!f) return;
    etat.className = "muted center"; etat.textContent = "Envoi de la photo…";
    try {
      const r = await envoyerPhoto(ctx, f);
      apercu.src = r.apercu; apercu.style.display = "block";
      etat.className = "ok center"; etat.textContent = "Photo rangée !";
    } catch (e) {
      etat.className = "ko center";
      etat.textContent = e.raison === "ecriture_desactivee" ? "L'écriture est désactivée pour ce jeu." : e.status ? "La photo n'a pas pu être envoyée (" + e.message + ")." : "Pas de réseau : la photo n'a pas été envoyée. Réessaie quand le réseau revient.";
    }
    entree.value = "";
  });
  return {
    title: "Mes outils", back: "/",
    node: h("div", { class: "page" },
      h("button", { class: "tile", style: "border-radius:26px;width:100%", onclick: () => entree.click() }, disc("camera", "var(--teal)", 84), "Prendre une photo"),
      apercu, etat, entree,
      h("div", { class: "muted center", style: "font-size:14px" }, "D'autres outils arriveront ici."))
  };
}

/* ------------------------------------------------------------------ listes et fiches (monstres, amis) */
const pastilles = (it, colId) => {
  const out = [];
  if (colId === "compagnon" && it.animal) out.push(h("span", { class: "chip" }, icon("paw", 16, "var(--ink)", 1.8, "var(--teal)"), it.animal));
  if (colId === "creature") {
    if (it.coeurs != null) out.push(h("span", { class: "chip" }, icon("heart", 16, "var(--ink)", 1.6, "var(--red)"), `${it.coeurs} cœur${it.coeurs > 1 ? "s" : ""}`));
    if (it.boss) out.push(h("span", { class: "chip boss" }, icon("star", 16, "var(--ink)", 1.6, "var(--yellow)"), "Boss"));
  }
  return out;
};
const etoile = (t = 26) => h("span", { class: "star" }, icon("star", t, "var(--ink)", 1.6, "var(--yellow)"));

export async function listeEnfant(ctx, colId) {
  const col = ctx.donnees.colonne(colId);
  const page = PAGES_ENFANT[colId] || { titre: col.label, icone: col.icone };
  const { items, perime } = await ctx.donnees.charger(colId);
  const liste = h("div", { class: "tiles" });
  const dessiner = q => {
    liste.textContent = "";
    const vus = items.filter(i => plat(i.name).includes(plat(q)));
    if (!vus.length) liste.append(h("div", { class: "muted center", style: "grid-column:1/-1" }, items.length ? "Rien ne correspond." : `Aucun${col.singular === "lieu" || col.singular === "créature" ? "e" : ""} ${col.singular} pour l'instant.`));
    for (const it of vus) {
      liste.append(lien(`/child/c/${colId}/${encodeURIComponent(it.file)}`, "tile rel", it.boss ? etoile() : null,
        it.photo ? boitePhoto(ctx, it.photo, "thumb") : disc(page.icone, couleurDe(ctx, colId)),
        it.name, it.coeurs != null ? hearts(it.coeurs, 20) : null));
    }
  };
  const recherche = h("div", { class: "search" }, icon("search", 22, "var(--muted)"),
    h("input", { type: "search", placeholder: "Chercher…", "aria-label": "Chercher", oninput: e => dessiner(e.target.value) }));
  dessiner("");
  return { title: page.titre, back: "/", node: h("div", { class: "page" }, banniereHorsLigne(ctx, perime), items.length > 5 ? recherche : null, liste) };
}

export async function ficheEnfant(ctx, colId, fichier) {
  const col = ctx.donnees.colonne(colId);
  const { item, perime } = await ctx.donnees.element(colId, decodeURIComponent(fichier));
  const v = vueEnfant(item);
  const dit = [item.name, v.description, plain(v.faits)].filter(Boolean).join(". ");
  const noeuds = [banniereHorsLigne(ctx, perime),
    h("div", { class: "rel" }, item.boss ? etoile(34) : null, item.photo ? boitePhoto(ctx, item.photo) : h("div", { class: "photo" }, icon(col.icone || "book", 56, "var(--muted)"))),
    h("h1", null, item.name), h("div", { class: "fiche-meta" }, pastilles(item, colId)),
    h("button", { class: "btn red block", onclick: () => parler(dit) }, icon("speaker", 26, "#fff"), "Écouter")];
  if (v.description) noeuds.push(h("div", { class: "card" }, h("div", null, v.description)));
  if (v.faits) noeuds.push(h("div", { class: "card md" }, h("h3", null, "Ce que j'ai fait"), rendreMarkdown(v.faits)));
  return { title: item.name, back: `/child/c/${colId}`, node: h("div", { class: "page" }, noeuds) };
}

/* ------------------------------------------------------------------ journal */
export async function journal(ctx) {
  const r = await ctx.donnees.journal();
  if (r.texte == null) throw new Error(`Journal introuvable (${ctx.regles.dossierJournal}/Journal_de_….md).`);
  const parties = r.texte.replace(/\r\n/g, "\n").split(/\n(?=## )/).slice(1);
  const chapitres = parties.map(p => {
    const lignes = p.split("\n");
    const tete = lignes[0].replace(/^##\s*/, "");
    const [k, ...t] = tete.split(/\s+[—–-]\s+/);
    const texte = lignes.slice(1).filter(l => !/^---+\s*$/.test(l) && !/^\*Les nouvelles/.test(l)).join("\n").trim();
    return { kicker: t.length ? k : "", titre: t.length ? t.join(" — ") : k, texte };
  }).filter(c => c.texte);
  const noeuds = [banniereHorsLigne(ctx, r.perime)];
  for (const c of chapitres) {
    noeuds.push(h("div", { class: "list", style: "gap:8px" },
      h("div", { class: "row", style: "justify-content:space-between" },
        h("div", { class: "grow" }, c.kicker ? h("div", { class: "kicker" }, c.kicker) : null, h("h2", { style: "color:var(--red)" }, c.titre)),
        boutonVoix(c.titre + ". " + plain(c.texte))),
      h("div", { class: "card md journal-text" }, rendreMarkdown(c.texte, { titreARetirer: null }))));
  }
  noeuds.push(carteTiretee("book", "La prochaine aventure s'écrira ici."));
  const tout = chapitres.map(c => c.titre + ". " + plain(c.texte)).join(" ");
  return {
    title: "Mon journal", back: "/",
    node: h("div", { class: "page" }, noeuds,
      h("div", { class: "bottombar" }, h("button", { class: "btn primary block", style: "font-size:20px", onclick: () => parler(tout) }, icon("speaker", 26, "#fff"), "Écouter mon aventure")))
  };
}

/* ------------------------------------------------------------------ bourse */
export async function bourse(ctx) {
  let st = { pieces: 0, perime: false };
  try { st = await ctx.donnees.etatHeros(); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
  const n = st.pieces || 0, nom = ctx.regles.piece;
  const pl = n > 1 ? "s" : "";
  const texte = n === 0 ? "Ma bourse est vide pour l'instant. Je gagnerai des pièces pendant mes aventures." : n === 1 ? "J'ai une pièce dans ma bourse !" : `J'ai ${n} pièces dans ma bourse !`;
  const piece = () => icon("coin", 44, "var(--ink)", 1.6, "#F2B81C");
  const vues = Math.min(n, 12);
  return {
    title: "Ma bourse", back: "/",
    node: h("div", { class: "page" }, banniereHorsLigne(ctx, st.perime),
      h("div", { class: "bourse" },
        h("div", { class: "big" }, icon("purse", 78, "#fff", 2)),
        h("div", { class: "count", role: "status", "aria-label": `${n} ${nom}${pl}` }, String(n)),
        h("div", { class: "muted" }, n > 1 ? "pièces" : "pièce"),
        vues ? h("div", { class: "coins" }, Array.from({ length: vues }, piece), n > vues ? h("span", { class: "muted", style: "align-self:center" }, `+ ${n - vues}`) : null) : null,
        h("button", { class: "btn red block", onclick: () => parler(texte) }, icon("speaker", 26, "#fff"), "Écouter")))
  };
}

/* ------------------------------------------------------------------ objets, lieux, compagnons */
export async function objetsEnfant(ctx) {
  const { items, perime } = await ctx.donnees.charger("objet");
  const use = it => /utilis/i.test(it.etat);
  const tries = [...items].sort((a, b) => Number(use(a)) - Number(use(b)));
  const noeuds = [banniereHorsLigne(ctx, perime)];
  for (const it of tries) {
    const look = aspectObjet(ctx.regles.catalogue, it.name, it.meta.categorie), dit = [it.name, it.apparence].filter(Boolean).join(". ");
    const gros = h("div", { class: "disc", style: `background:${look.couleur};width:62px;height:62px;border:3px solid var(--ink);flex:none` });
    gros.append(icon(look.icone, 31, look.encre, 2.4));
    noeuds.push(h("button", { class: "card bigcard" + (use(it) ? " faded" : ""), onclick: () => parler(dit) },
      h("div", { class: "row" }, gros,
        h("div", { class: "grow" }, h("h2", null, it.name), it.apparence ? h("div", { class: "muted", style: "font-size:19px" }, it.apparence) : null,
          use(it) ? h("span", { class: "chip", style: "align-self:flex-start;margin-top:4px" }, "Déjà utilisé") : null),
        boutonVoix(dit))));
  }
  if (!items.length) noeuds.push(h("div", { class: "muted center" }, "Aucun objet pour l'instant."));
  noeuds.push(carteTiretee("question", "La place d'un futur objet"));
  return { title: "Mes objets", back: "/", node: h("div", { class: "page" }, noeuds) };
}

export async function lieuxEnfant(ctx) {
  const { items, perime } = await ctx.donnees.charger("lieu");
  const noeuds = [banniereHorsLigne(ctx, perime)];
  if (ctx.module("carte")) noeuds.push(lien("/child/carte", "card mapcta", h("div", { class: "row" }, icon("map", 54, "#fff", 2), h("div", null, h("h2", null, "Carte du monde"), h("div", null, "Tout mon monde")))));
  for (const it of items) {
    const dit = [it.name, it.apparence].filter(Boolean).join(". ");
    noeuds.push(h("button", { class: "card bigcard", onclick: () => parler(dit) },
      h("div", { class: "row" }, h("div", { class: "disc", style: "background:var(--blue);width:56px;height:56px;border:3px solid var(--ink);flex:none" }, icon("pin", 28, "#fff", 2.2)),
        h("div", { class: "grow" }, h("h2", null, it.name), it.apparence ? h("div", { class: "muted", style: "font-size:18px" }, it.apparence) : null), boutonVoix(dit))));
  }
  noeuds.push(carteTiretee("question", "Un lieu à découvrir"));
  return { title: "Mes lieux", back: "/", node: h("div", { class: "page" }, noeuds) };
}

const TYPES = [["vole", "Qui vole"], ["nage", "Qui nage"], ["terre", "Sur terre"]];
export async function compagnonsEnfant(ctx) {
  const { items, perime } = await ctx.donnees.charger("compagnon");
  const noeuds = [banniereHorsLigne(ctx, perime)];
  const vide = () => h("div", { class: "disc", style: "width:92px;height:92px;border:4px dashed var(--dash)" }, icon("paw", 40, "var(--dash)", 2));
  if (!items.length) {
    noeuds.push(h("div", { class: "kicker" }, "Mes compagnons"),
      h("div", { class: "row", style: "justify-content:space-around;align-items:flex-start" }, TYPES.map(([, l]) => h("div", { class: "center list", style: "gap:6px;align-items:center" }, vide(), h("div", { style: "font:600 19px Fredoka" }, l)))),
      carteTiretee("paw", "Un compagnon à rencontrer"),
      h("div", { class: "muted", style: "font-size:19px" }, "Quand je ferai un ami animal, il viendra ici. Je choisirai avec qui partir à l'aventure."));
  } else {
    for (const [k, l] of TYPES) {
      const miens = items.filter(i => i.type === k);
      noeuds.push(h("div", { class: "kicker" }, l),
        h("div", { class: "row", style: "flex-wrap:wrap;gap:14px;align-items:flex-start" }, miens.length ? miens.map(i => {
          const dit = [i.name, i.apparence].filter(Boolean).join(". ");
          return h("button", { class: "compa", onclick: () => parler(dit) },
            i.photo ? boitePhoto(ctx, i.photo, "thumb big") : h("div", { class: "disc", style: "width:92px;height:92px;background:var(--teal);border:4px solid var(--ink)" }, icon("paw", 44, "#fff", 2.2)),
            h("div", { style: "font:600 19px Fredoka" }, i.name));
        }) : [vide()]));
    }
  }
  return { title: "Mes compagnons", back: "/", node: h("div", { class: "page" }, noeuds) };
}

/* ------------------------------------------------------------------ carte du monde (déplacer et zoomer avec les doigts) */
const MYSTERE = [[22, 14], [84, 24], [14, 78], [90, 62], [34, 90]];
const SVGNS = "http://www.w3.org/2000/svg";
function fondCarte() {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 100 110"); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%"); svg.setAttribute("aria-hidden", "true");
  const g = document.createElementNS(SVGNS, "g");
  for (const [k, v] of Object.entries({ fill: "none", stroke: "#B8956A", "stroke-width": ".7", "stroke-dasharray": "1.4 2.2", "stroke-linecap": "round" })) g.setAttribute(k, v);
  for (const r of [14, 26, 38]) { const c = document.createElementNS(SVGNS, "circle"); c.setAttribute("cx", "50"); c.setAttribute("cy", "55"); c.setAttribute("r", String(r)); g.append(c); }
  svg.append(g);
  return svg;
}

export async function carte(ctx, mode = "child") {
  const { items, perime } = await ctx.donnees.charger("lieu");
  const vue = h("div", { class: "mapview", role: "img", "aria-label": "Carte du monde" });
  const monde = h("div", { class: "mapworld" });
  monde.append(h("div", { style: "position:absolute;inset:0" }, fondCarte()));
  for (const [x, y] of MYSTERE) monde.append(h("div", { class: "mpin q", style: `left:${x}%;top:${y}%` }, h("span", { style: "font:600 34px Fredoka;color:var(--dash)" }, "?")));
  const places = items.map((it, i) => {
    const village = /village/i.test(it.name);
    const a = (i / Math.max(items.length, 1)) * Math.PI * 2 - 1;
    return { it, village, pos: it.carte || (village ? { x: 50, y: 50 } : { x: 50 + 30 * Math.cos(a), y: 50 + 30 * Math.sin(a) }) };
  });
  for (const { it, pos, village } of places) {
    monde.append(h("div", { class: "mpin" + (village ? " home" : ""), style: `left:${pos.x}%;top:${pos.y}%` },
      icon("pin", village ? 46 : 34, "var(--ink)", 1.8, village ? "var(--red)" : "var(--blue)"), h("span", { class: "mlabel" }, it.name)));
  }
  vue.append(monde);
  let z = 1, tx = 0, ty = 0;
  const appliquer = () => {
    const w = vue.clientWidth || 300, ht = vue.clientHeight || 330;
    tx = Math.max(Math.min(tx, 0), w - w * z); ty = Math.max(Math.min(ty, 0), ht - ht * z);
    monde.style.setProperty("--z", String(z));
    monde.style.transform = `translate(${tx}px,${ty}px) scale(${z})`;
  };
  const zoomer = (k, cx, cy) => {
    const nz = Math.max(1, Math.min(3.5, z * k));
    const w = vue.clientWidth || 300, ht = vue.clientHeight || 330;
    const px = cx ?? w / 2, py = cy ?? ht / 2;
    tx = px - (px - tx) * (nz / z); ty = py - (py - ty) * (nz / z); z = nz; appliquer();
  };
  const doigts = new Map(); let dernier = null;
  vue.addEventListener("pointerdown", e => { vue.setPointerCapture(e.pointerId); doigts.set(e.pointerId, { x: e.clientX, y: e.clientY }); dernier = null; });
  vue.addEventListener("pointermove", e => {
    if (!doigts.has(e.pointerId)) return;
    const avant = doigts.get(e.pointerId); const cur = { x: e.clientX, y: e.clientY };
    if (doigts.size === 1) { tx += cur.x - avant.x; ty += cur.y - avant.y; doigts.set(e.pointerId, cur); appliquer(); return; }
    doigts.set(e.pointerId, cur);
    const [a, b] = [...doigts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (dernier) { const r = vue.getBoundingClientRect(); zoomer(d / dernier, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
    dernier = d;
  });
  for (const n of ["pointerup", "pointercancel"]) vue.addEventListener(n, e => { doigts.delete(e.pointerId); dernier = null; });
  vue.addEventListener("wheel", e => { e.preventDefault(); const r = vue.getBoundingClientRect(); zoomer(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const boutons = h("div", { class: "mapbtns" },
    h("button", { class: "iconbtn", "aria-label": "Zoom +", onclick: () => zoomer(1.4) }, icon("plus", 26)),
    h("button", { class: "iconbtn", "aria-label": "Zoom −", onclick: () => zoomer(1 / 1.4) }, icon("minus", 26)));
  setTimeout(appliquer, 0);
  return {
    title: "Carte du monde", back: mode === "mj" ? "/mj/monde" : "/child/c/lieu", nav: mode === "mj" ? "monde" : null,
    node: h("div", { class: "page" + (mode === "mj" ? " with-nav" : "") }, banniereHorsLigne(ctx, perime), h("div", { class: "mapbox" }, vue, boutons),
      h("div", { class: "muted", style: "font-size:18px" }, mode === "mj"
        ? "La carte se déplace et se zoome avec les doigts. Chaque lieu se place avec le champ « Position sur la carte » de sa fiche ; sans position, il est posé en cercle autour du village."
        : "Ma carte se déplace et se zoome avec les doigts. Les « ? » sont des lieux à découvrir !"),
      h("div", { class: "fiche-meta" }, h("span", { class: "chip", style: "background:#F6D9D3" }, "Mon village"), h("span", { class: "chip" }, "À découvrir")))
  };
}
