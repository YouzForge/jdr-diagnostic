// Briques d'écriture de l'application « joueur » (tranche 2) : confirmation, exécution d'une écriture avec message d'erreur, formulaires de note
// et de dossier, étiquettes modifiables. Aucune commande d'écriture n'est dessinée si `ctx.donnees.peutEcrire` est faux (interrupteur fermé, ou MJ qui voit comme un joueur).
// RÈGLE du moteur : jamais de innerHTML ; tout est construit avec le DOM.
import { h, icon, feuille, message, fermerFeuilles } from "./ui.js?v=0.17.0";
import { messageErreur } from "../../src/joueur/erreurs.js?v=0.17.0";
import { verifierEtiquette, etiquettesUtilisees, MAX_TITRE, MAX_CORPS_NOTE, MAX_NOTE_RENCONTRE, MAX_BOURSE, MAX_ETIQUETTE } from "../../src/joueur/ecriture.js?v=0.17.0";
import { verifierNomDossier } from "../../src/depot/depot.js?v=0.17.0";
import { EcritureInvalide } from "../../src/ecriture/fiche.js?v=0.17.0";

/** « Recharger » : ferme les fenêtres (leur texte non enregistré est gardé comme brouillon) et relit l'écran. */
const boutonRecharger = ctx => h("button", { class: "jr-bouton", type: "button", onclick: () => { fermerFeuilles(); ctx.reafficher(); } }, icon("clock", 18), "Recharger");

export const peut = ctx => !!(ctx.donnees && ctx.donnees.peutEcrire);

/**
 * Exécute une écriture. Les boutons sont bloqués pendant l'envoi (un double appui n'écrit pas deux fois) ; l'échec est dit dans `zone`, avec « Recharger » si le fichier a changé.
 * → { ok:true, r } ou { ok:false, m }. Une session expirée est confiée à l'application (reconnexion).
 */
export async function executer(ctx, action, { zone = null, boutons = [] } = {}) {
  boutons = boutons.filter(Boolean);
  boutons.forEach(b => { b.disabled = true; });
  if (zone) zone.replaceChildren();
  try { return { ok: true, r: await action() }; }
  catch (e) {
    const m = messageErreur(e);
    if (m.genre === "auth") { ctx.surErreur(e); return { ok: false, m }; }
    if (zone) zone.replaceChildren(message(m.texte, "erreur"), m.recharger ? boutonRecharger(ctx) : null);
    return { ok: false, m };
  } finally { boutons.forEach(b => { b.disabled = false; }); }
}

/** Demande confirmation avant une suppression ou un retrait. → Promise<boolean> (fermer la fenêtre = non). */
export function confirmer(titre, texte, libelle = "Supprimer") {
  return new Promise(resolve => {
    let rep = false;
    const oui = h("button", { class: "jr-bouton danger", type: "button", onclick: () => { rep = true; fermer(); } }, icon("trash", 18), libelle);
    const non = h("button", { class: "jr-bouton", type: "button", onclick: () => fermer() }, "Annuler");
    const fermer = feuille(titre, [h("p", { class: "jr-texte" }, texte), h("div", { class: "jr-actions" }, non, oui)], { surFermeture: () => resolve(rep) });
  });
}

const champ = (libelle, controle, aide = null) => h("label", { class: "jr-champ" }, h("span", null, libelle), controle, aide ? h("small", { class: "jr-aide" }, aide) : null);
const saisie = (props = {}) => h("input", { class: "jr-saisie", type: "text", autocomplete: "off", autocapitalize: "sentences", enterkeyhint: "done", ...props });
const zoneTexte = (props = {}) => h("textarea", { class: "jr-saisie zone", rows: "8", ...props });

/**
 * Formulaire d'une note.
 *  - zone « notes » ou « journal », `handle` absent = création (`session` pour le journal) ; `handle` (de ouvrirNote) = modification ;
 *  - zone « rencontres » : seule « Ma note » se modifie (la présentation est écrite par le MJ).
 * Un texte non enregistré (fenêtre fermée par erreur) est gardé en mémoire de la page et repris à la réouverture.
 */
export function formulaireNote(ctx, { zone, handle = null, session = null, surFini = () => {} }) {
  const rencontre = zone === "rencontres";
  const cle = `${zone}|${handle ? handle.fichier : "nouvelle"}|${session ?? ""}`;
  ctx.brouillons = ctx.brouillons || new Map();
  const brouillon = ctx.brouillons.get(cle);
  const el = handle ? handle.element : null;
  const titre = rencontre ? null : saisie({ maxlength: String(MAX_TITRE), value: (brouillon ? brouillon.titre : el ? el.titre : ""), "aria-label": "Titre", placeholder: "Titre" });
  const corpsInitial = brouillon ? brouillon.corps : rencontre ? (el ? el.note : "") : (el ? el.corps : "");
  const corps = zoneTexte({ maxlength: String(rencontre ? MAX_NOTE_RENCONTRE : MAX_CORPS_NOTE), "aria-label": rencontre ? "Ma note" : "Texte", placeholder: rencontre ? "Ce que tu retiens de cette rencontre…" : "Ton texte…" });
  corps.value = corpsInitial;
  const epingle = rencontre ? null : h("input", { type: "checkbox", id: "jr-epingle" });
  if (epingle) epingle.checked = brouillon ? brouillon.epingle : !!(el && el.epingle);
  const numSession = zone === "journal" && !handle ? saisie({ type: "number", inputmode: "numeric", min: "0", max: "9999", value: String(session ?? 1), "aria-label": "Numéro de session" }) : null;
  const msg = h("div", { class: "jr-retour-action" });
  let enregistre = false;
  const garder = () => { if (!enregistre) ctx.brouillons.set(cle, { titre: titre ? titre.value : "", corps: corps.value, epingle: epingle ? epingle.checked : false }); };
  const ok = h("button", { class: "jr-bouton gros", type: "button" }, icon("check", 20), "Enregistrer");
  const supprimer = handle && !rencontre ? h("button", { class: "jr-bouton danger", type: "button" }, icon("trash", 18), "Supprimer la note") : null;
  const fermer = feuille(rencontre ? "Ma note" : handle ? "Modifier la note" : session != null ? "Nouvelle note de journal" : "Nouvelle note", [
    brouillon ? message("Texte repris : tu ne l'avais pas enregistré.", "info") : null,
    numSession ? champ("Session", numSession) : null,
    titre ? champ("Titre", titre) : null,
    champ(rencontre ? "Ma note" : "Texte", corps),
    epingle ? h("label", { class: "jr-case" }, epingle, h("span", null, "Épinglée en haut de la liste")) : null,
    msg, ok, supprimer
  ], { large: true, surFermeture: garder });
  ok.addEventListener("click", async () => {
    const r = await executer(ctx, async () => {
      if (rencontre) return ctx.donnees.enregistrerNote(handle, { note: corps.value });
      if (handle) return ctx.donnees.enregistrerNote(handle, { titre: titre.value, corps: corps.value, epingle: epingle.checked });
      let n = session;
      if (numSession) { if (!/^\d{1,4}$/.test(numSession.value.trim())) throw new EcritureInvalide("Le numéro de session est un nombre entier", "session_invalide"); n = Number(numSession.value.trim()); }
      return ctx.donnees.creerNote(zone, { titre: titre.value, corps: corps.value, session: n, epingle: epingle.checked });
    }, { zone: msg, boutons: [ok, supprimer].filter(Boolean) });
    if (!r.ok) return;
    enregistre = true; ctx.brouillons.delete(cle); fermer(); surFini(r.r);
  });
  if (supprimer) supprimer.addEventListener("click", async () => {
    if (!(await confirmer("Supprimer cette note ?", `« ${el.titre} » ira dans la corbeille de ton OneDrive (récupérable pendant 93 jours).`))) return;
    const r = await executer(ctx, () => ctx.donnees.supprimerNote(handle), { zone: msg, boutons: [ok, supprimer] });
    if (!r.ok) return;
    enregistre = true; ctx.brouillons.delete(cle); fermer(); surFini(null);
  });
  return fermer;
}

/** Ouvre une note existante pour la modifier (lecture fraîche, version gardée). Les erreurs s'affichent dans une fenêtre. */
export async function modifierNote(ctx, zone, fichier, surFini) {
  const r = await executer(ctx, () => ctx.donnees.ouvrirNote(zone, fichier));
  if (!r.ok) {
    const zoneErr = h("div", null);
    feuille("Modification impossible", [zoneErr]);
    zoneErr.append(message(r.m.texte, "erreur"), r.m.recharger ? boutonRecharger(ctx) : null);
    return;
  }
  formulaireNote(ctx, { zone, handle: r.r, surFini });
}

/** Une ligne de texte (nom de dossier, bourse…) dans une petite fenêtre. `valider` lève une erreur (message montré) ; `enregistrer(valeur)` écrit. */
export function formulaireLigne(ctx, { titre, libelle, valeur = "", max = 60, aide = null, libelleOk = "Enregistrer", valider = v => v, enregistrer, surFini = () => {}, permettreVide = false }) {
  const s = saisie({ maxlength: String(max), value: valeur, "aria-label": libelle });
  const msg = h("div", { class: "jr-retour-action" });
  const ok = h("button", { class: "jr-bouton gros", type: "button" }, icon("check", 20), libelleOk);
  const fermer = feuille(titre, [champ(libelle, s, aide), msg, ok]);
  const valide = async () => {
    const r = await executer(ctx, async () => { const v = valider(s.value.trim()); if (!v && !permettreVide) throw new EcritureInvalide("Écris quelque chose", "vide"); return enregistrer(v); }, { zone: msg, boutons: [ok] });
    if (!r.ok) return;
    fermer(); surFini(r.r);
  };
  ok.addEventListener("click", valide);
  s.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); valide(); } });
  setTimeout(() => s.focus(), 50);
  return fermer;
}

export const formulaireDossier = (ctx, { titre, valeur = "", enregistrer, surFini }) =>
  formulaireLigne(ctx, { titre, libelle: "Nom du dossier", valeur, max: 60, valider: v => { verifierNomDossier(v); return v; }, enregistrer, surFini, libelleOk: titre.startsWith("Renommer") ? "Renommer" : "Créer" });

export const formulaireBourse = (ctx, { valeur = "", surFini }) =>
  formulaireLigne(ctx, { titre: "Ma bourse", libelle: "Ce que je possède en argent", valeur, max: MAX_BOURSE, aide: "Texte libre, par exemple « 12 pièces d'argent ». Vide = effacer.", enregistrer: v => ctx.donnees.changerBourse(v), surFini, permettreVide: true });

/**
 * Étiquettes d'un élément : celles écrites par le MJ dans l'en-tête (fixes) et celles du joueur (retirables). Ajouter ou retirer écrit tout de suite.
 * `surChangement` est appelée après chaque écriture réussie.
 */
export function blocEtiquettes(ctx, el, { fixes = [], posees = [], surChangement = () => {} }) {
  let liste = [...posees];
  const zonePuces = h("div", { class: "jr-puces" });
  const msg = h("div", { class: "jr-retour-action" });
  const champAjout = saisie({ maxlength: String(MAX_ETIQUETTE), placeholder: "Nouvelle étiquette", "aria-label": "Nouvelle étiquette", enterkeyhint: "done" });
  const ajouter = h("button", { class: "jr-bouton", type: "button", "aria-label": "Ajouter l'étiquette" }, icon("plus", 18));
  // Étiquettes déjà utilisées par le joueur (sur n'importe quel élément) : proposées d'un appui, filtrées par ce qu'il tape.
  const zoneSuggestions = h("div", { class: "jr-suggestions", role: "group", "aria-label": "Étiquettes déjà utilisées" });
  let deja = [];
  function dessinerSuggestions() {
    const frappe = champAjout.value.replace(/\s+/g, " ").trim().toLowerCase();
    const proposees = etiquettesUtilisees(new Map([["", deja]]), { sauf: [...liste, ...fixes] }).filter(t => !frappe || t.toLowerCase().includes(frappe));
    zoneSuggestions.replaceChildren(...(proposees.length ? [h("span", { class: "jr-aide" }, "Déjà utilisées"), ...proposees.map(t => h("button", { type: "button", class: "jr-pastille petite", onclick: () => ecrire([...liste, t]) }, t))] : []));
    zoneSuggestions.hidden = !proposees.length;
  }
  async function chargerSuggestions() {
    try { const r = await ctx.chargerEtiquettes(); deja = etiquettesUtilisees(r.map); } catch (e) { if (e && (e.status === 401 || e.auth)) throw e; deja = []; }
    dessinerSuggestions();
  }
  async function ecrire(nouvelle) {
    const r = await executer(ctx, async () => ctx.donnees.poserEtiquettes(el, nouvelle), { zone: msg, boutons: [ajouter, ...zonePuces.querySelectorAll("button"), ...zoneSuggestions.querySelectorAll("button")] });
    if (!r.ok) return false;
    liste = nouvelle; ctx.vider(); dessiner(); surChangement(liste);
    deja = etiquettesUtilisees(new Map([["", [...deja, ...liste]]]));   // la nouvelle étiquette rejoint tout de suite la liste…
    dessinerSuggestions();
    chargerSuggestions();                                                // …puis la liste est relue dans le fichier (une étiquette retirée de son seul élément disparaît)
    return true;
  }
  function dessiner() {
    zonePuces.replaceChildren(
      ...fixes.filter(t => !liste.some(x => x.toLowerCase() === t.toLowerCase())).map(t => h("span", { class: "jr-puce" }, t)),
      ...liste.map(t => h("span", { class: "jr-puce retirable" }, t, h("button", { type: "button", "aria-label": `Retirer l'étiquette ${t}`, onclick: () => ecrire(liste.filter(x => x !== t)) }, icon("x", 14)))));
    zonePuces.hidden = !zonePuces.childNodes.length;
  }
  async function ajout() {
    let v;
    try { v = verifierEtiquette(champAjout.value); } catch (e) { msg.replaceChildren(message(messageErreur(e).texte, "erreur")); return; }
    if (liste.some(x => x.toLowerCase() === v.toLowerCase())) { champAjout.value = ""; return; }
    if (await ecrire([...liste, v])) champAjout.value = "";
  }
  ajouter.addEventListener("click", ajout);
  champAjout.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); ajout(); } });
  champAjout.addEventListener("input", dessinerSuggestions);
  dessiner();
  zoneSuggestions.hidden = true;
  chargerSuggestions();
  return h("section", { class: "jr-etiquettes", "aria-label": "Étiquettes" }, zonePuces, h("div", { class: "jr-ajout" }, champAjout, ajouter), zoneSuggestions, msg);
}
