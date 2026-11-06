// Branchement de `creerAuth` sur le vrai navigateur (MSAL.js chargé par la page, localStorage, cookies).
// Seule partie de la connexion qui ne se teste pas sans navigateur : elle reste volontairement courte.
import { creerAuth, validerConfigAuth } from "./auth.js";
import { creerCache, creerStockageNavigateur } from "../depot/cache.js";

/* POURQUOI TANT DE RECONNEXIONS SUR iPHONE (relevé sur Petite Feuille) : MSAL range sa clé de chiffrement dans un cookie « de session »
   qui disparaît quand l'application est fermée ; les jetons deviennent illisibles. On donne à ce cookie une vraie durée (30 jours) :
   le jeton Microsoft, lui, reste limité à 24 h, ce qui donne une seule reconnexion par jour. */
export function garderCleDeChiffrement(doc) {
  try {
    const c = doc.cookie.split("; ").find(x => x.startsWith("msal.cache.encryption="));
    if (!c) return;
    doc.cookie = `${c}; path=/; SameSite=None; Secure; expires=${new Date(Date.now() + 30 * 864e5).toUTCString()}`;
  } catch { /* tant pis : on se reconnectera */ }
}

/** @param {object} fen  la fenêtre du navigateur (window) ; `fen.msal` doit être chargé ; @param {object} configBrute  configuration publique
 *  Décision D26 : un appareil n'est pas partagé (chacun a le sien). La déconnexion n'efface donc PAS les données de l'appareil (copies de fiches,
 *  dossiers mémorisés) : on les retrouve à la reconnexion. Elles restent rangées par compte. `effacerALaDeconnexion: true` rétablit l'effacement complet. */
export async function creerAuthNavigateur(fen, configBrute, { autoriserElargi = false, effacerALaDeconnexion = false } = {}) {
  const config = validerConfigAuth(configBrute, { autoriserElargi });
  if (!fen.msal || !fen.msal.PublicClientApplication) throw new Error("MSAL n'est pas chargé");
  const redirectUri = fen.location.origin + fen.location.pathname.replace(/index\.html$/, "");
  const app = new fen.msal.PublicClientApplication({
    auth: { clientId: config.clientId, authority: config.authority, redirectUri, postLogoutRedirectUri: redirectUri, navigateToLoginRequestUrl: false },
    cache: { cacheLocation: "localStorage" }
  });
  const ls = fen.localStorage;
  const memoire = { lire: k => ls.getItem("jdr1_" + k), ecrire: (k, v) => ls.setItem("jdr1_" + k, v), retirer: k => ls.removeItem("jdr1_" + k) };
  const auth = creerAuth({
    app, config, subtle: fen.crypto.subtle, memoire,
    viderCopieLocale: async () => { if (effacerALaDeconnexion) creerCache(creerStockageNavigateur(ls), "0".repeat(64)).viderTout(); }
  });
  garderCleDeChiffrement(fen.document);
  const initial = auth.init.bind(auth);
  auth.init = async () => { const r = await initial(); garderCleDeChiffrement(fen.document); return r; };
  fen.document.addEventListener("visibilitychange", () => { if (!fen.document.hidden) garderCleDeChiffrement(fen.document); });
  return { auth, config, redirectUri };
}
