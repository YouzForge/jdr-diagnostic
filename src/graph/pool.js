/** Exécute fn sur chaque élément, `n` à la fois ; les résultats gardent l'ordre d'entrée. */
export async function pool(items, fn, n = 4) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
