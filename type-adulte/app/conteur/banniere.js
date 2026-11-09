// Bandeau « Hors connexion » : dit pourquoi, et propose de réessayer ou de se reconnecter.
import { h } from "./ui.js?v=0.16.1";

export function banniereHorsLigne(ctx, perime = true) {
  if (!perime) return null;
  const cause = navigator.onLine === false ? "Le téléphone n'a pas de réseau pour le moment." : "Le téléphone n'a pas pu joindre OneDrive.";
  const pourquoi = h("div", { class: "banner-why", style: "display:none" },
    h("p", null, cause),
    h("p", null, "Ce qui aide, dans l'ordre : (1) « Réessayer » ; (2) « Se reconnecter » (Microsoft redemande parfois la connexion) ; (3) fermer complètement l'application puis la rouvrir."),
    h("div", { class: "row", style: "gap:10px;flex-wrap:wrap" },
      h("button", { class: "btn small", onclick: () => location.reload() }, "Réessayer"),
      h("button", { class: "btn small", onclick: () => { Promise.resolve(ctx.auth.login()).catch(() => {}); } }, "Se reconnecter")));
  const bascule = h("button", { class: "linkbtn", "aria-expanded": "false", onclick: () => {
    const ouvert = pourquoi.style.display === "none";
    pourquoi.style.display = ouvert ? "" : "none"; bascule.setAttribute("aria-expanded", ouvert ? "true" : "false");
    bascule.textContent = ouvert ? "Masquer" : "Pourquoi ?";
  } }, "Pourquoi ?");
  return h("div", { class: "banner" }, h("div", null, "Hors connexion : dernière version enregistrée sur ce téléphone. ", bascule), pourquoi);
}
