// Recherche locale (D39) : index construit sur les copies DÉJÀ lues, aucun appel au serveur. Insensible à la casse et aux accents. Logique pure.
import { norm } from "../md/doc.js?v=0.18.1";

/** Texte de recherche : minuscules, sans accents ni ligature, ponctuation → espaces (garde les espaces entre les mots). */
export const aplatir = s => String(s ?? "").toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, " ").trim();

/** Types affichés dans la recherche globale, dans l'ordre. */
export const TYPES = Object.freeze([
  ["savoirs", "Savoirs"], ["quetes", "Quêtes"], ["journal", "Journal"], ["rencontres", "Rencontres"], ["notes", "Notes"], ["sac", "Sac"]
]);

/** Entrée d'index : { type, id, titre, texte, session, lieu, personnage, etiquettes } ; `titre` et `texte` sont aplatis une fois pour toutes. */
export function entreeIndex(type, e, { etiquettes = [], texte = null } = {}) {
  const brut = texte ?? e.corps ?? "";
  return {
    type, id: e.fichier, titre: e.titre, texte: brut, session: e.session ?? null, lieu: e.lieu || "", personnage: e.personnage || "",
    etiquettes: [...new Set([...(e.etiquettes || []), ...etiquettes])],
    _t: aplatir(e.titre), _x: aplatir(brut), _e: aplatir([...(e.etiquettes || []), ...etiquettes].join(" ")), _l: aplatir(e.lieu), _p: aplatir(e.personnage)
  };
}

const mots = q => aplatir(q).split(" ").filter(Boolean);

/**
 * Cherche dans l'index. Tous les mots de la requête doivent se trouver (dans le titre, le texte, les étiquettes, le lieu ou le personnage).
 * Filtres : `types` (liste), `sessions` (liste de numéros), `etiquette`, `lieu`, `personnage` (texte exact à la casse et aux accents près).
 * Une requête vide ne renvoie que les entrées qui passent les filtres. Tri : titre contenant la requête d'abord, puis session récente, puis titre.
 */
export function chercher(index, requete = "", { types = null, sessions = null, etiquette = "", lieu = "", personnage = "" } = {}) {
  const ms = mots(requete);
  const T = types && types.length ? new Set(types) : null;
  const S = sessions && sessions.length ? new Set(sessions) : null;
  const et = aplatir(etiquette), li = aplatir(lieu), pe = aplatir(personnage);
  const res = [];
  for (const e of index) {
    if (T && !T.has(e.type)) continue;
    if (S && (e.session == null || !S.has(e.session))) continue;
    if (et && !e._e.includes(et)) continue;
    if (li && e._l !== li) continue;
    if (pe && e._p !== pe) continue;
    let score = 0, ok = true;
    for (const m of ms) {
      const dansTitre = e._t.includes(m);
      if (dansTitre) score += 3;
      else if (e._x.includes(m) || e._e.includes(m) || e._l.includes(m) || e._p.includes(m)) score += 1;
      else { ok = false; break; }
    }
    if (ok) res.push({ ...e, score });
  }
  return res.sort((a, b) => b.score - a.score || (b.session ?? -1) - (a.session ?? -1) || a.titre.localeCompare(b.titre, "fr"));
}

/** Résultats groupés par type, dans l'ordre de `TYPES`, types sans résultat omis. */
export function grouperParType(resultats) {
  return TYPES.map(([id, libelle]) => ({ id, libelle, resultats: resultats.filter(r => r.type === id) })).filter(g => g.resultats.length);
}

/** Valeurs distinctes à proposer dans les filtres (sessions décroissantes, lieux, personnages, étiquettes). */
export function valeursDeFiltres(index, types = null) {
  const T = types && types.length ? new Set(types) : null;
  const ens = { sessions: new Set(), lieux: new Set(), personnages: new Set(), etiquettes: new Set() };
  for (const e of index) {
    if (T && !T.has(e.type)) continue;
    if (e.session != null) ens.sessions.add(e.session);
    if (e.lieu) ens.lieux.add(e.lieu);
    if (e.personnage) ens.personnages.add(e.personnage);
    for (const x of e.etiquettes) ens.etiquettes.add(x);
  }
  const az = s => [...s].sort((a, b) => a.localeCompare(b, "fr"));
  return { sessions: [...ens.sessions].sort((a, b) => b - a), lieux: az(ens.lieux), personnages: az(ens.personnages), etiquettes: az(ens.etiquettes) };
}

/**
 * Découpe un texte pour surligner les mots cherchés (sans HTML) : [{texte, surligne}]. La comparaison ignore casse et accents.
 * Limite connue : une ligature (« œ ») est trouvée par `chercher` (œ = oe) mais n'est pas surlignée.
 */
export function surligner(texte, requete) {
  const ms = mots(requete);
  const s = String(texte ?? "");
  if (!ms.length || !s) return [{ texte: s, surligne: false }];
  // aplatir() peut changer la longueur (ligature, accents décomposés) : on compare lettre par lettre sur une version de même longueur
  const plat = [...s].map(c => { const a = c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); return a.length === 1 ? a : c.toLowerCase(); }).join("");
  const flags = new Array(s.length).fill(false);
  for (const m of ms) { let i = 0; while ((i = plat.indexOf(m, i)) !== -1) { for (let k = i; k < i + m.length; k++) flags[k] = true; i += m.length; } }
  const sortie = [];
  let debut = 0;
  for (let i = 1; i <= s.length; i++) if (i === s.length || flags[i] !== flags[debut]) { sortie.push({ texte: s.slice(debut, i), surligne: flags[debut] }); debut = i; }
  return sortie;
}
