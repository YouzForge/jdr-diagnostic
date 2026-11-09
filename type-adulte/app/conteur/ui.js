// Petites briques d'interface du conteur. RÈGLE du moteur : jamais de innerHTML (un test le vérifie) ; tout est construit avec le DOM.
import { icone } from "../icones.js?v=0.18.1";
import { encreSur } from "../../src/conteur/objets.js?v=0.18.1";
import { blocsMarkdown, inline as inlineMd } from "../../src/app/markdown.js?v=0.18.1";

const SVGNS = "http://www.w3.org/2000/svg";

/** Crée un élément. h("div", {class:"x", onclick:fn}, "texte", autreNoeud) */
export function h(tag, attrs, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of enfants.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

/** Icône du kit : icon("heart", 26, "var(--ink)", 1.6, "var(--red)"). */
export const icon = (nom, taille = 24, couleur = "var(--ink)", epaisseur = 2, remplissage = "none") => icone(nom, taille, couleur, epaisseur, remplissage);

/** Cœurs en lignes : au plus `par` par ligne, chaque cœur réduit pour que la ligne tienne dans `largeurMax` pixels. */
export function hearts(n, taille = 26, largeurMax = 9999) {
  const par = Math.max(1, Math.min(n, n <= 10 ? 5 : n <= 20 ? 7 : 9));
  const ecart = 4;
  const s = Math.max(12, Math.min(taille, Math.floor(largeurMax / par) - ecart));
  const boite = h("div", { class: "hearts", role: "img", "aria-label": `${n} cœur${n > 1 ? "s" : ""}`, style: `flex-direction:column;align-items:center;gap:${ecart}px;max-width:100%` });
  for (let i = 0; i < n; i += par) {
    const ligne = h("div", { class: "hearts", style: `gap:${ecart}px` });
    for (let k = i; k < Math.min(n, i + par); k++) ligne.append(icon("heart", s, "var(--ink)", 1.6, "var(--red)"));
    boite.append(ligne);
  }
  return boite;
}

/** Disque coloré avec une icône (tuiles de l'accueil). */
export function disc(nom, couleur, taille = 60) {
  const d = h("div", { class: "disc", style: `background:${couleur};width:${taille}px;height:${taille}px` });
  d.append(icon(nom, taille * 0.5, "#fff", 2.2));
  return d;
}

export function spinner(texte = "Chargement…") {
  return h("div", { class: "page center", style: "padding-top:80px" }, h("div", { class: "spin" }, icon("moon", 36, "var(--muted)")), h("div", { class: "muted" }, texte));
}

/** Appui long avec anneau qui se remplit. `anneau` = élément <circle>. Appelle onDone() après `ms` millisecondes de pression continue. */
export function appuiLong(cible, anneau, ms, onDone) {
  const L = 2 * Math.PI * 22;
  anneau.setAttribute("stroke-dasharray", String(L));
  anneau.setAttribute("stroke-dashoffset", String(L));
  let t0 = 0, raf = 0, fini = false;
  const reset = () => { cancelAnimationFrame(raf); t0 = 0; anneau.setAttribute("stroke-dashoffset", String(L)); };
  const image = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    anneau.setAttribute("stroke-dashoffset", String(L * (1 - k)));
    if (k >= 1) { fini = true; if (navigator.vibrate) navigator.vibrate(60); onDone(); return; }
    raf = requestAnimationFrame(image);
  };
  cible.addEventListener("pointerdown", e => { e.preventDefault(); fini = false; t0 = performance.now(); raf = requestAnimationFrame(image); });
  for (const n of ["pointerup", "pointercancel", "pointerleave"]) cible.addEventListener(n, () => { if (!fini) reset(); });
  cible.addEventListener("contextmenu", e => e.preventDefault());
}

/** Anneau SVG (cercle + progression) + icône au centre. */
export function anneauIcone(nom) {
  const wrap = h("div", { class: "ringwrap" });
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 52 52"); svg.setAttribute("class", "ring");
  const cercle = (attrs) => { const c = document.createElementNS(SVGNS, "circle"); for (const [k, v] of Object.entries(attrs)) c.setAttribute(k, v); return c; };
  const fond = cercle({ cx: 26, cy: 26, r: 22, fill: "none", stroke: "#E6D3B3", "stroke-width": 6 });
  const anneau = cercle({ cx: 26, cy: 26, r: 22, fill: "none", stroke: "var(--teal)", "stroke-width": 6, "stroke-linecap": "round", transform: "rotate(-90 26 26)" });
  svg.append(fond, anneau);
  wrap.append(svg, h("div", { class: "lockic" }, icon(nom, 22, "var(--muted)")));
  return { wrap, anneau };
}

/* Voix : une voix française féminine si le téléphone en a une (le genre d'une voix n'est pas donné : on la reconnaît à son prénom). */
const FEMININES = /am[ée]lie|audrey|aur[ée]lie|marie|julie|hortense|denise|eloise|éloïse|brigitte|vivienne|louise|chantal|claire|florence|female|femme/i;
const MASCULINES = /thomas|daniel|nicolas|jacques|paul|claude|henri|remy|rémy|antoine|guillaume|male\b|homme/i;
function voixFeminine() {
  const fr = speechSynthesis.getVoices().filter(x => x.lang && /^fr/i.test(x.lang.replace("_", "-")));
  const score = v => (FEMININES.test(v.name) ? 4 : 0) - (MASCULINES.test(v.name) ? 4 : 0) + (/^fr[-_]fr/i.test(v.lang) ? 1 : 0) + (/enhanced|premium|natural|online/i.test(v.name) ? 1 : 0);
  return fr.sort((a, b) => score(b) - score(a))[0] || null;
}
if ("speechSynthesis" in window) speechSynthesis.addEventListener?.("voiceschanged", () => voixFeminine());

/** Lecture à voix haute avec la voix du téléphone. */
export function parler(texte) {
  if (!("speechSynthesis" in window)) return false;
  const u = new SpeechSynthesisUtterance(texte);
  u.lang = "fr-FR";
  const v = voixFeminine();
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 0.95;
  u.pitch = v && FEMININES.test(v.name) ? 1 : 1.15;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}

/** Case d'inventaire : fond de la couleur de l'objet, icône par-dessus. */
export function caseObjet(o, taille = 48) {
  const s = h("div", { class: "slot", style: `width:${taille}px;height:${taille}px;background:${o.couleur}`, role: "img", "aria-label": o.nom, title: o.nom });
  s.append(icon(o.icone, taille * 0.56, encreSur(o.couleur), 2.4));
  return s;
}
/** Case vide en pointillés (place réservée). */
export function caseVide(nom = "paw", taille = 48) {
  const s = h("div", { class: "slot empty", style: `width:${taille}px;height:${taille}px`, "aria-hidden": "true" });
  s.append(icon(nom, taille * 0.5, "var(--dash)", 2));
  return s;
}

/* ---- Markdown sans HTML : les blocs sûrs du moteur, affichés avec des nœuds texte ---- */
const morceaux = ms => ms.map(m => (m.gras ? h("strong", null, m.texte) : m.italique ? h("em", null, m.texte) : m.texte));
/** Corps Markdown → nœuds DOM. `titreARetirer` : le premier « # titre » est omis s'il répète le nom de la fiche. */
export function rendreMarkdown(corps, { titreARetirer } = {}) {
  const blocs = blocsMarkdown(corps, { titreARetirer });
  return blocs.map(b => {
    if (b.t === "h") return h("h" + Math.min(4, b.n + 1), null, b.texte);
    if (b.t === "p") return h("p", null, morceaux(b.morceaux));
    if (b.t === "ul" || b.t === "ol") return h(b.t, null, b.items.map(it => h("li", null, morceaux(it))));
    if (b.t === "cite") return h("blockquote", null, morceaux(b.morceaux));
    if (b.t === "table") return h("div", { class: "md-tableau" }, h("table", null, h("thead", null, h("tr", null, b.entetes.map(c => h("th", null, morceaux(c))))), h("tbody", null, b.lignes.map(r => h("tr", null, r.map(c => h("td", null, morceaux(c))))))));
    return h("hr");
  });
}

/** Texte avec **gras** et *italique* → nœuds (jamais de HTML). */
export const enligne = t => morceaux(inlineMd(t));

/** Fenêtre qui monte du bas. Renvoie la fonction qui la ferme. */
export function ouvrirFeuille(titre, corps) {
  const fond = h("div", { class: "sheet-back" });
  const fermer = () => fond.remove();
  const feuille = h("div", { class: "sheet", role: "dialog", "aria-label": titre },
    h("div", { class: "sheet-grip" }),
    h("div", { class: "row", style: "justify-content:space-between;margin-bottom:10px" }, h("h2", null, titre), h("button", { class: "iconbtn", "aria-label": "Fermer", onclick: fermer }, icon("x", 24))),
    corps);
  fond.addEventListener("click", e => { if (e.target === fond) fermer(); });
  fond.append(feuille);
  document.body.append(fond);
  return fermer;
}

const POINTS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
/** Un dé à points. */
export function de(n) {
  const d = h("div", { class: "die", role: "img", "aria-label": `dé : ${n}` });
  for (let i = 0; i < 9; i++) d.append(h("span", { class: POINTS[n].includes(i) ? "pip on" : "pip" }));
  return d;
}
