// Page de diagnostic d'étanchéité : connexion Microsoft, deux liens, rapport. Toute la logique est dans `src/` (testée) ; ici, seulement l'affichage.
import { creerAuthNavigateur, creerClientGraph, chargerProfil, lancerDiagnostic } from "../src/index.js";

const $ = id => document.getElementById(id);
const ICONES = { ok: "✅", echec: "❌", non_verifie: "❔" };
let auth = null, profil = null;

function afficher(r) {
  $("verdict").textContent = r.ok ? "✅ Tout est conforme" : r.etapes.some(e => e.etat === "echec") ? "❌ Échec : à signaler au MJ" : "❔ Diagnostic incomplet : à refaire";
  const bloc = $("etapes"); bloc.textContent = "";
  for (const e of r.etapes) {
    const d = document.createElement("div"); d.className = "etape";
    const ic = document.createElement("div"); ic.className = "ic " + e.etat; ic.textContent = ICONES[e.etat];
    const t = document.createElement("div"); const b = document.createElement("b"); b.textContent = e.titre;
    const s = document.createElement("small"); s.textContent = e.detail; t.append(b, s); d.append(ic, t); bloc.append(d);
  }
  $("rapport").textContent = r.rapport; $("zoneRapport").hidden = false;
}

async function charger() {
  for (const u of ["./profil.json", "../profils_test/profil_TEST_adulte_secrets.json"]) {
    try { const r = await fetch(u); if (r.ok) return chargerProfil(await r.json()).profil; } catch { /* essai suivant */ }
  }
  throw new Error("Profil de jeu introuvable");
}

function majBoutons() {
  const co = auth && auth.connecte();
  $("btnConnexion").hidden = !!co; $("btnDeconnexion").hidden = !co;
  $("btnConnexion").disabled = !auth;
  $("btnLancer").disabled = !co || !profil;
}

async function lancer() {
  const liens = [$("lien1").value.trim(), $("lien2").value.trim()].filter(Boolean);
  $("verdict").textContent = "Diagnostic en cours…"; $("etapes").textContent = ""; $("zoneRapport").hidden = true; $("btnLancer").disabled = true;
  try {
    const client = creerClientGraph({ fetch: (...a) => window.fetch(...a), getToken: () => auth.getToken() });
    afficher(await lancerDiagnostic({ client, profil, liens }));
  } catch (e) {
    $("verdict").textContent = e && (e.status === 401 || e.auth) ? "🔒 Reconnexion nécessaire : clique sur « Se connecter »." : "Erreur inattendue : " + (e && e.message ? e.message : "inconnue");
  } finally { majBoutons(); }
}

async function demarrer() {
  try {
    profil = await charger();
    ({ auth } = await creerAuthNavigateur(window, window.JDR_DIAG));
    await auth.init();
    $("etatConnexion").textContent = auth.connecte() ? "Connecté ✅" : "Non connecté.";
  } catch (e) { $("etatConnexion").textContent = "Impossible de démarrer : " + (e && e.message ? e.message : "erreur"); }
  majBoutons();
  $("btnConnexion").onclick = () => auth.login();
  $("btnDeconnexion").onclick = () => auth.logout();
  $("btnLancer").onclick = lancer;
  $("btnCopier").onclick = async () => { try { await navigator.clipboard.writeText($("rapport").textContent); $("copie").textContent = "Copié."; } catch { $("copie").textContent = "Copie impossible : sélectionne le texte à la main."; } };
}
demarrer();
