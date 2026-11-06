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
  // règle non définie : le moteur ne la devine jamais
  if (mods.d100 && mods.d100.actif && mods.d100.reussite === "A_PRECISER") {
    avert("module d100 : règle de réussite « A_PRECISER » (non définie) ; le moteur refusera de lancer un jet tant qu'elle n'est pas écrite");
  }

  return { erreurs, avertissements };
}
