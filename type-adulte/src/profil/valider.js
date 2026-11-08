// Validation d'un profil de jeu (schéma 2).
// Le schéma 2 est un sur-ensemble du schéma 1 : il ajoute `tables`, `portee` (collections)
// et les métadonnées de modules (public, rôles). Retourne { erreurs, avertissements }.
// Une erreur bloque ; un avertissement signale (ex. règle non définie).

import { MODULES, ROLES, convientAuPublic } from "./modules.js";
import { analyserType, TYPES_SIMPLES } from "./champs.js";

const PUBLICS_PROFIL = ["enfant", "adulte", "tous"];
const MODES = ["unique", "separe"];
const ZONES_SEPARE = ["mj", "table", "joueur"];
const ZONES_UNIQUE = ["unique"];
const PORTEES = ["monde", "table"];
const RE_ID = /^[a-z][a-z0-9_]*$/;
const HABILLAGES = ["sobre", "conte"];
const RE_COULEUR = /^#[0-9a-fA-F]{6}$/;
const APPLICATIONS = ["standard", "conteur", "joueur"];
/** Collections dont l'application « conteur » (JDR pour enfant) a besoin. */
export const COLLECTIONS_CONTEUR = ["histoire", "prochaine", "personnage", "compagnon", "creature", "objet", "lieu"];

function estObjet(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

// Normalise un chemin de dossier pour comparer : séparateurs /, sans barres en tête ou en queue, sans casse
// (les dossiers OneDrive ne distinguent pas majuscules et minuscules).
function norm(chemin) {
  return String(chemin).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
}
function aRemontee(chemin) {
  return /(^|\/)\.\.(\/|$)/.test(String(chemin).replace(/\\/g, "/"));
}
function commencePar(chemin, racine) {
  const c = norm(chemin), r = norm(racine);
  return c === r || c.startsWith(r + "/");
}

/** Règles du module d100 pour l'application « joueur » : jamais devinées (règle 8), donc la réussite doit être écrite (D35). */
function validerD100Joueur(d, err) {
  const r = d.reussite;
  if (!estObjet(r)) err("module d100 : « reussite » doit être un objet {comparaison, critique_reussite_max, critique_echec_min} (règle de réussite non écrite : le moteur ne la devine pas)");
  else {
    if (r.comparaison !== "inferieur_ou_egal") err("module d100 : reussite.comparaison : seule la valeur « inferieur_ou_egal » est prise en charge");
    const cr = r.critique_reussite_max, ce = r.critique_echec_min;
    if (!(Number.isInteger(cr) && cr >= 0 && cr <= 50)) err("module d100 : reussite.critique_reussite_max doit être un entier de 0 à 50");
    if (!(Number.isInteger(ce) && ce >= 51 && ce <= 100)) err("module d100 : reussite.critique_echec_min doit être un entier de 51 à 100");
  }
  if (d.multiplicateur_total !== undefined && !(Number.isInteger(d.multiplicateur_total) && d.multiplicateur_total >= 1 && d.multiplicateur_total <= 100)) err("module d100 : « multiplicateur_total » doit être un entier de 1 à 100");
  if (!Array.isArray(d.caracteristiques) || !d.caracteristiques.length) err("module d100 : « caracteristiques » (liste de {id, nom}) obligatoire pour l'application « joueur »");
  else {
    const vus = new Set();
    d.caracteristiques.forEach((c, i) => {
      if (!estObjet(c) || typeof c.id !== "string" || !RE_ID.test(c.id) || typeof c.nom !== "string" || !c.nom.trim()) return err(`module d100 : caractéristique n° ${i + 1} : « id » (minuscules, chiffres, _) et « nom » obligatoires`);
      if (vus.has(c.id)) err(`module d100 : caractéristique « ${c.id} » en double`);
      vus.add(c.id);
    });
  }
  if (d.classes !== undefined) {
    if (!Array.isArray(d.classes)) err("module d100 : « classes » doit être une liste");
    else {
      const vus = new Set();
      d.classes.forEach((c, i) => {
        if (!estObjet(c) || typeof c.id !== "string" || !RE_ID.test(c.id)) return err(`module d100 : classe n° ${i + 1} : « id » obligatoire (minuscules, chiffres, _)`);
        if (vus.has(c.id)) err(`module d100 : classe « ${c.id} » en double`);
        vus.add(c.id);
        if (c.nom !== undefined && (typeof c.nom !== "string" || !c.nom.trim())) err(`module d100 : classe « ${c.id} » : « nom » doit être un texte`);
        if (c.bloc !== undefined && (typeof c.bloc !== "string" || !c.bloc.trim())) err(`module d100 : classe « ${c.id} » : « bloc » doit être un texte`);
        if (c.budget_competences !== undefined && !(Number.isInteger(c.budget_competences) && c.budget_competences >= 0)) err(`module d100 : classe « ${c.id} » : « budget_competences » doit être un entier`);
      });
    }
  }
}

export function validerProfil(prof) {
  const erreurs = [];
  const avertissements = [];
  const err = (m) => erreurs.push(m);
  const avert = (m) => avertissements.push(m);

  if (!estObjet(prof)) {
    return { erreurs: ["le profil doit être un objet JSON"], avertissements };
  }

  // ── racine ──
  if (prof.schema !== 2) {
    err(`schéma ${JSON.stringify(prof.schema)} non pris en charge : ce moteur lit le schéma 2`);
  }
  if (typeof prof.id !== "string" || !RE_ID.test(prof.id)) {
    err("« id » obligatoire : minuscules, chiffres et _ , commence par une lettre");
  }
  for (const k of ["nom", "dossier"]) {
    if (typeof prof[k] !== "string" || prof[k].trim() === "") err(`« ${k} » obligatoire`);
  }
  if (!PUBLICS_PROFIL.includes(prof.public)) {
    err(`« public » doit valoir ${PUBLICS_PROFIL.join(", ")}`);
  }

  // ── apparence (facultative : n'affecte que l'affichage) ──
  if (prof.theme !== undefined) {
    if (!estObjet(prof.theme)) err("« theme » doit être un objet");
    else if (prof.theme.habillage !== undefined && !HABILLAGES.includes(prof.theme.habillage)) {
      err(`« theme.habillage » doit valoir ${HABILLAGES.join(" ou ")} (reçu : ${JSON.stringify(prof.theme.habillage)})`);
    }
  }

  // ── sécurité ──
  const sec = estObjet(prof.securite) ? prof.securite : {};
  if (!estObjet(prof.securite) || !MODES.includes(sec.mode)) {
    err(`« securite.mode » doit valoir ${MODES.join(" ou ")}`);
  }
  const separe = sec.mode === "separe";
  if (separe) {
    for (const k of ["coffre", "table", "joueurs"]) {
      if (typeof sec[k] !== "string" || sec[k].trim() === "") err(`mode séparé : « securite.${k} » obligatoire`);
    }
    if (!prof.joueur_modele) err("mode séparé sans « joueur_modele »");
  }

  // ── tables (plusieurs tables sur le même monde) ──
  let tables = [{ id: "principale" }];
  if (prof.tables !== undefined) {
    if (!Array.isArray(prof.tables) || prof.tables.length === 0) {
      err("« tables » doit être une liste non vide");
    } else {
      tables = prof.tables;
      const vus = new Set();
      for (const t of tables) {
        if (!estObjet(t) || typeof t.id !== "string" || !RE_ID.test(t.id)) {
          err(`table sans identifiant valide : ${JSON.stringify(t)}`);
          continue;
        }
        if (vus.has(t.id)) err(`table « ${t.id} » en double`);
        vus.add(t.id);
      }
      if (!separe && tables.length > 1) {
        err("plusieurs tables exigent le mode « separe » (en mode unique, une seule table)");
      }
    }
  }

  // ── collections ──
  const cols = Array.isArray(prof.collections) ? prof.collections : [];
  if (!Array.isArray(prof.collections)) err("« collections » doit être une liste");
  const ids = cols.map((c) => c && c.id);
  const dejaVus = new Set();
  for (const id of ids) {
    if (dejaVus.has(id)) err(`collection « ${id} » en double`);
    dejaVus.add(id);
  }
  const zonesOk = separe ? ZONES_SEPARE : ZONES_UNIQUE;
  for (const c of cols) {
    const cid = (c && c.id) || "?";
    if (!estObjet(c) || typeof c.id !== "string" || !RE_ID.test(c.id)) {
      err(`collection sans identifiant valide : ${JSON.stringify(c && c.id)}`);
      continue;
    }
    if (!zonesOk.includes(c.zone)) {
      err(`${cid} : zone « ${c.zone} » incompatible avec le mode « ${sec.mode} » (permises : ${zonesOk.join(", ")})`);
    }
    if (c.portee !== undefined && !PORTEES.includes(c.portee)) {
      err(`${cid} : portée « ${c.portee} » inconnue (permises : ${PORTEES.join(", ")})`);
    }
    if (typeof c.dossier !== "string" || c.dossier.trim() === "") err(`${cid} : « dossier » obligatoire`);
    if (c.couleur !== undefined && !RE_COULEUR.test(String(c.couleur))) err(`${cid} : « couleur » doit s'écrire #rrggbb (reçu : ${JSON.stringify(c.couleur)})`);
    const champs = Array.isArray(c.champs) ? c.champs : [];
    const cles = champs.map((ch) => ch && ch.k);
    if (cles.includes("collection")) err(`${cid} : « collection » est une clé réservée`);
    if (new Set(cles).size !== cles.length) err(`${cid} : clés de champ en double`);
    if (separe && (c.zone === "mj" || c.zone === "table") && !cles.includes("visibilite")) {
      err(`${cid} : zone ${c.zone} sans champ « visibilite »`);
    }
    for (const ch of champs) {
      if (!estObjet(ch) || typeof ch.k !== "string") { err(`${cid} : champ sans clé`); continue; }
      const { genre, valeur } = analyserType(ch.t);
      const genres = [...TYPES_SIMPLES, "enum", "ref", "list"];
      if (!genres.includes(genre)) {
        err(`${cid}.${ch.k} : type inconnu « ${ch.t} »`);
      } else if (genre === "ref" && valeur !== "joueur" && !ids.includes(valeur)) {
        err(`${cid}.${ch.k} : ref vers une collection inconnue « ${valeur} »`);
      } else if (genre === "list") {
        const sous = analyserType(valeur);
        if (sous.genre === "ref" && sous.valeur !== "joueur" && !ids.includes(sous.valeur)) {
          err(`${cid}.${ch.k} : liste de ref vers une collection inconnue « ${sous.valeur} »`);
        } else if (![...TYPES_SIMPLES, "enum", "ref"].includes(sous.genre)) {
          err(`${cid}.${ch.k} : type de liste inconnu « ${valeur} »`);
        }
      } else if (genre === "enum" && valeur.split("|").filter(Boolean).length < 2) {
        err(`${cid}.${ch.k} : une énumération demande au moins deux valeurs`);
      }
    }
  }
  // chevauchement de dossiers (hors zone joueur : dossier relatif)
  const dos = cols
    .filter((c) => estObjet(c) && c.zone !== "joueur" && typeof c.dossier === "string")
    .map((c) => ({ d: c.dossier.replace(/^\/+|\/+$/g, ""), id: c.id }));
  for (let i = 0; i < dos.length; i++) {
    for (let j = i + 1; j < dos.length; j++) {
      if (dos[i].d === dos[j].d) err(`${dos[i].id} et ${dos[j].id} : même dossier « ${dos[i].d} »`);
    }
  }

  // ── dossiers frères : lecture pour la table, écriture dans le dossier de chaque joueur, jamais imbriqués ──
  // Constat de l'essai réel du 6 novembre 2026 : OneDrive ne permet pas de donner l'écriture sur un sous-dossier
  // d'un dossier déjà partagé en lecture au même compte. Le coffre, la table et les dossiers joueurs doivent donc
  // être trois dossiers distincts, chacun partageable sans toucher aux autres (décision D21 de la base).
  if (separe) {
    const noms = ["coffre", "table", "joueurs"].map((k) => [k, sec[k]]);
    const valides = noms.filter(([, v]) => typeof v === "string" && v.trim() !== "");
    for (const [k, v] of valides) {
      if (norm(v).includes("/")) err(`securite.${k} : « ${v} » doit être un nom de dossier à la racine du JDR, sans sous-dossier`);
    }
    for (let i = 0; i < valides.length; i++) {
      for (let j = i + 1; j < valides.length; j++) {
        if (norm(valides[i][1]) === norm(valides[j][1])) {
          err(`securite.${valides[i][0]} et securite.${valides[j][0]} : même dossier « ${valides[i][1]} »`);
        }
      }
    }
    const { coffre, table, joueurs } = sec;
    if (typeof joueurs === "string" && estObjet(prof.joueur_modele)) {
      const jm = prof.joueur_modele;
      if (typeof jm.dossier !== "string" || !jm.dossier.includes("{pseudo}") || !commencePar(jm.dossier, joueurs) || norm(jm.dossier) === norm(joueurs) || aRemontee(jm.dossier)) {
        err(`joueur_modele.dossier doit être de la forme « ${joueurs}/{pseudo} » (un dossier par joueur, directement sous « ${joueurs} »)`);
      }
      if (jm.miroir_mj !== undefined && jm.miroir_mj !== null && typeof coffre === "string" && (!commencePar(jm.miroir_mj, coffre) || aRemontee(jm.miroir_mj))) {
        err(`joueur_modele.miroir_mj doit être dans le coffre « ${coffre} » (le miroir du MJ ne se partage jamais avec les joueurs)`);
      }
    }
    for (const c of cols) {
      if (!estObjet(c) || typeof c.dossier !== "string") continue;
      const d = c.dossier;
      if (aRemontee(d)) err(`${c.id} : le dossier « ${d} » contient « .. » (remontée de dossier interdite)`);
      if (c.zone === "mj" && typeof coffre === "string" && !commencePar(d, coffre)) {
        err(`${c.id} : zone mj, le dossier « ${d} » doit être dans le coffre « ${coffre} »`);
      }
      if (c.zone === "table" && typeof table === "string" && !commencePar(d, table)) {
        err(`${c.id} : zone table, le dossier « ${d} » doit être dans « ${table} »`);
      }
      if (c.zone === "joueur") {
        const dedans = [coffre, table, joueurs].some((r) => typeof r === "string" && commencePar(d, r));
        if (dedans || d.startsWith("/")) {
          err(`${c.id} : zone joueur, le dossier « ${d} » doit être relatif au dossier du joueur (pas dans le coffre, la table ou « ${joueurs} »)`);
        }
      }
    }
  }

  // ── modules : choix par profil, public et rôles ──
  const mods = estObjet(prof.modules) ? prof.modules : {};
  if (prof.modules !== undefined && !estObjet(prof.modules)) err("« modules » doit être un objet");
  for (const [nom, cfg] of Object.entries(mods)) {
    const meta = MODULES[nom];
    if (!meta) { err(`module inconnu « ${nom} »`); continue; }
    if (!estObjet(cfg) || typeof cfg.actif !== "boolean") {
      err(`module ${nom} : « actif » (vrai/faux) obligatoire`);
      continue;
    }
    if (cfg.roles !== undefined) {
      if (!Array.isArray(cfg.roles) || cfg.roles.length === 0 || !cfg.roles.every((r) => ROLES.includes(r))) {
        err(`module ${nom} : « roles » doit être une liste non vide parmi ${ROLES.join(", ")}`);
        continue;
      }
      const horsModule = cfg.roles.filter((r) => !meta.roles.includes(r));
      if (horsModule.length) {
        err(`module ${nom} : rôle(s) ${horsModule.join(", ")} non prévu(s) par ce module (rôles possibles : ${meta.roles.join(", ")})`);
      }
    }
    if (!cfg.actif) continue;
    if (!convientAuPublic(nom, prof.public)) {
      const mjSeul = Array.isArray(cfg.roles) && cfg.roles.length === 1 && cfg.roles[0] === "mj";
      if (!mjSeul) {
        err(`module ${nom} : pensé pour le public « ${meta.public} », incompatible avec le profil « ${prof.public} » (réserver au MJ avec "roles": ["mj"] ou désactiver)`);
      } else {
        avert(`module ${nom} : pensé pour le public « ${meta.public} », utilisé ici par le MJ seul dans un profil « ${prof.public} »`);
      }
    }
  }
  // module recap : obligatoire dans tout profil (décision D18 de la base de conception).
  // Mêmes règles que le générateur de dossiers : compte rendu en zone mj ou unique, heures 0 à 23, minute 0 à 59.
  const rc = mods.recap;
  if (!estObjet(rc) || rc.actif !== true) {
    err("module recap : obligatoire et actif (l'automatisation « récap enregistré » existe dans tout JDR)");
  } else {
    const cid = rc.compte_rendu || ["session", "histoire"].find((c) => ids.includes(c));
    if (!cid || !ids.includes(cid)) {
      err("module recap : aucune collection de comptes rendus (ajouter une collection « session » ou « histoire », ou indiquer « compte_rendu »)");
    } else {
      const col = cols.find((c) => c && c.id === cid);
      if (col && !["mj", "unique"].includes(col.zone)) {
        err(`module recap : la collection « ${cid} » doit être en zone mj (ou unique), pas « ${col.zone} » : le compte rendu complet reste dans le coffre`);
      }
    }
    const h = rc.heures === undefined ? [6, 20, 21, 22, 23] : rc.heures;
    if (!(Array.isArray(h) && h.length > 0 && h.every((x) => Number.isInteger(x) && x >= 0 && x <= 23))) {
      err("module recap : « heures » doit être une liste d'heures entières (0 à 23)");
    }
    const m = rc.minute === undefined ? 41 : rc.minute;
    if (!(Number.isInteger(m) && m >= 0 && m <= 59)) err("module recap : « minute » doit être un entier de 0 à 59");
  }
  // ── application « conteur » : l'application pour enfant (le téléphone du parent sert de socle) ──
  if (prof.application !== undefined) {
    if (!APPLICATIONS.includes(prof.application)) err(`« application » doit valoir ${APPLICATIONS.join(" ou ")} (reçu : ${JSON.stringify(prof.application)})`);
    else if (prof.application === "joueur") {
      // application « joueur » (JDR adulte à secrets) : fiche d100, sac, savoirs, quêtes, journal, rencontres, notes, carte (D34 à D41)
      if (!prof.securite || prof.securite.mode !== "separe") err("application « joueur » : la sécurité doit être en mode « separe » (coffre MJ, table, dossier par joueur)");
      if (prof.public === "enfant") err("application « joueur » : réservée aux JDR adultes (public « adulte » ou « tous »)");
      const d = mods.d100;
      if (!estObjet(d) || d.actif !== true) err("application « joueur » : le module « d100 » doit être actif");
      else validerD100Joueur(d, err);
      const jm = estObjet(prof.joueur_modele) ? prof.joueur_modele : null;
      if (jm && Array.isArray(jm.dossiers)) {
        const vus = new Set();
        for (const dd of jm.dossiers) {
          if (!estObjet(dd) || typeof dd.id !== "string" || typeof dd.dossier !== "string") continue;
          if (vus.has(dd.id)) err(`application « joueur » : joueur_modele.dossiers : « ${dd.id} » en double`);
          vus.add(dd.id);
        }
      }
    }
    else if (prof.application === "conteur") {
      if (!prof.securite || prof.securite.mode !== "unique") err("application « conteur » : la sécurité doit être en mode « unique » (un seul dossier, le téléphone du parent sert de socle)");
      if (prof.public === "adulte") err("application « conteur » : réservée aux JDR pour enfant (public « enfant » ou « tous »)");
      for (const c of COLLECTIONS_CONTEUR) if (!ids.includes(c)) err(`application « conteur » : la collection « ${c} » est obligatoire`);
      for (const m of ["recap", "jouer"]) if (!estObjet(mods[m]) || mods[m].actif !== true) err(`application « conteur » : le module « ${m} » doit être actif`);
      if (prof.heros !== undefined && (!estObjet(prof.heros) || (prof.heros.dossier_journal !== undefined && typeof prof.heros.dossier_journal !== "string"))) err("« heros » doit être un objet (dossier_journal : texte)");
      const cat = estObjet(mods.objets) ? mods.objets.catalogue : undefined;
      if (cat !== undefined) {
        if (!Array.isArray(cat)) err("module objets : « catalogue » doit être une liste");
        else cat.forEach((o, i) => {
          if (!estObjet(o) || typeof o.id !== "string" || !RE_ID.test(o.id)) return err(`module objets : objet n° ${i + 1} : « id » obligatoire (minuscules, chiffres et _)`);
          if (typeof o.nom !== "string" || !o.nom.trim()) err(`module objets : « ${o.id} » : « nom » obligatoire`);
          if (typeof o.couleur !== "string" || !RE_COULEUR.test(o.couleur)) err(`module objets : « ${o.id} » : « couleur » doit être #rrggbb`);
          if (o.motif !== undefined) { try { new RegExp(o.motif, "i"); } catch { err(`module objets : « ${o.id} » : « motif » n'est pas une expression régulière valide`); } }
        });
      }
      const vo = estObjet(mods.voies) ? mods.voies : null;
      if (vo && vo.max_par_tache !== undefined && !(Number.isInteger(vo.max_par_tache) && vo.max_par_tache >= 1 && vo.max_par_tache <= 6)) err("module voies : « max_par_tache » doit être un entier de 1 à 6");
      const co = estObjet(mods.coeurs) ? mods.coeurs : null;
      if (co && co.depart !== undefined && !(Number.isInteger(co.depart) && co.depart >= 1 && co.depart <= 20)) err("module coeurs : « depart » doit être un entier de 1 à 20");
    }
  }
  // règle non définie : le moteur ne la devine jamais
  if (mods.d100 && mods.d100.actif && mods.d100.reussite === "A_PRECISER") {
    avert("module d100 : règle de réussite « A_PRECISER » (non définie) ; le moteur refusera de lancer un jet tant qu'elle n'est pas écrite");
  }

  return { erreurs, avertissements };
}
