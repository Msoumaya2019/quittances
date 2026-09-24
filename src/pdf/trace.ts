/**
 * Tracés et images, transformés en ce que les documents savent insérer.
 *
 * Un document HTML n'insère pas un chemin SVG ni un fichier : il insère une
 * **image**, par une balise `img` et une URI `data:`. Ce module fait cette
 * conversion, et rien d'autre. Il est **pur** — ni système de fichiers, ni
 * React — ce qui permet de l'éprouver par `node --test` et de le partager entre
 * le bail, l'état des lieux et l'inventaire.
 *
 * Le SVG est préféré à une capture d'écran PNG, et c'est délibéré : un tracé
 * vectoriel reste net à l'impression, à n'importe quelle taille, et ne dépend
 * d'aucun outil de capture. La même chaîne fonctionne sur le téléphone, dans
 * l'aperçu et sur le papier.
 */

import { chaineVersOctets, octetsVersBase64 } from './encodage.ts';

/**
 * Un tracé de signature, transformé en image insérable dans le document.
 *
 * Le tracé est reproduit **tel quel**. Une signature redessinée serait une
 * autre signature.
 */
export function traceEnDataUri(chemin: string, largeur: number, hauteur: number): string {
  const l = Math.max(1, Math.round(largeur));
  const h = Math.max(1, Math.round(hauteur));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l} ${h}" width="${l}" height="${h}">` +
    `<rect width="${l}" height="${h}" fill="#ffffff"/>` +
    `<path d="${chemin}" fill="none" stroke="#111111" stroke-width="2.5" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return `data:image/svg+xml;base64,${octetsVersBase64(chaineVersOctets(svg))}`;
}

/**
 * Une URI `data:` pour une photo déjà lue en base64.
 *
 * Le contenu est assemblé ici, en un seul endroit, parce que **l'échappement
 * HTML ne doit pas s'y appliquer** : la chaîne base64 ne contient ni `<`, ni
 * `>`, ni `&`, et la faire passer par `echapper()` ne produirait rien de bon.
 * Un test vérifie qu'aucune URI de données du document rendu n'a été abîmée.
 */
export function donneesImage(base64: string, mime: string): string {
  return `data:${mime};base64,${base64}`;
}

/** Le type MIME d'une photo, à partir de son extension. JPEG par défaut. */
export function mimeDeLExtension(chemin: string): string {
  const extension = /\.([a-zA-Z0-9]{2,5})$/.exec(chemin)?.[1]?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Une dimension de photo, ramenée dans les bornes du document.
 *
 * Une photo prise au téléphone fait plusieurs milliers de pixels de large :
 * insérée telle quelle, elle déborde de la page ou écrase la mise en page. On
 * conserve donc le **rapport** largeur/hauteur et l'on ramène la plus grande
 * dimension à la largeur utile — jamais d'étirement, qui déformerait la preuve.
 */
export function dimensionDansLaLargeur(
  largeur: number,
  hauteur: number,
  largeurUtile: number,
): { largeur: number; hauteur: number } {
  if (!Number.isFinite(largeur) || !Number.isFinite(hauteur) || largeur <= 0 || hauteur <= 0) {
    return { largeur: largeurUtile, hauteur: Math.round((largeurUtile * 3) / 4) };
  }
  if (largeur <= largeurUtile) {
    return { largeur: Math.round(largeur), hauteur: Math.round(hauteur) };
  }
  return {
    largeur: Math.round(largeurUtile),
    hauteur: Math.round((hauteur * largeurUtile) / largeur),
  };
}
