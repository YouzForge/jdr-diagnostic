// Icônes de l'interface (tracés SVG 24x24 en traits), reprises du kit de « Petite Feuille » et complétées (gem, flag, calendar, scroll, skull).
// Elles sont des DONNÉES (balise + attributs) : l'interface les construit avec createElementNS, jamais avec innerHTML.
export const ICONES = {
 "chat": [["path",{"d":"M4 5h16v11h-9l-4 4v-4H4z"}],["path",{"d":"M8 9.5h8M8 12.5h5"}]],
 "fist": [["path",{"d":"M7 11V7.5a1.5 1.5 0 0 1 3 0V10M10 10V6.5a1.5 1.5 0 0 1 3 0V10M13 10V7.5a1.5 1.5 0 0 1 3 0V12"}],["path",{"d":"M7 11a1.5 1.5 0 0 0-3 0v2a7 7 0 0 0 7 7h2a5 5 0 0 0 5-5v-3a1.5 1.5 0 0 0-3 0"}]],
 "key": [["circle",{"cx":"8","cy":"12","r":"3.5"}],["path",{"d":"M11.5 12H21M17 12v3.5M20 12v2.5"}]],
 "detour": [["path",{"d":"M5 20v-5a4 4 0 0 1 4-4h8"}],["path",{"d":"M13 6l4 5-4 5"}]],
 "purse": [["path",{"d":"M8.6 3.2l1.1 3M15.4 3.2l-1.1 3M8.6 3.2c2 1.2 4.8 1.2 6.8 0"}],["path",{"d":"M9.7 6.2C6.2 8.5 4.2 11.5 4.2 15a5.2 5.2 0 0 0 5.2 5.2h5.2a5.2 5.2 0 0 0 5.2-5.2c0-3.5-2-6.5-5.5-8.8"}],["path",{"d":"M9.1 7.6c1.8.8 4 .8 5.8 0"}],["circle",{"cx":"12","cy":"15","r":"2.4"}]],
 "coin": [["circle",{"cx":"12","cy":"12","r":"8.5"}],["path",{"d":"M12 17v-7"}],["path",{"d":"M12 13.5c-2.6 0-3.8-1.6-3.8-3.6 2.6 0 3.8 1.5 3.8 3.6zM12 12c2-.2 3.4-1.2 3.6-3.2-2 .1-3.4 1.2-3.6 3.2z"}]],
 "bag": [["path",{"d":"M6 8h12l1 12H5z"}],["path",{"d":"M9 8V6a3 3 0 0 1 6 0v2"}]],
 "book": [["path",{"d":"M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5z"}],["path",{"d":"M20 5.5C20 4.7 19.3 4 18.5 4H13v15h5.5c.8 0 1.5-.7 1.5-1.5z"}]],
 "sword": [["path",{"d":"M20 4L10 14"}],["path",{"d":"M7 13l4 4"}],["path",{"d":"M7 17l-3 3"}]],
 "helmet": [["path",{"d":"M5 16a7 7 0 0 1 14 0v2H5z"}],["path",{"d":"M12 9v4"}]],
 "potion": [["path",{"d":"M10 3h4"}],["path",{"d":"M11 3v5l-4.5 8A3 3 0 0 0 9 20h6a3 3 0 0 0 2.5-4L13 8V3"}],["path",{"d":"M8.5 14h7"}]],
 "pin": [["path",{"d":"M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10z"}],["circle",{"cx":"12","cy":"11","r":"2.2"}]],
 "monster": [["path",{"d":"M5 12a7 7 0 0 1 14 0v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"}],["path",{"d":"M7 6L5 3M17 6l2-3"}],["circle",{"cx":"9.5","cy":"12","r":"1"}],["circle",{"cx":"14.5","cy":"12","r":"1"}],["path",{"d":"M9 16h6"}]],
 "friends": [["circle",{"cx":"9","cy":"8","r":"3"}],["path",{"d":"M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"}],["circle",{"cx":"17","cy":"9","r":"2.4"}],["path",{"d":"M16 14.2c2.8-.3 5 1.4 5 4.3"}]],
 "speaker": [["path",{"d":"M4 9.5h3.5L12 6v12l-4.5-3.5H4z"}],["path",{"d":"M15.5 9a4 4 0 0 1 0 6"}]],
 "mic": [["rect",{"x":"9","y":"3","width":"6","height":"11","rx":"3"}],["path",{"d":"M5 11a7 7 0 0 0 14 0M12 18v3"}]],
 "back": [["path",{"d":"M14 6l-6 6 6 6"}]],
 "next": [["path",{"d":"M10 6l6 6-6 6"}]],
 "plus": [["path",{"d":"M6 12h12M12 6v12"}]],
 "minus": [["path",{"d":"M6 12h12"}]],
 "lock": [["rect",{"x":"5","y":"11","width":"14","height":"9","rx":"2"}],["path",{"d":"M8 11V8a4 4 0 0 1 8 0v3"}]],
 "camera": [["path",{"d":"M4 8h3l1.5-2h7L17 8h3v11H4z"}],["circle",{"cx":"12","cy":"13","r":"3.5"}]],
 "note": [["path",{"d":"M5 4h10l4 4v12H5z"}],["path",{"d":"M8 12h8M8 16h5"}]],
 "bulb": [["path",{"d":"M9 18h6M10 21h4"}],["path",{"d":"M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"}]],
 "heart": [["path",{"d":"M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"}]],
 "shield": [["path",{"d":"M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"}]],
 "dice": [["rect",{"x":"4","y":"4","width":"16","height":"16","rx":"3"}],["circle",{"cx":"9","cy":"9","r":"1"}],["circle",{"cx":"15","cy":"15","r":"1"}],["circle",{"cx":"12","cy":"12","r":"1"}]],
 "star": [["path",{"d":"M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z"}]],
 "trash": [["path",{"d":"M5 7h14"}],["path",{"d":"M9 7V5h6v2"}],["path",{"d":"M7 7l1 13h8l1-13"}],["path",{"d":"M10 11v6M14 11v6"}]],
 "check": [["path",{"d":"M5 12.5l4.5 4.5L19 7.5"}]],
 "question": [["path",{"d":"M9 9a3 3 0 1 1 4.5 2.6c-.9.6-1.5 1.1-1.5 2.4"}],["path",{"d":"M12 17.5v.5"}]],
 "moon": [["path",{"d":"M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"}]],
 "search": [["circle",{"cx":"11","cy":"11","r":"6"}],["path",{"d":"M16 16l4 4"}]],
 "tools": [["path",{"d":"M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-2.6-.6-.6-2.6z"}]],
 "map": [["path",{"d":"M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"}],["path",{"d":"M9 4v14M15 6v14"}]],
 "paw": [["circle",{"cx":"8","cy":"9","r":"1.8"}],["circle",{"cx":"16","cy":"9","r":"1.8"}],["circle",{"cx":"5","cy":"13.5","r":"1.6"}],["circle",{"cx":"19","cy":"13.5","r":"1.6"}],["path",{"d":"M12 12c-3 0-5 3-5 5 0 1.6 1.3 2.5 2.7 2.5 1 0 1.5-.4 2.3-.4s1.3.4 2.3.4c1.4 0 2.7-.9 2.7-2.5 0-2-2-5-5-5z"}]],
 "image": [["rect",{"x":"3","y":"5","width":"18","height":"14","rx":"3"}],["circle",{"cx":"9","cy":"10.5","r":"1.6"}],["path",{"d":"M4 17l5-4.5 4 3.5 3-2.5 4 3.5"}]],
 "x": [["path",{"d":"M6 6l12 12M18 6L6 18"}]],
 "flip": [["path",{"d":"M4 8h12l-3-3M20 16H8l3 3"}]],
 "user": [["circle",{"cx":"12","cy":"8","r":"4"}],["path",{"d":"M5 20c0-3.5 3-6 7-6s7 2.5 7 6"}]],
 "gem": [["path",{"d":"M6 4h12l3 5-9 11L3 9z"}],["path",{"d":"M3 9h18M9 4l-2 5 5 11 5-11-2-5"}]],
 "flag": [["path",{"d":"M6 21V4"}],["path",{"d":"M6 5h12l-2.5 4L18 13H6"}]],
 "calendar": [["rect",{"x":"4","y":"5","width":"16","height":"15","rx":"2"}],["path",{"d":"M4 10h16M8 3v4M16 3v4"}]],
 "scroll": [["path",{"d":"M7 4h11v13a3 3 0 0 1-3 3H6a3 3 0 0 0 3-3V7a3 3 0 0 0-2-3z"}],["path",{"d":"M11 9h4M11 13h4"}]],
 "skull": [["path",{"d":"M5 11a7 7 0 0 1 14 0v3l-2 1v4H7v-4l-2-1z"}],["circle",{"cx":"9.5","cy":"11.5","r":"1.3"}],["circle",{"cx":"14.5","cy":"11.5","r":"1.3"}],["path",{"d":"M10 19v-2M14 19v-2"}]],
 "fiche": [["rect",{"x":"3","y":"5","width":"18","height":"14","rx":"2"}],["circle",{"cx":"9","cy":"11","r":"2"}],["path",{"d":"M6 16c.6-1.6 2-2.5 3-2.5s2.4.9 3 2.5M14 10h4M14 14h4"}]],
 "comp": [["path",{"d":"M12 3l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.4l6-.9z"}]],
 "eye": [["path",{"d":"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"}],["circle",{"cx":"12","cy":"12","r":"3"}]],
 "clover": [["circle",{"cx":"9","cy":"9","r":"3.2"}],["circle",{"cx":"15","cy":"9","r":"3.2"}],["circle",{"cx":"9","cy":"15","r":"3.2"}],["circle",{"cx":"15","cy":"15","r":"3.2"}]],
 "chev_d": [["path",{"d":"M6 9l6 6 6-6"}]],
 "chev_u": [["path",{"d":"M6 15l6-6 6 6"}]],
 "folder": [["path",{"d":"M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"}]],
 "sliders": [["path",{"d":"M4 7h10M18 7h2M4 17h2M10 17h10"}],["circle",{"cx":"16","cy":"7","r":"2"}],["circle",{"cx":"8","cy":"17","r":"2"}]],
 "tag": [["path",{"d":"M3 12V4h8l10 10-8 8zM7.5 8.5h.01"}]],
 "pen": [["path",{"d":"M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"}]],
 "clock": [["circle",{"cx":"12","cy":"12","r":"9"}],["path",{"d":"M12 7v5l3 2"}]],
 "target": [["circle",{"cx":"12","cy":"12","r":"8"}],["circle",{"cx":"12","cy":"12","r":"3"}],["path",{"d":"M12 2v3M12 19v3M2 12h3M19 12h3"}]],
 "info": [["circle",{"cx":"12","cy":"12","r":"9"}],["path",{"d":"M12 11v5M12 8h.01"}]],
 "link": [["path",{"d":"M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1"}]],
 "dots": [["circle",{"cx":"12","cy":"5","r":"1.6"}],["circle",{"cx":"12","cy":"12","r":"1.6"}],["circle",{"cx":"12","cy":"19","r":"1.6"}]],
 "move": [["path",{"d":"M5 12h14M13 6l6 6-6 6"}]]
};
// Noms utilisés dans les profils de jeu (« icone ») qui désignent une icône du kit sous un autre nom.
export const ALIAS = {"person": "user", "hero": "user", "lieu": "map", "objet": "bag", "histoire": "book", "compagnon": "paw", "monstre": "monster"};
const NS = "http://www.w3.org/2000/svg";
/** Icône SVG (élément). Nom inconnu : cercle plein discret (jamais d'erreur d'affichage). */
export function icone(nom, taille = 24, couleur = "currentColor", epaisseur = 2, remplissage = "none") {
  const svg = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ width: taille, height: taille, viewBox: "0 0 24 24", fill: remplissage, stroke: couleur, "stroke-width": epaisseur, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(k, String(v));
  const traits = ICONES[ALIAS[nom] || nom] || [["circle", { cx: "12", cy: "12", r: "3" }]];
  for (const [balise, attrs] of traits) {
    const e = document.createElementNS(NS, balise);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e);
  }
  return svg;
}
