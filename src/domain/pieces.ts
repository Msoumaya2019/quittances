/**
 * Le vocabulaire des pièces d'un logement.
 *
 * Il est **commun** à l'état des lieux et à l'inventaire du mobilier : les deux
 * parcourent le même logement, pièce par pièce, et une liste de pièces qui
 * différerait d'un document à l'autre serait un défaut — une cave décrite dans
 * l'un et absente de l'autre.
 *
 * Ce module ne décrit que le **vocabulaire** : les noms de pièces proposés, et
 * de quoi rapprocher deux noms écrits différemment. Ce que chaque pièce contient
 * — des éléments à constater, des meubles à compter — appartient aux modules qui
 * les décrivent.
 *
 * Module **pur** : ni SQLite, ni React.
 */

/**
 * Normalise un nom : sans accent, sans casse, sans espace de bord.
 *
 * Sert à rapprocher « Salle de bain » de « salle de bains » et « Chambre 1 » de
 * « chambre 1 », sans exiger de l'utilisateur qu'il écrive deux fois de la même
 * façon. C'est une comparaison de **commodité** : elle ne sert jamais à apparier
 * deux documents — cela se fait par identifiant, et par identifiant seul.
 */
export function normaliserNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Les pièces proposées par défaut, selon le type de logement.
 *
 * La liste est **modifiable** dans tous les cas : ce sont des points de départ,
 * pas des cases à cocher. Un studio n'a pas de chambre, une maison a une cave,
 * et l'application ne peut pas le deviner mieux que celui qui est sur place.
 */
export const PIECES_PAR_DEFAUT: Record<string, string[]> = {
  appartement: [
    'Entrée',
    'Séjour',
    'Cuisine',
    'Chambre 1',
    'Chambre 2',
    'Salle de bain',
    'WC',
    'Couloir',
    'Balcon',
  ],
  studio: ['Entrée', 'Pièce principale', 'Kitchenette', 'Salle de bain', 'WC'],
  maison: [
    'Entrée',
    'Séjour',
    'Cuisine',
    'Chambre 1',
    'Chambre 2',
    'Chambre 3',
    'Salle de bain',
    'WC',
    'Couloir',
    'Cave',
    'Garage',
    'Jardin',
  ],
  chambre: ['Chambre', 'Salle de bain', 'WC', 'Couloir'],
  garage: ['Garage'],
  parking: ['Emplacement'],
  local: ['Local', 'Réserve', 'WC'],
  autre: ['Entrée', 'Pièce principale', 'Salle de bain', 'WC'],
};

/** La liste de pièces proposée pour un type de logement. */
export function piecesParDefaut(typeLogement: string): string[] {
  return PIECES_PAR_DEFAUT[typeLogement] ?? PIECES_PAR_DEFAUT.autre;
}

/** Les noms de pièces d'un logement, sous une forme comparable. */
export function nomsComparables(noms: readonly string[]): string[] {
  return noms.map(normaliserNom).filter((n) => n.length > 0);
}
