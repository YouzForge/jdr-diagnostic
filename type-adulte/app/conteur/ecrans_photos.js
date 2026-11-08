// Photos du dossier du JDR : à relier à une fiche, ou à supprimer (corbeille OneDrive, récupérable 93 jours).
import { h, icon } from "./ui.js";
import { boitePhoto, envoyerPhoto } from "./photo.js";
import { banniereHorsLigne } from "./banniere.js";
import { photosUtilisees, platNom } from "../../src/conteur/liens.js";

const CLASSES = [["creature", "Monstre"], ["lieu", "Lieu"], ["objet", "Objet"], ["personnage", "Personnage"], ["compagnon", "Compagnon"]];

export async function ecranPhotos(ctx) {
  const dossier = ctx.regles.photos;
  if (!dossier) throw new Error("Les photos ne sont pas activées pour ce JDR.");
  const ls = await ctx.donnees.lister(dossier);
  let photos = ls.fichiers.filter(f => !f.dir && /\.(jpe?g|png|webp)$/i.test(f.name)).map(f => f.name).sort().reverse();
  const cols = {};
  await Promise.all(CLASSES.map(async ([id]) => { try { cols[id] = (await ctx.donnees.charger(id)).items; } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; cols[id] = []; } }));
  let utilisees = photosUtilisees(cols);
  let choisie = null, classe = "creature", cible = null, mode = "classer", selection = false, confirmation = false, occupe = false;
  const sel = new Set();
  const visibles = () => (mode === "toutes" ? photos : photos.filter(p => !utilisees.has(p)));

  const barre = h("div", { class: "row", style: "gap:8px;flex-wrap:wrap" });
  const grille = h("div", { class: "tiles" });
  const panneau = h("div", { class: "card" });
  const msg = h("div", { class: "muted center" });
  const dire = (classeMsg, texte) => { msg.className = classeMsg + " center"; msg.textContent = texte; };

  const dessinerBarre = () => {
    barre.replaceChildren(...[
      h("button", { class: "tab" + (mode === "classer" ? " on" : ""), style: "flex:1 1 auto;padding:8px 12px", onclick: () => { mode = "classer"; sel.clear(); confirmation = false; tout(); } }, `À classer (${photos.filter(p => !utilisees.has(p)).length})`),
      h("button", { class: "tab" + (mode === "toutes" ? " on" : ""), style: "flex:1 1 auto;padding:8px 12px", onclick: () => { mode = "toutes"; sel.clear(); confirmation = false; tout(); } }, `Toutes (${photos.length})`),
      ctx.ecriture ? h("button", { class: "btn block" + (selection ? " primary" : ""), style: "flex:1 1 100%", disabled: occupe, onclick: () => { selection = !selection; sel.clear(); confirmation = false; choisie = null; cible = null; msg.textContent = ""; tout(); } },
        icon(selection ? "check" : "trash", 22, selection ? "#fff" : "var(--ink)", 2), selection ? "Terminer la sélection" : "Sélectionner pour supprimer") : null].filter(Boolean));
  };
  const dessinerGrille = () => {
    grille.replaceChildren();
    const liste = visibles();
    if (!liste.length) { grille.append(h("div", { class: "card dashed muted", style: "grid-column:1/-1" }, photos.length ? "Toutes les photos sont reliées à une fiche." : "Aucune photo pour l'instant. Prends-en depuis « Mes outils » ou avec le bouton photo en haut.")); return; }
    for (const p of liste) {
      const actif = selection ? sel.has(p) : choisie === p;
      const liens = utilisees.get(p);
      const b = h("button", { class: "ptile" + (actif ? " on" : ""), "aria-pressed": String(actif), disabled: occupe, onclick: () => {
        msg.textContent = "";
        if (selection) { sel.has(p) ? sel.delete(p) : sel.add(p); confirmation = false; dessinerGrille(); dessinerPanneau(); return; }
        if (liens) { dire("muted", `Déjà reliée à « ${liens.map(l => l.name).join(", ")} ». Pour la supprimer, touche « Sélectionner ».`); return; }
        choisie = p; cible = null; dessinerGrille(); dessinerPanneau();
      } }, boitePhoto(ctx, p, "photo sq"),
        h("span", { class: "muted", style: "font-size:12px;overflow-wrap:anywhere" }, p),
        liens ? h("span", { style: "font-size:12px;font-weight:800;overflow-wrap:anywhere" }, "→ " + liens.map(l => l.name).join(", ")) : null);
      if (actif) b.append(h("span", { class: "tick" }, icon("check", 20, "#fff", 3)));
      grille.append(b);
    }
  };

  const panneauSuppression = () => {
    const n = sel.size;
    if (!n) { panneau.append(h("div", { class: "muted" }, "Touche les photos à supprimer. Elles vont dans la corbeille de OneDrive (récupérables 93 jours).")); return; }
    const liees = [...sel].filter(p => utilisees.has(p));
    if (!confirmation) {
      panneau.append(h("div", { class: "kicker" }, n === 1 ? "1 photo choisie" : `${n} photos choisies`),
        h("button", { class: "btn red block", onclick: () => { confirmation = true; dessinerPanneau(); } }, icon("trash", 22, "#fff", 2), n === 1 ? " Supprimer cette photo" : ` Supprimer ces ${n} photos`));
      return;
    }
    panneau.append(h("div", { class: "kicker" }, "Supprimer pour de bon ?"),
      h("div", null, `${n === 1 ? "La photo sera envoyée" : `Les ${n} photos seront envoyées`} dans la corbeille de OneDrive (récupérable pendant 93 jours).`),
      ...(liees.length ? [h("div", { class: "ko" }, "Attention : " + liees.map(p => `${p} est utilisée par « ${utilisees.get(p).map(l => l.name).join(", ")} »`).join(" ; ") + ". Ces fiches n'auront plus de photo.")] : []),
      h("div", { class: "row", style: "gap:10px;margin-top:8px" },
        h("button", { class: "btn grow", disabled: occupe, onclick: () => { confirmation = false; dessinerPanneau(); } }, "Garder"),
        h("button", { class: "btn red grow", disabled: occupe, onclick: supprimer }, "Oui, supprimer")));
  };
  const supprimer = async () => {
    occupe = true; dire("muted", "Suppression…"); dessinerBarre(); dessinerGrille(); dessinerPanneau();
    const faites = [], ratees = [];
    for (const p of [...sel]) {
      try {
        await ctx.depot.supprimerPhoto(`${dossier}/${p}`);
        faites.push(p);
        for (const l of utilisees.get(p) || []) {          // la fiche perd sa photo
          try { await ctx.donnees.definirPhoto(l.classe, l.file, ""); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; /* la fiche pointera vers une photo absente : l'icône s'affiche */ }
          const it = (cols[l.classe] || []).find(i => i.file === l.file); if (it) it.photo = null;
        }
      } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; ratees.push(p); }
    }
    photos = photos.filter(p => !faites.includes(p));
    utilisees = photosUtilisees(cols);
    sel.clear(); for (const p of ratees) sel.add(p);
    confirmation = false; occupe = false;
    if (ratees.length) dire("ko", `${faites.length} supprimée(s), ${ratees.length} n'ont pas pu l'être. Réessaie (réseau ?).`);
    else dire("ok", faites.length === 1 ? "Photo supprimée." : `${faites.length} photos supprimées.`);
    tout();
  };

  const dessinerPanneau = () => {
    panneau.replaceChildren();
    if (selection) { panneauSuppression(); return; }
    if (!choisie) { panneau.append(h("div", { class: "muted" }, "Touche une photo pour l'associer à une fiche.")); return; }
    const puces = h("div", { class: "row", style: "flex-wrap:wrap;gap:8px" }, CLASSES.map(([id, l]) => h("button", { class: "tab" + (id === classe ? " on" : ""), style: "flex:0 1 auto;padding:8px 14px", onclick: () => { classe = id; cible = null; dessinerPanneau(); } }, l)));
    const liste = h("div", { class: "list", style: "gap:8px" });
    const recherche = h("div", { class: "search" }, icon("search", 22, "var(--muted)"), h("input", { type: "search", placeholder: "Choisir la fiche", oninput: e => dessinerListe(e.target.value) }));
    const dessinerListe = q => {
      liste.replaceChildren();
      const vus = (cols[classe] || []).filter(i => platNom(i.name).includes(platNom(q || "")));
      if (!vus.length) liste.append(h("div", { class: "muted" }, (cols[classe] || []).length ? "Rien ne correspond." : "Aucune fiche de ce type pour l'instant."));
      for (const i of vus) liste.append(h("button", { class: "card", style: "padding:8px 12px;flex-direction:row;align-items:center;gap:10px;" + (cible === i.file ? "background:var(--yellow)" : ""), onclick: () => { cible = i.file; dessinerListe(q); } }, h("span", { class: "grow" }, i.name), cible === i.file ? icon("check", 22, "var(--ink)", 3) : null));
    };
    dessinerListe("");
    const aller = h("button", { class: "btn primary block", onclick: async () => {
      if (!cible) { dire("ko", "Choisis d'abord une fiche."); return; }
      aller.disabled = true; dire("muted", "Enregistrement…");
      try {
        await ctx.donnees.definirPhoto(classe, cible, choisie);
        const it = (cols[classe] || []).find(i => i.file === cible); if (it) it.photo = choisie;
        utilisees = photosUtilisees(cols); choisie = null; cible = null;
        dire("ok", "Photo associée."); tout();
      } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; dire("ko", e.message || "Échec."); aller.disabled = false; }
    } }, "Associer");
    panneau.append(h("div", { class: "kicker" }, "Associer la photo choisie à"), puces, recherche, liste, aller);
  };
  const tout = () => { dessinerBarre(); dessinerGrille(); dessinerPanneau(); };
  tout();

  const entree = h("input", { type: "file", accept: "image/*", capture: "environment", style: "display:none" });
  entree.addEventListener("change", async () => {
    const f = entree.files[0]; if (!f) return;
    dire("muted", "Envoi de la photo…");
    try { const r = await envoyerPhoto(ctx, f); photos.unshift(r.nom); selection = false; sel.clear(); mode = "classer"; choisie = r.nom; dire("ok", "Photo rangée. Choisis la fiche à laquelle l'associer."); tout(); }
    catch (e) { dire("ko", e.raison === "ecriture_desactivee" ? "L'écriture est désactivée pour ce jeu." : e.status ? "La photo n'a pas pu être envoyée." : "Pas de réseau."); }
    entree.value = "";
  });
  return {
    title: "Photos", back: "/mj/monde", nav: "monde",
    action: ctx.ecriture ? h("button", { class: "iconbtn plus", "aria-label": "Prendre une photo", onclick: () => entree.click() }, icon("camera", 24, "#fff", 2)) : null,
    node: h("div", { class: "page with-nav" }, banniereHorsLigne(ctx, ls.perime), h("div", { class: "muted" }, `Les photos du dossier ${dossier} : à relier à une fiche, ou à supprimer.`), barre, grille, panneau, msg, entree)
  };
}
