// Copie locale des images (portraits, vignettes, cartes) dans « Cache Storage » du navigateur : une copie par COMPTE (jamais partagée entre comptes),
// effacée quand l'accès est retiré. Aucune requête réseau ne passe par ici : les adresses sont fictives, seules les données comptent.
const PREFIXE = "jdr1-img-";
const MAX_IMAGES = 150;                       // au-delà, les plus anciennes sont retirées
const adresse = cle => new Request("/__jdr_img__/" + encodeURIComponent(cle));

/** `empreinte` : promesse du SHA-256 du compte (jamais l'adresse e-mail). Renvoie null si le navigateur n'a pas Cache Storage. */
export function creerStockageImages(fen, empreinte) {
  if (!fen.caches || typeof fen.caches.open !== "function") return null;
  const nom = empreinte.then(e => PREFIXE + String(e).slice(0, 16));
  const ouvrir = async () => fen.caches.open(await nom);
  return {
    async lire(cle) {
      const r = await (await ouvrir()).match(adresse(cle));
      return r ? { blob: await r.blob(), sig: r.headers.get("X-Sig") || "" } : null;
    },
    async ecrire(cle, blob, sig) {
      const c = await ouvrir();
      await c.put(adresse(cle), new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream", "X-Sig": sig || "" } }));
      const cles = await c.keys();
      for (const k of cles.slice(0, Math.max(0, cles.length - MAX_IMAGES))) await c.delete(k);
    },
    async retirer(cle) { await (await ouvrir()).delete(adresse(cle)); },
    async vider() { await fen.caches.delete(await nom); }
  };
}
/** Efface les copies d'images de ce compte (accès retiré constaté au démarrage). */
export async function purgerImages(fen, empreinte) {
  if (fen.caches && typeof fen.caches.delete === "function") await fen.caches.delete(PREFIXE + String(await empreinte).slice(0, 16));
}
