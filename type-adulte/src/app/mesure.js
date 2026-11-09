// Mesure des chargements (D46, étage 0) : compte les requêtes et le temps par « segment » (démarrage, puis chaque changement d'écran).
// Aucun navigateur ici (tout se teste dans Node) ; aucune adresse, aucun identifiant n'est gardé : seulement des compteurs.

/** Sorte de requête d'après son adresse (Microsoft Graph ou connexion). */
export function genre(url) {
  const u = String(url);
  if (/\/special\/approot/.test(u)) return "memoire";
  if (/\/children(\?|$)/.test(u)) return "liste";
  if (/\/content(\?|$)/.test(u)) return "fichier";
  if (/login\.microsoftonline|\/oauth2\//.test(u)) return "connexion";
  if (/graph\.microsoft\.com/.test(u)) return "graph";
  return "autre";
}

/**
 * @param {object} o
 * @param {()=>number} o.maintenant   horloge en ms (performance.now)
 * @param {number} [o.calme=400]       durée sans requête en cours après laquelle un segment est terminé
 * @param {(seg:object)=>void} [o.surSegment]  appelé à chaque segment terminé
 */
export function creerMesure({ maintenant, calme = 400, surSegment = () => {}, planifier = setTimeout, annuler = clearTimeout } = {}) {
  const segments = [];
  let courant = null, enCours = 0, minuterie = null;
  const ouvrir = nom => { courant = { nom, debut: maintenant(), liste: 0, fichier: 0, memoire: 0, graph: 0, connexion: 0, autre: 0, echecs: 0, ms: 0 }; };
  const clore = () => {
    minuterie = null;
    if (!courant) return;
    courant.ms = Math.round(courant.dernier == null ? 0 : courant.dernier - courant.debut);
    delete courant.dernier;
    segments.push(courant); surSegment(courant); courant = null;
  };
  const armer = () => { if (minuterie) annuler(minuterie); minuterie = planifier(() => { if (enCours === 0) clore(); }, calme); };
  ouvrir("démarrage");
  return {
    segments,
    /** Nouveau segment (changement d'écran) : le précédent est terminé tel quel. */
    ecran(nom) { if (minuterie) { annuler(minuterie); minuterie = null; } if (courant) { courant.ms = Math.round((courant.dernier ?? courant.debut) - courant.debut); delete courant.dernier; segments.push(courant); surSegment(courant); } ouvrir(nom); armer(); },
    /** À appeler au début d'une requête ; renvoie la fonction à appeler à sa fin. */
    requete(url) {
      if (!courant) ouvrir("(hors écran)");
      const g = genre(url), seg = courant; seg[g]++; enCours++;
      if (minuterie) { annuler(minuterie); minuterie = null; }
      return ok => { enCours--; if (!ok) seg.echecs++; seg.dernier = maintenant(); armer(); };
    },
    total() { return segments.reduce((t, s) => ({ requetes: t.requetes + s.liste + s.fichier + s.memoire + s.graph + s.connexion + s.autre, ms: t.ms + s.ms }), { requetes: 0, ms: 0 }); }
  };
}

/** Enveloppe un `fetch` : chaque appel est compté dans `mesure`. */
export function mesurer(fetchOrigine, mesure) {
  return async (...a) => {
    const fin = mesure.requete(a[0] && a[0].url ? a[0].url : a[0]);
    try { const r = await fetchOrigine(...a); fin(r.ok || r.status === 404); return r; }
    catch (e) { fin(false); throw e; }
  };
}
