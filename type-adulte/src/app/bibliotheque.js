// Charger une collection POUR L'AFFICHAGE : fiches lues, filtrées selon le rôle, prêtes à montrer.
import { chargerCollection } from "../collections/charger.js?v=0.18.0";
import { preparerFiche } from "./affichage.js?v=0.18.0";

/** → { fiches (prêtes à afficher), perime (copie locale servie), illisibles, absent } */
export async function bibliotheque({ session, profil, col, pseudo }) {
  if (!session.depot) throw new Error("Session non prête");
  const r = await chargerCollection({ depot: session.depot, profil, role: session.role, col, pseudo: session.role === "mj" ? pseudo : undefined });
  const fiches = r.fiches.map(f => preparerFiche(profil, session.role, col, f)).filter(Boolean);
  return { fiches, perime: r.perime, illisibles: r.illisibles, absent: r.absent };
}

/** Pseudos des joueurs, vus du MJ (dossiers de « Joueurs/ »). */
export async function listerJoueurs({ session, profil }) {
  if (session.role !== "mj") return [];
  const r = await session.depot.lister(profil.securite.joueurs);
  return r.donnees.filter(x => x.dir).map(x => x.name).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
}
