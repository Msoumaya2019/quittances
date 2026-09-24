/**
 * L'état d'un élément : sept valeurs, et ce qu'elles disent.
 *
 * Ce vocabulaire est **commun** à l'état des lieux et à l'inventaire du
 * mobilier : un meuble est décrit dans les mêmes termes qu'un mur, parce que
 * c'est la même question posée deux fois — dans quel état est-ce ? Deux listes
 * séparées auraient fini par diverger, et un état présent dans l'une aurait
 * disparu de l'autre sans que rien ne le signale.
 *
 * La distinction qui compte, et qui a son propre test, est celle de
 * `etatConstate` : `non_verifie` et `non_applicable` **ne sont pas des états du
 * logement**. Le premier dit qu'on n'a pas regardé, le second que l'élément
 * n'existe pas dans cette pièce. Les mêler aux cinq autres dans un comptage
 * ferait dire au document que trois éléments sont « en bon état » là où un seul
 * l'est.
 */

export type EtatElement =
  | 'neuf'
  | 'tres_bon'
  | 'bon'
  | 'usage'
  | 'mauvais'
  | 'non_verifie'
  | 'non_applicable';

export interface PresentationEtat {
  valeur: EtatElement;
  libelle: string;
  /** Une abréviation pour les listes serrées et les pastilles. */
  court: string;
  /**
   * Un état **constaté** décrit le logement ; `non_verifie` et
   * `non_applicable` décrivent ce qu'on a fait, pas ce qu'on a vu.
   */
  constate: boolean;
  /**
   * Rang d'affichage, du meilleur au moins bon.
   *
   * Sert **uniquement** à ordonner une liste ou à trier une synthèse. Ce n'est
   * pas une échelle de responsabilité : l'article 4 du décret n° 2016-382 range
   * l'usure du temps et de l'usage normal hors de toute imputation au
   * locataire, et l'application n'a pas à trancher ce que le juge trancherait.
   */
  rang: number;
}

export const ETATS_ELEMENT: PresentationEtat[] = [
  { valeur: 'neuf', libelle: 'Neuf', court: 'Neuf', constate: true, rang: 1 },
  { valeur: 'tres_bon', libelle: 'Très bon état', court: 'Très bon', constate: true, rang: 2 },
  { valeur: 'bon', libelle: 'Bon état', court: 'Bon', constate: true, rang: 3 },
  { valeur: 'usage', libelle: "État d'usage", court: 'Usage', constate: true, rang: 4 },
  { valeur: 'mauvais', libelle: 'Mauvais état', court: 'Mauvais', constate: true, rang: 5 },
  { valeur: 'non_verifie', libelle: 'Non vérifié', court: 'Non vérifié', constate: false, rang: 6 },
  {
    valeur: 'non_applicable',
    libelle: 'Non applicable',
    court: 'Sans objet',
    constate: false,
    rang: 7,
  },
];

/** La présentation d'un état, ou `null` si la valeur est inconnue. */
export function presentationEtat(etat: EtatElement | undefined): PresentationEtat | null {
  if (!etat) return null;
  return ETATS_ELEMENT.find((e) => e.valeur === etat) ?? null;
}

/** L'état décrit-il le logement, ou seulement ce qu'on a fait ? */
export function etatConstate(etat: EtatElement | undefined): boolean {
  return presentationEtat(etat)?.constate === true;
}

/** Le libellé d'un état, ou une chaîne vide s'il n'est pas renseigné. */
export function libelleEtat(etat: EtatElement | undefined): string {
  return presentationEtat(etat)?.libelle ?? '';
}

/**
 * Cette valeur est-elle un des sept états ?
 *
 * Sert à la relecture d'un contenu enregistré : `'bon'` n'est pas un état
 * valide, et le conserver ferait afficher une case vide dans la liste des sept.
 */
export function estEtatValide(valeur: unknown): valeur is EtatElement {
  return typeof valeur === 'string' && ETATS_ELEMENT.some((e) => e.valeur === valeur);
}
