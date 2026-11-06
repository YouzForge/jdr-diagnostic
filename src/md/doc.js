// Lecture et écriture des fiches Markdown : en-tête de champs (--- … ---) ou ancien format « - **Champ :** valeur ».
// Sans DOM, sans stockage : fonctionne dans le navigateur et dans Node (tests).

/** Nom de champ normalisé : « Cœurs » → « coeurs ». */
export const norm = s => String(s).toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Clés qu'une fiche ne doit jamais pouvoir poser sur l'objet des champs (pollution de prototype).
const CLES_INTERDITES = new Set(["__proto__", "constructor", "prototype"]);

function scalaire(v) {
  v = v.trim().replace(/^["']|["']$/g, "");
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

/** { meta, body, title, structured } ; meta est un objet sans prototype. */
export function parseDoc(text) {
  text = String(text ?? "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const meta = Object.create(null);
  let body = text, structured = false;
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    structured = true;
    body = text.slice(m[0].length);
    for (const line of m[1].split("\n")) {
      const k = line.match(/^([A-Za-z_À-ÿŒœ0-9]+)\s*:\s*(.*)$/);
      if (!k) continue;
      const cle = norm(k[1]);
      if (cle && !CLES_INTERDITES.has(cle)) meta[cle] = scalaire(k[2]);
    }
  } else {
    // ancien format : « - **Cœurs :** 2 (monstre faible) » dans l'introduction (avant la 1re section « ## »)
    const intro = body.split(/\n## /)[0];
    for (const line of intro.split("\n")) {
      const k = line.match(/^\s*[-*]\s+\*\*(.+?)\s*:?\s*\*\*\s*:?\s*(.+)$/);
      if (!k) continue;
      const cle = norm(k[1]);
      if (cle && !CLES_INTERDITES.has(cle)) meta[cle] = k[2].trim();
    }
  }
  const t = body.match(/^#\s+(.+)$/m);
  return { meta, body, title: t ? t[1].trim() : null, structured };
}

/** Premier entier d'une valeur (« 2 (monstre faible) » → 2), sinon null. */
export const intOf = v => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  const m = String(v ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
};
export const isTrue = v => v === true || /^(oui|true|vrai|yes)$/i.test(String(v ?? "").trim());

/** « 02_Le_chateau.md » → « Le chateau ». */
export const humanize = file => String(file).replace(/\.md$/i, "").replace(/^\d+_/, "").replace(/_/g, " ");

/** Découpe un corps en sections « ## Titre ». La première, sans titre, est l'introduction. */
export function sections(body) {
  return String(body).split(/\n(?=## )/).map(p => {
    const m = p.match(/^## (.+)\n?([\s\S]*)$/);
    return m ? { title: m[1].trim(), text: m[2] } : { title: "", text: p };
  });
}

const echapper = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Texte d'une section « ## Titre » (sans le titre), « » si elle n'existe pas. */
export function getSection(body, title) {
  const re = new RegExp(`^## ${echapper(title)}\\s*\\n([\\s\\S]*?)(?=\\n## |(?![\\s\\S]))`, "m");
  const m = String(body).match(re);
  return m ? m[1].trim() : "";
}

/** Remplace (ou ajoute à la fin) la section « ## Titre » ; texte vide = section retirée. */
export function setSection(body, title, text) {
  body = String(body);
  const re = new RegExp(`^## ${echapper(title)}\\s*\\n[\\s\\S]*?(?=\\n## |(?![\\s\\S]))`, "m");
  const bloc = text.trim() ? `## ${title}\n${text.trim()}\n` : "";
  if (re.test(body)) return body.replace(re, () => bloc).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return bloc ? body.trimEnd() + "\n\n" + bloc : body;
}

const aplati = v => String(v ?? "").replace(/\s*\n\s*/g, " ").trim();

/** Remet un en-tête de champs devant un corps. L'ordre des champs est celui de l'objet. Un champ ne peut jamais contenir de saut de ligne. */
export function serializeDoc(meta, body) {
  const tete = Object.entries(meta).map(([k, v]) => {
    const cle = norm(k);
    if (!cle || CLES_INTERDITES.has(cle)) throw new Error("Nom de champ interdit : " + k);
    const val = typeof v === "boolean" || typeof v === "number" ? String(v) : aplati(v);
    return val === "" ? `${cle}:` : `${cle}: ${val}`;
  }).join("\n");
  return `---\n${tete}\n---\n${String(body).replace(/^\n+/, "")}`;
}

/**
 * Visibilité d'une fiche : « accessible », « conditionnel » ou « secret ».
 * Règle de sécurité : tout ce qui n'est pas clairement reconnu est SECRET (champ absent, vide, faute de frappe, valeur inconnue).
 */
export function lireVisibilite(meta, valides = ["accessible", "conditionnel", "secret"]) {
  const v = norm(meta && meta.visibilite != null ? meta.visibilite : "");
  return valides.includes(v) ? v : "secret";
}
