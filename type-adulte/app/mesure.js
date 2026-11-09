// Mode mesure (?perf=1) : petit bandeau qui dit combien de requêtes et combien de temps chaque écran a demandé. Rien n'est envoyé nulle part.
import { creerMesure, mesurer } from "../src/app/mesure.js?v=0.16.1";

export function demarrerMesure(fen) {
  const mesure = creerMesure({ maintenant: () => fen.performance.now(), surSegment: dessiner });
  fen.fetch = mesurer(fen.fetch.bind(fen), mesure);
  fen.__mesure = mesure;
  const boite = fen.document.createElement("div");
  boite.id = "mesure";
  boite.setAttribute("style", "position:fixed;left:0;right:0;bottom:0;z-index:99999;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.82);color:#9f9;padding:4px 8px;max-height:30vh;overflow:auto;pointer-events:none");
  fen.document.body.append(boite);
  function dessiner() {
    boite.textContent = "";
    for (const s of mesure.segments.slice(-6)) {
      const l = fen.document.createElement("div");
      l.textContent = `${s.nom} · ${s.ms} ms · ${s.liste} listes · ${s.fichier} fichiers · ${s.memoire + s.graph} autres Graph · ${s.connexion} connexion${s.echecs ? " · " + s.echecs + " échecs" : ""}`;
      boite.append(l);
    }
  }
  fen.addEventListener("hashchange", () => mesure.ecran(fen.location.hash || "#/"));
  return mesure;
}
