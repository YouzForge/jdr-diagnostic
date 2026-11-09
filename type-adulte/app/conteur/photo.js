// Photos : réduction avant envoi, rangement dans le dossier des photos du JDR, vignette lue depuis OneDrive.
import { h, icon } from "./ui.js?v=0.18.0";

export function reduire(fichier, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(fichier);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res({ blob: b, apercu: URL.createObjectURL(b) }) : rej(new Error("Photo illisible")), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Photo illisible")); };
    img.src = url;
  });
}
export const horodatage = () => {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Réduit une photo et la range dans le dossier des photos. → { nom, apercu } */
export async function envoyerPhoto(ctx, fichier) {
  const dossier = ctx.regles.photos;
  if (!dossier) throw new Error("Les photos ne sont pas activées pour ce JDR.");
  const r = await reduire(fichier);
  const nom = horodatage() + ".jpg";
  await ctx.depot.ajouterPhoto(`${dossier}/${nom}`, r.blob);
  return { nom, apercu: r.apercu };
}

/** Zone photo : l'image d'un fichier du dossier des photos (ou une icône tant qu'elle n'est pas là). */
export function boitePhoto(ctx, nomFichier, classe = "photo", ic = "image") {
  const boite = h("div", { class: classe }, icon(ic, 40, "var(--muted)"));
  const dossier = ctx.regles.photos;
  if (nomFichier && dossier) {
    ctx.depot.lireImage(`${dossier}/${nomFichier}`).then(r => {
      if (!r) return;
      boite.textContent = "";
      boite.append(h("img", { src: URL.createObjectURL(r.blob), alt: "" }));
    }).catch(() => { /* garde l'icône */ });
  }
  return boite;
}
