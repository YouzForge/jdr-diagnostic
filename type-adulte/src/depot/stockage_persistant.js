// Stockage persistant de la copie locale (D46). Pourquoi pas localStorage : limité à environ 5 Mo (un JDR de plusieurs centaines de pages le remplit, et
// l'écriture échoue alors en silence), lu et écrit de façon synchrone. Ici : un magasin IndexedDB (plusieurs centaines de Mo possibles) derrière la MÊME
// interface synchrone que localStorage — { getItem, setItem, removeItem, keys } — pour que le cache, le dépôt et les tests ne changent pas :
// tout est chargé en mémoire au démarrage, les écritures sont regroupées et envoyées au magasin un instant plus tard.

const PREFIXE = "jdr1:";

/**
 * @param {object} o
 * @param {object} o.magasin  { tout(): Promise<[clé, valeur][]>, lot(ops): Promise<void> } ; `ops` = [[clé, valeur]] ; valeur `undefined` = retrait
 * @param {object} [o.ls]     localStorage : les anciennes copies (« jdr1:… ») y sont reprises une fois, puis retirées une fois qu'elles sont bien enregistrées
 * @param {number} [o.delai]  regroupement des écritures, en ms
 * @param {Function} [o.planifier]  setTimeout (injectable pour les tests)
 */
export async function creerStockagePersistant({ magasin, ls = null, delai = 40, planifier = setTimeout }) {
  const m = new Map();
  for (const [k, v] of await magasin.tout()) if (typeof v === "string") m.set(k, v);
  const attente = new Map();      // clé → valeur à écrire (undefined = retirer)
  let minuteur = null, chaine = Promise.resolve();

  function envoyer() {
    minuteur = null;
    const ops = [...attente]; attente.clear();
    if (!ops.length) return chaine;
    chaine = chaine.then(() => magasin.lot(ops)).catch(() => { /* copie locale : une écriture perdue n'est pas grave */ });
    return chaine;
  }
  const programmer = () => { if (minuteur === null) minuteur = planifier(envoyer, delai); };

  const stockage = {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { v = String(v); m.set(k, v); attente.set(k, v); programmer(); },
    removeItem: k => { if (m.delete(k)) { attente.set(k, undefined); programmer(); } },
    keys: () => [...m.keys()],
    /** Envoie tout de suite ce qui attend (fermeture de la page, tests). */
    vider: () => envoyer()
  };

  if (ls) {   // reprise des anciennes copies de localStorage
    const anciennes = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(PREFIXE)) anciennes.push(k); }
    const aReprendre = anciennes.filter(k => !m.has(k));
    for (const k of aReprendre) m.set(k, ls.getItem(k));
    if (anciennes.length) {
      try { if (aReprendre.length) await magasin.lot(aReprendre.map(k => [k, m.get(k)])); for (const k of anciennes) ls.removeItem(k); }
      catch { /* enregistrement refusé : localStorage garde ses copies, rien n'est perdu */ }
    }
  }
  return stockage;
}

/** Le magasin IndexedDB du navigateur. `idb` = window.indexedDB. */
export function ouvrirMagasinIndexedDB(idb, nom = "jdr-copie-locale") {
  const base = new Promise((ok, ko) => {
    const r = idb.open(nom, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("kv"); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error || new Error("IndexedDB indisponible"));
    r.onblocked = () => ko(new Error("IndexedDB bloquée"));
  });
  return {
    async tout() {
      const db = await base;
      return new Promise((ok, ko) => {
        const sortie = [], c = db.transaction("kv", "readonly").objectStore("kv").openCursor();
        c.onsuccess = () => { const cur = c.result; if (cur) { sortie.push([cur.key, cur.value]); cur.continue(); } else ok(sortie); };
        c.onerror = () => ko(c.error);
      });
    },
    async lot(ops) {
      const db = await base;
      return new Promise((ok, ko) => {
        const t = db.transaction("kv", "readwrite"), s = t.objectStore("kv");
        for (const [k, v] of ops) { if (v === undefined) s.delete(k); else s.put(v, k); }
        t.oncomplete = () => ok(); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error || new Error("écriture annulée"));
      });
    }
  };
}
