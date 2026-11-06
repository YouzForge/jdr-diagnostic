// Copie locale pour la lecture hors connexion. Les entrées sont rangées PAR COMPTE (empreinte) : un autre compte
// qui se connecte sur le même appareil ne voit jamais les données du précédent (T7), et `viderTout()` (effacement complet) n'est plus appelé à la déconnexion par défaut (D26 : un appareil n'est pas partagé).

/** Stockage en mémoire (tests) ou adaptateur autour de localStorage (navigateur). */
export function creerStockageMemoire() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] };
}
export function creerStockageNavigateur(ls) {
  return { getItem: k => ls.getItem(k), setItem: (k, v) => ls.setItem(k, v), removeItem: k => ls.removeItem(k),
    keys: () => { const out = []; for (let i = 0; i < ls.length; i++) out.push(ls.key(i)); return out; } };
}

const PREFIXE = "jdr1:";

/** @param {object} stockage  { getItem, setItem, removeItem, keys } ; @param {string} empreinteCompte  SHA-256 du compte (jamais l'adresse) */
export function creerCache(stockage, empreinteCompte) {
  if (!/^[0-9a-f]{16,}$/.test(String(empreinteCompte))) throw new Error("Empreinte de compte invalide");
  const p = PREFIXE + empreinteCompte.slice(0, 16) + ":";
  return {
    lire(k) { try { const v = stockage.getItem(p + k); return v == null ? null : JSON.parse(v); } catch { return null; } },
    ecrire(k, v) { try { stockage.setItem(p + k, JSON.stringify(v)); } catch { /* stockage plein : tant pis */ } },
    retirer(k) { try { stockage.removeItem(p + k); } catch { /* rien */ } },
    retirerPrefixe(pre) { for (const k of stockage.keys()) if (k.startsWith(p + pre)) stockage.removeItem(k); },
    /** Efface TOUTES les copies de cette application sur l'appareil, tous comptes confondus (déconnexion). */
    viderTout() { for (const k of stockage.keys()) if (k.startsWith(PREFIXE)) stockage.removeItem(k); }
  };
}
