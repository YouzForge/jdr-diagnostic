// Onglet « Savoirs » › Carte : les cartes du monde (images du dossier de la table), avec zoom (boutons, pincement, molette) et déplacement au doigt.
import { h, icon, message, urlImage, choix } from "./ui.js?v=0.17.0";
import { sousNav } from "./ecrans_savoirs.js?v=0.17.0";

const MIN_RELATIF = 0.9, MAX_RELATIF = 10;

/** Visionneuse : renvoie { noeud, detruire }. */
export function visionneuse(url) {
  const img = h("img", { class: "jr-carte-img", src: url, alt: "Carte", draggable: "false" });
  const vue = h("div", { class: "jr-carte-vue", tabindex: "0", role: "group", "aria-label": "Carte : pincer pour zoomer, glisser pour se déplacer" }, img);
  let s = 1, x = 0, y = 0, s0 = 1;
  const pointeurs = new Map();
  let dernierEcart = 0;
  const appliquer = () => { img.style.transform = `translate(${x}px,${y}px) scale(${s})`; };
  const borner = () => {
    const W = vue.clientWidth, H = vue.clientHeight, w = img.naturalWidth * s, hh = img.naturalHeight * s;
    x = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, x));
    y = hh <= H ? (H - hh) / 2 : Math.min(0, Math.max(H - hh, y));
  };
  const zoomer = (k, cx, cy) => {
    const ns = Math.max(s0 * MIN_RELATIF, Math.min(s0 * MAX_RELATIF, s * k));
    const f = ns / s;
    x = cx - (cx - x) * f; y = cy - (cy - y) * f; s = ns;
    borner(); appliquer();
  };
  const ajuster = () => {
    const W = vue.clientWidth, H = vue.clientHeight;
    if (!img.naturalWidth || !W || !H) return;
    s0 = s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    x = (W - img.naturalWidth * s) / 2; y = (H - img.naturalHeight * s) / 2; appliquer();
  };
  const centre = () => [vue.clientWidth / 2, vue.clientHeight / 2];
  const position = e => { const r = vue.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  img.addEventListener("load", ajuster);
  vue.addEventListener("pointerdown", e => { vue.setPointerCapture?.(e.pointerId); pointeurs.set(e.pointerId, position(e)); dernierEcart = 0; });
  vue.addEventListener("pointermove", e => {
    if (!pointeurs.has(e.pointerId)) return;
    const [px, py] = pointeurs.get(e.pointerId), [nx, ny] = position(e);
    pointeurs.set(e.pointerId, [nx, ny]);
    if (pointeurs.size === 1) { x += nx - px; y += ny - py; borner(); appliquer(); }
    else if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      const ecart = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (dernierEcart) zoomer(ecart / dernierEcart, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      dernierEcart = ecart;
    }
  });
  const fin = e => { pointeurs.delete(e.pointerId); dernierEcart = 0; };
  vue.addEventListener("pointerup", fin); vue.addEventListener("pointercancel", fin);
  vue.addEventListener("wheel", e => { e.preventDefault(); const [cx, cy] = position(e); zoomer(e.deltaY < 0 ? 1.2 : 1 / 1.2, cx, cy); }, { passive: false });
  const onResize = () => { if (s <= s0 * 1.001) ajuster(); else { borner(); appliquer(); } };
  window.addEventListener("resize", onResize);
  // L'image peut finir de charger avant que la vue soit dans la page (taille nulle) : on ajuste dès que la vue prend sa taille.
  const observateur = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
  observateur?.observe(vue);
  const bouton = (nom, texte, fn) => h("button", { class: "jr-rond grand", "aria-label": texte, onclick: fn }, icon(nom, 22));
  const commandes = h("div", { class: "jr-zoom" },
    bouton("plus", "Agrandir", () => zoomer(1.5, ...centre())), bouton("minus", "Réduire", () => zoomer(1 / 1.5, ...centre())), bouton("target", "Recentrer la carte", ajuster));
  return { noeud: h("div", { class: "jr-carte-bloc" }, vue, commandes), detruire: () => { window.removeEventListener("resize", onResize); observateur?.disconnect(); }, ajuster };
}

export async function ecranCarte(ctx) {
  const r = await ctx.donnees.cartes();
  const page = h("div", { class: "jr-page carte" }, sousNav("carte"));
  if (!r.noms.length) { page.append(message("Aucune carte n'a encore été déposée par le MJ.", "info")); return { onglet: "savoirs", sous: "carte", node: page }; }
  if (r.perime) page.append(message("Copie enregistrée sur ce téléphone : la connexion ne répond pas.", "alerte"));
  let choisie = Math.min(ctx.etat.carte || 0, r.noms.length - 1);
  const zone = h("div", { class: "jr-carte-zone" });
  let courante = null;
  const afficher = async () => {
    if (courante) courante.detruire();
    zone.replaceChildren(h("div", { class: "jr-attente" }, "Chargement de la carte…"));
    const url = await urlImage(ctx, ctx.donnees.cheminCarte(r.noms[choisie]));
    if (!url) { courante = null; zone.replaceChildren(message("Cette carte est illisible.", "erreur")); return; }
    courante = visionneuse(url);
    zone.replaceChildren(courante.noeud);
  };
  if (r.noms.length > 1) page.append(choix("Carte", String(choisie), r.noms.map((n, i) => [String(i), n.replace(/\.[a-z]+$/i, "").replace(/_/g, " ")]), v => { choisie = Number(v); ctx.etat.carte = choisie; afficher(); }));
  page.append(zone);
  afficher();
  return { onglet: "savoirs", sous: "carte", node: page, cleanup: () => { if (courante) courante.detruire(); } };
}
