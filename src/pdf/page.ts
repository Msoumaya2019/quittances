/**
 * Le format de page demandé au moteur d'impression.
 *
 * `expo-print` prend **US Letter** par défaut — 612 × 792 pt, soit
 * 215,9 × 279,4 mm. Ce n'est pas une supposition : c'est écrit dans les types du
 * paquet installé, et c'est vérifié. La feuille de 297 mm, rendue sur une page
 * Letter, se scinde en deux et le talon à découper part seul sur la seconde —
 * mesuré sur la feuille réelle, qui tient sur une page A4 et sur deux pages
 * Letter.
 *
 * L'unité est le **point**, 72 par pouce : c'est celle qu'attend
 * `printToFileAsync`.
 *
 * 596 × 843 plutôt que 595 × 842, qui est A4 exact. 595 pt vaut 209,90 mm, soit
 * **0,11 mm de moins que la largeur de la feuille** : un moteur d'impression
 * strict repaginerait pour cette fraction de millimètre, et on retomberait sur
 * le défaut qu'on corrige. Le dépassement de 0,26 mm tient dans la marge
 * blanche, et l'imprimante le rogne sans rien perdre.
 */

export const PAGE_IMPRESSION = { largeurPt: 596, hauteurPt: 843 } as const;

/** Une longueur en millimètres, convertie en points. */
export function millimetresEnPoints(millimetres: number): number {
  return (millimetres / 25.4) * 72;
}
