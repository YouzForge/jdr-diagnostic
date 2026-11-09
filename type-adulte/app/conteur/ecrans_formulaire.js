// Formulaire de fiche (créer ou modifier), tout vient du profil : champs, sections, photo. Les contrôles s'adaptent au type du champ :
// nombre = « − 0 + », oui/non = case à cocher, choix = boutons, texte long = zone de texte, photo = appareil ou galerie.
import { h, icon } from "./ui.js?v=0.16.1";
import { boitePhoto, envoyerPhoto } from "./photo.js?v=0.16.1";
import { modeleFormulaire, enregistrerCreation, enregistrerModification, ouvrirPourModifier, messageEcriture } from "../../src/app/formulaire.js?v=0.16.1";
import { platNom } from "../../src/conteur/liens.js?v=0.16.1";

export async function ecranFormulaire(ctx, colId, fichier) {
  const col = ctx.donnees.colonne(colId);
  const retour = fichier ? `/mj/c/${colId}/${encodeURIComponent(fichier)}` : `/mj/c/${colId}`;
  if (!ctx.ecriture) return { title: col.singular || col.label, back: retour, nav: "monde", node: h("div", { class: "page with-nav" }, h("div", { class: "card tip" }, "L'écriture n'est pas activée pour ce JDR : les fiches ne peuvent pas être créées ni modifiées ici.")) };
  const session = ctx.session, profil = ctx.profil;
  let ouverture = null, modele, existants = [];
  if (fichier) {
    try { ouverture = await ouvrirPourModifier({ session, profil, col, fichier, images: true }); }
    catch (e) { if (e && (e.status === 401 || e.auth)) throw e; return { title: "Modifier", back: retour, nav: "monde", node: h("div", { class: "page with-nav" }, h("div", { class: "card ko" }, messageEcriture(e).texte)) }; }
    if (!ouverture) return { title: "Modifier", back: retour, nav: "monde", node: h("div", { class: "page with-nav" }, h("div", { class: "card ko" }, "Cette fiche n'existe plus.")) };
    modele = ouverture.modele;
  } else {
    modele = modeleFormulaire(profil, session.role, col, null, { images: true });
    try { existants = (await ctx.depot.lister(col.dossier)).donnees.map(x => x.name); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
  }
  // suggestions pour les champs « ref:<collection> » : les noms des fiches de cette collection
  const suggestions = {};
  for (const c of modele.champs) if (c.ref && !suggestions[c.ref]) { try { suggestions[c.ref] = (await ctx.donnees.charger(c.ref)).items.map(i => i.name); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; suggestions[c.ref] = []; } }

  const valeurs = {};                  // clé de champ → valeur courante (texte ou booléen)
  const sectionsVal = {};
  const erreursZone = new Map();
  const msg = h("div", { class: "muted center" });
  const etiquette = t => h("label", { class: "kicker", style: "text-transform:none;letter-spacing:0;font-size:15px" }, t);
  const enrober = (cle, libelle, requis, controle, aide) => {
    const err = h("div", { class: "ko", role: "alert" }); erreursZone.set(cle, err);
    return h("div", { class: "list", style: "gap:6px" }, libelle ? etiquette(libelle + (requis ? " *" : "")) : null, controle, aide ? h("div", { class: "muted", style: "font-size:14px" }, aide) : null, err);
  };
  const blocs = [];
  for (const c of modele.champs) {
    valeurs[c.cle] = c.genre === "bool" ? c.initial === "true" : c.initial;
    let ctl;
    if (c.genre === "bool") {
      ctl = h("button", { type: "button", class: "checkrow", "aria-pressed": String(valeurs[c.cle]) }, h("span", { class: "cbox" }, icon("check", 22, "#fff", 3)), c.libelle);
      ctl.addEventListener("click", () => { valeurs[c.cle] = !valeurs[c.cle]; ctl.setAttribute("aria-pressed", String(valeurs[c.cle])); });
      blocs.push(h("div", null, ctl)); continue;
    }
    if (c.genre === "int") {
      if (valeurs[c.cle] === "") valeurs[c.cle] = "0";
      const val = h("div", { style: "font:600 26px Fredoka;min-width:2.5em;text-align:center" }, valeurs[c.cle]);
      const regler = n => { valeurs[c.cle] = String(Math.max(0, Math.min(99, n))); val.textContent = valeurs[c.cle]; };
      ctl = h("div", { class: "row card", style: "padding:8px 12px;justify-content:space-between" },
        h("button", { type: "button", class: "iconbtn", "aria-label": "Moins", onclick: () => regler(Number(valeurs[c.cle]) - 1) }, icon("minus", 24)), val,
        h("button", { type: "button", class: "iconbtn", "aria-label": "Plus", onclick: () => regler(Number(valeurs[c.cle]) + 1) }, icon("plus", 24)));
    } else if (c.options) {
      const rang = h("div", { class: "row", style: "gap:8px;flex-wrap:wrap" });
      const choix = [...(c.requis ? [] : [""]), ...c.options];
      const dessiner = () => rang.replaceChildren(...choix.map(o => h("button", { type: "button", class: "tab" + (valeurs[c.cle] === o ? " on" : ""), style: "flex:0 1 auto;padding:8px 14px", "aria-pressed": String(valeurs[c.cle] === o), onclick: () => { valeurs[c.cle] = o; dessiner(); } }, o === "" ? "—" : ((c.libellesOptions && c.libellesOptions[o]) || o.replace(/_/g, " ")))));
      dessiner(); ctl = rang;
    } else if (c.genre === "area") {
      ctl = h("textarea", { class: "field", style: "min-height:96px", placeholder: "À écrire ou dicter (le micro du clavier marche partout)" }); ctl.value = valeurs[c.cle];
      ctl.addEventListener("input", () => { valeurs[c.cle] = ctl.value; });
    } else if (c.genre === "image") {
      const tenant = h("div", null, boitePhoto(ctx, valeurs[c.cle] || null, "photo", col.icone || "image"));
      const note = h("div", { class: "muted center", style: "font-size:14px" });
      const mk = capture => {
        const entree = h("input", { type: "file", accept: "image/*", ...(capture ? { capture: "environment" } : {}), style: "display:none" });
        entree.addEventListener("change", async () => {
          const f = entree.files[0]; if (!f) return;
          note.className = "muted center"; note.textContent = "Envoi de la photo…";
          try {
            const r = await envoyerPhoto(ctx, f);
            tenant.replaceChildren(h("div", { class: "photo" }, h("img", { src: r.apercu, alt: "" })));
            valeurs[c.cle] = r.nom;
            note.className = "ok center"; note.textContent = `Photo rangée dans ${ctx.regles.photos}. Pense à enregistrer la fiche.`;
          } catch (e) { note.className = "ko center"; note.textContent = e.status ? "La photo n'a pas pu être envoyée." : "Pas de réseau : la photo n'a pas été envoyée."; }
          entree.value = "";
        });
        return entree;
      };
      const cam = mk(true), gal = mk(false);
      ctl = h("div", { class: "list", style: "gap:10px" }, tenant,
        h("div", { class: "row", style: "gap:10px" },
          h("button", { type: "button", class: "btn primary grow", onclick: () => cam.click() }, icon("camera", 22, "#fff"), "Photo"),
          h("button", { type: "button", class: "btn grow", onclick: () => gal.click() }, icon("image", 22), "Choisir")), note, cam, gal);
    } else {
      ctl = h("input", { class: "field", type: "text", autocomplete: "off" }); ctl.value = valeurs[c.cle];
      ctl.addEventListener("input", () => { valeurs[c.cle] = ctl.value; });
      if (c.ref && (suggestions[c.ref] || []).length) { const id = "dl-" + c.cle; ctl.setAttribute("list", id); ctl = h("div", null, ctl, h("datalist", { id }, suggestions[c.ref].map(n => h("option", { value: n })))); }
    }
    blocs.push(enrober(c.cle, c.libelle, c.requis, ctl, c.aide));
  }
  for (const s of modele.sections) {
    sectionsVal[s.titre] = s.initial;
    const ta = h("textarea", { class: "field", style: "min-height:110px", placeholder: "À écrire ou dicter (le micro du clavier marche partout)" }); ta.value = s.initial;
    ta.addEventListener("input", () => { sectionsVal[s.titre] = ta.value; });
    blocs.push(enrober("§" + s.titre, s.titre, false, ta));
  }
  const bouton = h("button", { class: "btn primary grow", style: "font-size:20px;padding:14px" }, "Enregistrer");
  bouton.addEventListener("click", async () => {
    msg.className = "muted center"; msg.textContent = "Enregistrement…";
    for (const e of erreursZone.values()) e.textContent = "";
    bouton.disabled = true;
    try {
      const saisies = { champs: { ...valeurs }, sections: { ...sectionsVal } };
      const r = fichier ? await enregistrerModification({ session, profil, col, fichier, ouverture, saisies }) : await enregistrerCreation({ session, profil, col, modele, saisies, existants });
      if (r.erreurs) { for (const [k, v] of Object.entries(r.erreurs)) if (erreursZone.has(k)) erreursZone.get(k).textContent = v; msg.className = "ko center"; msg.textContent = "Corrige les champs signalés."; bouton.disabled = false; return; }
      location.hash = r.inchange ? "#" + retour : `#/mj/c/${colId}/${encodeURIComponent(r.fichier)}`;
    } catch (e) {
      if (e && (e.status === 401 || e.auth)) throw e;
      const m = messageEcriture(e);
      msg.className = "ko center"; msg.textContent = m.texte;
      bouton.disabled = false;
    }
  });
  return {
    title: (fichier ? "Modifier : " : "Nouveau : ") + (col.singular || col.label), back: retour, nav: "monde",
    node: h("div", { class: "page with-nav" }, ...blocs, msg, h("div", { class: "bottombar" }, h("div", { class: "row", style: "gap:10px" }, h("a", { class: "btn grow", href: "#" + retour }, "Annuler"), bouton)))
  };
}
