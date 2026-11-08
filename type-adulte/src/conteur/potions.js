// Potions de vie pendant la partie : une potion se boit en deux fois. Un appui = une moitié, deux appuis = la potion entière.
// Une potion bue entièrement n'existe plus. Le catalogue vient du profil (modules.potions) ; par défaut, la potion de vie 1 + 1.
export const POTIONS_PAR_DEFAUT = { vie: { nom: "Potion de vie", moitie: 1, entiere: 2 } };

const instantane = s => JSON.stringify({ potions: s.potions || [], bus: s.bus || [], coeurs: s.coeurs, ajoutees: s.ajoutees || [] });

/** Nombre maximum de cœurs pendant cette partie (celui de départ, sauf si le MJ en a ajouté à la main). */
export const coeursMax = s => Math.max(s.coeursMax != null ? s.coeursMax : (s.coeurs0 != null ? s.coeurs0 : s.coeurs), s.coeurs);

export function ajouterPotion(s, type = "vie", catalogue = POTIONS_PAR_DEFAUT) {
  const t = catalogue[type]; if (!t) return null;
  s.undo = instantane(s);
  s.potions = s.potions || []; s.ajoutees = s.ajoutees || [];
  const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, nom: t.nom, moitie: t.moitie, entiere: t.entiere, reste: 2 };
  s.potions.push(p); s.ajoutees.push({ id: p.id, nom: t.nom });
  return p;
}

/** Boit une moitié de la potion. → { ok, gain, fini, raison }. Ne consomme rien si les cœurs sont déjà pleins. */
export function boire(s, id) {
  const p = (s.potions || []).find(x => x.id === id);
  if (!p) return { ok: false, raison: "introuvable" };
  const max = coeursMax(s);
  if (s.coeurs >= max) return { ok: false, raison: "pleins", gain: 0 };
  s.undo = instantane(s);
  const part = p.reste === 2 ? p.moitie : p.entiere - p.moitie;
  const gain = Math.min(part, max - s.coeurs);
  s.coeurs += gain;
  p.reste -= 1;
  s.bus = s.bus || [];
  let b = s.bus.find(x => x.id === p.id);
  if (!b) { b = { id: p.id, nom: p.nom, gains: [], fini: false }; s.bus.push(b); }
  b.gains.push(gain);
  const fini = p.reste <= 0;
  if (fini) { b.fini = true; s.potions = s.potions.filter(x => x.id !== p.id); }
  return { ok: true, gain, fini };
}

export const peutAnnuler = s => !!s.undo;
export function annuler(s) {
  if (!s.undo) return false;
  const o = JSON.parse(s.undo);
  s.potions = o.potions; s.bus = o.bus; s.coeurs = o.coeurs; s.ajoutees = o.ajoutees;
  delete s.undo;
  return true;
}

const cw = n => `${n} cœur${n > 1 ? "s" : ""}`;

/** Texte pour le récap, champ « Potions ou soins » (une ligne par potion bue). */
export function texteSoins(s) {
  return (s.bus || []).map(b => {
    const tot = b.gains.reduce((a, x) => a + x, 0);
    return b.fini ? `${b.nom} bue en entier (+${cw(tot)})` : `${b.nom} bue à moitié (+${cw(tot)}), il en reste la moitié`;
  }).join("\n");
}
/** Potions reçues pendant la partie (« Objets gagnés ») et potions finies (« Objets perdus ou utilisés »). */
export const texteGagnees = s => (s.ajoutees || []).map(p => p.nom).join("\n");
export const texteUtilisees = s => (s.bus || []).filter(b => b.fini).map(b => `${b.nom} (bue)`).join("\n");
