/**
 * Les brouillons : un formulaire guidé commencé et non terminé.
 *
 * Un bail se remplit en neuf étapes, un état des lieux en six, avec des photos.
 * Une saisie perdue parce qu'on a reçu un appel est le genre de défaut qui fait
 * renoncer à l'outil. Ce module porte les deux règles qui décident qu'une
 * reprise est possible, et il est **pur** — donc éprouvable sous `node --test`.
 *
 *  1. **Un contenu illisible ne fait pas tomber l'écran.** Le JSON d'un
 *     brouillon peut avoir été tronqué — écriture interrompue, restauration
 *     partielle. On rend alors un objet vide : le formulaire repart de son
 *     début, ce qui est désagréable, au lieu de planter, ce qui est pire.
 *  2. **Une étape qui n'existe plus ne bloque pas la reprise.** Une version
 *     ultérieure peut renommer ou retirer une étape ; un brouillon enregistré
 *     sous l'ancien nom doit rester reprenable, à défaut de reprendre au bon
 *     endroit.
 */

/**
 * Les types de formulaire susceptibles d'être interrompus.
 *
 * C'est une liste **fermée** : elle nomme les brouillons que l'application sait
 * reprendre. Les inventaires y entreront avec leur écran.
 *
 * Un état des lieux d'entrée et un état des lieux de sortie ont **deux
 * brouillons distincts**, et non un seul partagé. La clé primaire de la table
 * est le couple (logement, type) : avec une seule clé, commencer une sortie
 * pendant qu'une entrée est en cours écraserait l'entrée, en silence et sans
 * que personne ne l'ait demandé.
 *
 * Le nom `etat_des_lieux` reste celui de **l'entrée**, alors qu'un nom
 * symétrique (`etat_des_lieux_entree`) serait plus lisible : le renommer
 * rendrait orphelin tout brouillon d'entrée déjà enregistré sur un téléphone.
 * Ne pas perdre une saisie en cours vaut mieux qu'une paire de noms bien
 * appariée.
 */
export type TypeBrouillon = 'bail' | 'etat_des_lieux' | 'etat_des_lieux_sortie' | 'inventaire';

export const LIBELLE_BROUILLON: Record<TypeBrouillon, string> = {
  bail: 'Bail de location',
  etat_des_lieux: 'État des lieux',
  etat_des_lieux_sortie: 'État des lieux de sortie',
  inventaire: 'Inventaire du mobilier',
};

/** Le brouillon d'état des lieux correspondant à la nature du document. */
export function brouillonDeLEdl(type: 'entree' | 'sortie'): TypeBrouillon {
  return type === 'entree' ? 'etat_des_lieux' : 'etat_des_lieux_sortie';
}

/**
 * Lit le contenu d'un brouillon, sans jamais lever.
 *
 * Un tableau, un nombre ou une chaîne là où l'on attend un objet sont traités
 * comme un contenu vide : ce sont des formes qu'une écriture partielle ou une
 * sauvegarde d'une autre version peuvent produire, et elles ne doivent pas se
 * propager jusqu'à un écran qui les lirait comme un objet.
 */
export function analyserDonnees(texte: string | null | undefined): Record<string, unknown> {
  if (!texte) return {};
  try {
    const valeur: unknown = JSON.parse(texte);
    if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur)) return {};
    return valeur as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Sérialise un contenu de brouillon.
 *
 * Les valeurs non sérialisables — une fonction glissée par mégarde, une
 * référence circulaire — feraient lever `JSON.stringify` et perdraient la
 * saisie entière. On rend alors `'{}'` : perdre un brouillon vaut mieux que
 * perdre l'écran qui l'enregistre.
 */
export function serialiserDonnees(valeur: unknown): string {
  try {
    const texte = JSON.stringify(valeur ?? {});
    return typeof texte === 'string' ? texte : '{}';
  } catch {
    return '{}';
  }
}

/**
 * L'étape à laquelle reprendre, ou `null` s'il faut repartir du début.
 *
 * Rend `null` quand l'étape enregistrée n'appartient plus au parcours : un
 * formulaire dont une étape a été renommée ou retirée ne doit pas rester
 * bloqué sur un nom que plus rien ne reconnaît. Reprendre au début est
 * imparfait, mais l'écran s'affiche — et les valeurs déjà saisies, elles, sont
 * conservées.
 */
export function etapeReprise(
  etapeEnregistree: string | null | undefined,
  etapes: readonly { valeur: string }[],
): string | null {
  if (!etapeEnregistree) return null;
  return etapes.some((e) => e.valeur === etapeEnregistree) ? etapeEnregistree : null;
}

/**
 * Depuis quand ce brouillon attend-il ?
 *
 * Sert à ne pas présenter comme « en cours » un brouillon oublié depuis des
 * mois. Le seuil est un confort d'affichage, pas une règle métier : au-delà,
 * l'écran dira qu'il date, sans jamais le supprimer de lui-même — une saisie
 * disparue sans que personne ne l'ait demandé est une perte de données.
 */
export const JOURS_BROUILLON_RECENT = 30;

/** Le brouillon est-il récent, au sens de `JOURS_BROUILLON_RECENT` ? */
export function brouillonRecent(majLe: string, aujourdHui: string): boolean {
  const jours = joursEntre(majLe, aujourdHui);
  // Une date illisible est traitée comme ancienne : annoncer « repris il y a
  // deux jours » sur une date qu'on n'a pas su lire serait une invention.
  if (jours === null) return false;
  return jours <= JOURS_BROUILLON_RECENT;
}

/** Nombre de jours entre deux dates civiles, ou `null` si l'une est illisible. */
export function joursEntre(depuis: string, jusqu: string): number | null {
  const a = new Date(`${depuis}T00:00:00Z`);
  const b = new Date(`${jusqu}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
