/**
 * Les identifiants fabriqués par le domaine.
 *
 * Ils sont **déterministes** et non aléatoires, pour deux raisons. La première
 * est que ce module doit rester pur : `nouvelId()` passe par `expo-crypto`,
 * qu'un test sous `node --test` ne peut pas charger. La seconde est plus utile
 * encore : un document de sortie construit à partir de celui d'entrée
 * **réemploie les mêmes identifiants**, et la comparaison entre les deux se
 * fait alors par égalité, sans deviner quelles pièces se correspondent.
 *
 * Ce fichier existe parce que deux documents — l'état des lieux et l'inventaire
 * du mobilier — fabriquent des identifiants et rangent des photos de la même
 * façon. La règle qui compte, et qui a coûté un défaut mesuré, est celle de
 * `identifiantsDePhotos` : **un identifiant de photo est unique dans tout le
 * document**. Écrite deux fois, la première correction apportée à l'une aurait
 * laissé l'autre imprimer une image à la place d'une autre.
 */

/** Le premier identifiant libre pour un préfixe donné : `p1`, `e2`, `ph3`… */
export function premierLibre(prefixe: string, pris: readonly string[]): string {
  let rang = 1;
  while (pris.includes(`${prefixe}${rang}`)) rang += 1;
  return `${prefixe}${rang}`;
}

/**
 * L'identifiant repris d'un contenu enregistré, ou un identifiant neuf.
 *
 * On ne fait pas confiance à l'identifiant lu, même bien formé : deux pièces
 * peuvent porter le même si le contenu vient d'une sauvegarde abîmée ou d'une
 * version antérieure. Or ces identifiants servent à **apparier** un document de
 * sortie à celui d'entrée : deux pièces confondues feraient comparer la
 * mauvaise chambre à la mauvaise chambre, et le document affirmerait une
 * évolution qui n'a pas eu lieu.
 */
export function identifiantRepris(
  valeur: unknown,
  prefixe: string,
  pris: readonly string[],
): string {
  if (typeof valeur === 'string') {
    const propre = valeur.trim();
    if (propre.length > 0 && !pris.includes(propre)) return propre;
  }
  return premierLibre(prefixe, pris);
}

/** Le strict nécessaire pour qu'une photo porte un identifiant. */
export interface PhotoIdentifiee {
  id: string;
}

/**
 * Tous les identifiants de photos d'un document, à partir de leurs listes.
 *
 * Sert à en fabriquer un qui soit libre **dans tout le document**, et non
 * seulement dans le porteur qui reçoit la photo. La distinction n'est pas
 * théorique : les photos sont indexées par identifiant au moment de
 * l'impression, si bien que deux `ph1` — l'un dans le séjour, l'autre dans la
 * chambre — ne donnaient **qu'une seule image imprimée**, celle du premier, et
 * la seconde disparaissait du document sans que rien ne le signale. Mesuré.
 *
 * Les listes vides et les identifiants vides sont ignorés : une photo sans
 * identifiant ne peut pas en occuper un.
 */
export function identifiantsDePhotos(
  listes: readonly (readonly PhotoIdentifiee[])[],
): string[] {
  const ids: string[] = [];
  for (const liste of listes) {
    for (const photo of liste) if (photo.id) ids.push(photo.id);
  }
  return ids;
}

/**
 * L'identifiant à donner à une nouvelle photo d'un document.
 *
 * `prises` porte les identifiants déjà employés **dans tout le document**.
 * Sans cette liste, l'identifiant est cherché libre dans le seul porteur, et
 * deux porteurs finissent par porter le même : l'impression n'en garde alors
 * qu'un.
 */
export function idPhotoLibre(prises: readonly string[]): string {
  return premierLibre('ph', prises);
}
