// Connexion Microsoft : logique reprise de Petite Feuille (éprouvée sur iPhone, Android et PC), avec MSAL INJECTÉ pour pouvoir
// la tester sans navigateur. Ne touche ni au DOM ni à localStorage directement : tout vient de `creerAuth(...)`.
//
// Règles (D15, D17) :
//  - portées Microsoft : `User.Read` et `Files.ReadWrite` seulement ; toute portée « .All » est refusée sauf `autoriserElargi` ;
//  - une erreur qui veut dire « se reconnecter » devient une erreur HTTP 401 (jamais servie par la copie locale) ;
//  - une erreur de réseau n'a PAS de code HTTP (le dépôt peut alors servir la copie locale) ;
//  - le jeton reste en mémoire (une seule demande à la fois) ; jamais affiché, jamais écrit ailleurs ;
//  - la déconnexion appelle `viderCopieLocale` AVANT de déconnecter (le branchement navigateur n'efface plus rien par défaut : D26).

export const SCOPES_BASE = Object.freeze(["User.Read", "Files.ReadWrite"]);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTORITE = /^https:\/\/login\.microsoftonline\.com\/(common|consumers|organizations|[0-9a-f-]{36})$/i;

export class ConfigAuthInvalide extends Error { constructor(m) { super(m); this.name = "ConfigAuthInvalide"; } }

/** Contrôle la configuration de connexion (publique : l'identifiant client n'est pas un secret). */
export function validerConfigAuth(c, { autoriserElargi = false } = {}) {
  if (!c || typeof c !== "object") throw new ConfigAuthInvalide("Configuration absente");
  if (!GUID.test(String(c.clientId || ""))) throw new ConfigAuthInvalide("clientId invalide");
  if (!AUTORITE.test(String(c.authority || ""))) throw new ConfigAuthInvalide("authority invalide (https://login.microsoftonline.com/…)");
  const scopes = c.scopes || [...SCOPES_BASE];
  if (!Array.isArray(scopes) || !scopes.length) throw new ConfigAuthInvalide("scopes invalides");
  for (const s of scopes) {
    if (!/^[A-Za-z][A-Za-z0-9.]*$/.test(String(s))) throw new ConfigAuthInvalide("portée invalide : " + s);
    if (/\.All$/i.test(s) && !autoriserElargi) throw new ConfigAuthInvalide("portée élargie refusée (D15) : " + s);
  }
  if (!scopes.includes("User.Read")) throw new ConfigAuthInvalide("User.Read manquante");
  const hashes = c.allowedHashes || [];
  if (!Array.isArray(hashes) || hashes.some(h => !/^[0-9a-f]{64}$/.test(String(h)))) throw new ConfigAuthInvalide("allowedHashes : empreintes SHA-256 attendues");
  return { clientId: c.clientId, authority: c.authority, scopes: [...scopes], allowedHashes: [...hashes] };
}

/** Empreinte d'un compte : SHA-256 de "pf1:" + adresse en minuscules (compatible avec les fichiers de configuration existants). */
export async function empreinteDe(adresse, subtle) {
  const data = new TextEncoder().encode("pf1:" + String(adresse || "").trim().toLowerCase());
  const buf = await subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const seReconnecter = e => !!e && (e.name === "InteractionRequiredAuthError"
  || /interaction_required|login_required|consent_required|invalid_grant|no_account|bad_token|refresh_token_expired|user_login_error/i
    .test(String(e.errorCode || e.subError || "") + " " + String(e.message || "")));

const erreurAuth = msg => { const e = new Error(msg); e.status = 401; e.auth = true; return e; };

/**
 * @param {object} o
 * @param {object} o.app          instance MSAL PublicClientApplication (déjà construite)
 * @param {object} o.config       configuration validée par `validerConfigAuth`
 * @param {object} o.subtle       crypto.subtle
 * @param {Function} [o.viderCopieLocale]  appelée AVANT la déconnexion (efface les copies locales de l'appareil)
 * @param {Function} [o.now]
 * @param {object} [o.memoire]    { lire(k), ecrire(k,v), retirer(k) } : dernier compte connu (adresse) sur cet appareil
 */
export function creerAuth({ app, config, subtle, viderCopieLocale = () => {}, now = Date.now, memoire = null, delaiRenouvellementMs = 20000 }) {
  if (!app || typeof app.acquireTokenSilent !== "function") throw new TypeError("MSAL requis");
  const scopes = [...config.scopes];
  let compte = null, jeton = null, enCours = null;

  const souvenir = { lire: k => { try { return memoire ? memoire.lire(k) : null; } catch { return null; } },
    ecrire: (k, v) => { try { memoire && memoire.ecrire(k, v); } catch { /* tant pis */ } },
    retirer: k => { try { memoire && memoire.retirer(k); } catch { /* rien */ } } };

  return {
    scopes: () => [...scopes],

    /** À appeler une fois au chargement de la page (retour de redirection compris). */
    async init() {
      await app.initialize();
      try { const r = await app.handleRedirectPromise(); if (r && r.account) compte = r.account; }
      catch (e) { compte = null; this.derniereErreur = String((e && (e.errorCode || e.name)) || "inconnue"); }
      compte = compte || app.getAllAccounts()[0] || null;
      if (compte) { app.setActiveAccount(compte); souvenir.ecrire("dernier_compte", compte.username); }
      return !!compte;
    },

    connecte: () => !!compte,
    /** Adresse du compte connecté : à n'afficher qu'à l'écran de la personne, jamais dans un rapport ni un journal. */
    adresse: () => (compte && compte.username) || "",
    async empreinte() { return empreinteDe(compte && compte.username, subtle); },
    /** Ce compte a-t-il le droit d'ouvrir l'application ? (contrôle d'affichage seulement ; la vraie protection est celle de OneDrive) */
    async autorise() { return config.allowedHashes.includes(await this.empreinte()); },

    async getToken() {
      if (!compte) throw erreurAuth("Pas connecté");
      if (jeton && jeton.exp - now() > 120000) return jeton.token;
      if (enCours) return enCours;
      enCours = (async () => {
        try {
          // Le renouvellement silencieux passe par une page cachée de Microsoft ; observé le 6 novembre dans Chrome : sans réponse pendant plus de 30 s,
          // et l'application restait sur « Chargement… ». Passé le délai, on demande de se reconnecter plutôt que d'attendre sans fin.
          let minuteur;
          const r = await Promise.race([
            app.acquireTokenSilent({ scopes, account: compte }),
            new Promise((_, rejet) => { minuteur = setTimeout(() => { const t = new Error("renouvellement trop long"); t.errorCode = "login_required"; rejet(t); }, delaiRenouvellementMs); })
          ]).finally(() => clearTimeout(minuteur));
          jeton = { token: r.accessToken, exp: r.expiresOn ? +new Date(r.expiresOn) : now() + 3000000 };
          return r.accessToken;
        } catch (e) {
          if (seReconnecter(e)) { jeton = null; throw erreurAuth("Reconnexion nécessaire"); }
          // réseau coupé : ce n'est PAS une déconnexion ; pas de code HTTP, le dépôt lira sa copie locale
          const err = new Error("Réseau indisponible"); err.detail = String((e && (e.errorCode || e.name)) || "inconnue"); throw err;
        } finally { enCours = null; }
      })();
      return enCours;
    },

    async login() {
      const dernier = souvenir.lire("dernier_compte");
      const req = { scopes: [...scopes] };
      if (dernier) req.loginHint = dernier; else req.prompt = "select_account";
      await app.loginRedirect(req);
    },

    /** Déconnexion LOCALE par défaut : jetons et compte mémorisé effacés, mais on ne passe pas par la page de déconnexion de Microsoft.
     *  Raison : sur iPhone (Safari), cette page a répondu plusieurs fois « AADSTS50061 : Unable to complete signout » (relevé du 6 novembre),
     *  alors que la même adresse fonctionne dans Chrome ; la cause n'est pas établie. À la reconnexion, `prompt: select_account` laisse
     *  choisir le compte. `serveur: true` rétablit la déconnexion complète côté Microsoft (la session Microsoft du navigateur est alors fermée). */
    async logout({ serveur = false } = {}) {
      const c = compte;
      jeton = null; compte = null;
      souvenir.retirer("dernier_compte");
      try { await viderCopieLocale(); }
      finally { if (c) await app.logoutRedirect(serveur ? { account: c } : { account: c, onRedirectNavigate: () => false }); }
    }
  };
}
