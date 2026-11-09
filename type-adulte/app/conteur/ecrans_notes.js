// Notes du parent : une seule page pour les notes et les idées. Chaque entrée est rangée sous « À traiter » ; un traitement automatique
// (tâche planifiée, deux fois par jour) la déplace sous « Traité » une fois exploitée.
import { h, icon, rendreMarkdown } from "./ui.js?v=0.18.0";
import { banniereHorsLigne } from "./banniere.js?v=0.18.0";
import { ajouterAInbox, entreeInbox } from "../../src/conteur/inbox.js?v=0.18.0";
import { messageEcriture } from "../../src/app/formulaire.js?v=0.18.0";

const TYPES = [["histoire", "Une histoire"], ["univers", "L'univers"], ["", "Je ne sais pas"]];

export async function ecranNotes(ctx) {
  const fichier = ctx.regles.inbox;
  const courant = await ctx.donnees.lire(fichier);
  const noms = [];
  for (const id of ["objet", "personnage", "lieu", "creature", "compagnon"]) {
    try { noms.push(...(await ctx.donnees.charger(id)).items.map(i => i.name)); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; }
  }
  const montre = h("div", { class: "card md" });
  const afficher = t => { montre.replaceChildren(...(t ? rendreMarkdown(t, { titreARetirer: null }) : [h("p", { class: "muted" }, "Aucune note pour l'instant.")])); };
  afficher(courant.texte);

  const choix = new Set();
  const champ = h("textarea", { class: "field", style: "min-height:140px", placeholder: "Une idée d'histoire, un élément pour l'univers, une phrase de l'enfant, un rappel… (le micro du clavier fonctionne ici)", "aria-label": "Nouvelle note" });
  const puces = h("div", { class: "row", style: "flex-wrap:wrap;gap:8px" });
  const dessinerPuces = () => puces.replaceChildren(...[...noms.slice(0, 10), "Fils ouverts"].map(n => h("button", { class: "tab" + (choix.has(n) ? " on" : ""), style: "flex:0 1 auto;padding:8px 14px", onclick: () => { choix.has(n) ? choix.delete(n) : choix.add(n); dessinerPuces(); } }, n)));
  dessinerPuces();
  let type = "";                                                   // "" = je ne sais pas : le traitement décide d'après le texte
  const boiteType = h("div", { class: "row", style: "flex-wrap:wrap;gap:8px" });
  const dessinerTypes = () => boiteType.replaceChildren(...TYPES.map(([v, l]) => h("button", { class: "tab" + (type === v ? " on" : ""), style: "flex:0 1 auto;padding:8px 14px", "aria-pressed": String(type === v), onclick: () => { type = v; dessinerTypes(); } }, l)));
  dessinerTypes();
  const msg = h("div", { class: "muted" });
  const bouton = h("button", { class: "btn primary block" }, icon("bulb", 24, "#fff"), "Enregistrer dans OneDrive");
  bouton.addEventListener("click", async () => {
    const note = champ.value.trim();
    if (!note) { msg.className = "ko"; msg.textContent = "Écris d'abord quelque chose."; return; }
    bouton.disabled = true; msg.className = "muted"; msg.textContent = "Enregistrement…";
    try {
      const f = await ctx.depot.lireFiche(fichier);                // relu juste avant d'écrire : jamais une copie périmée
      const entree = entreeInbox({ note, type, reprendre: [...choix] });
      if (!f) { await ctx.depot.creer(fichier, ajouterAInbox("", entree)); afficher(ajouterAInbox("", entree)); }
      else { const suite = ajouterAInbox(f.texte, entree); await ctx.depot.modifier(fichier, suite, f.etag); afficher(suite); }
      champ.value = ""; choix.clear(); type = ""; dessinerPuces(); dessinerTypes();
      msg.className = "ok"; msg.textContent = "Enregistré.";
    } catch (e) {
      if (e && (e.status === 401 || e.auth)) throw e;
      const m = messageEcriture(e); msg.className = "ko"; msg.textContent = m.texte;
    }
    bouton.disabled = false;
  });
  return {
    title: "Notes", nav: "notes",
    node: h("div", { class: "page with-nav" }, banniereHorsLigne(ctx, courant.perime),
      ctx.ecriture ? h("div", { class: "list" }, champ, h("div", { class: "kicker" }, "C'est plutôt pour (facultatif)"), boiteType, h("div", { class: "kicker" }, "Cela concerne (facultatif)"), puces, bouton, msg)
        : h("div", { class: "card tip" }, "L'écriture n'est pas activée pour ce JDR : les notes ne peuvent pas être enregistrées ici."),
      h("div", { class: "kicker" }, "Notes déjà enregistrées"), montre,
      h("div", { class: "muted", style: "font-size:15px" }, "Tout est écrit dans ", h("code", null, fichier), ", sous « À traiter ». Le traitement automatique s'en sert pour construire les histoires et nourrir l'univers, puis les range sous « Traité »."))
  };
}
