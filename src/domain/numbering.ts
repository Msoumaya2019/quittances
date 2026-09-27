/**
 * Numérotation des documents.
 *
 * Le numéro est imprimé sur la quittance : il doit être unique, stable, et
 * lisible par un humain. Format retenu :
 *
 *     QUI-2026-0007
 *     |   |    |
 *     |   |    +-- rang, sur 4 chiffres, remis à zéro chaque année
 *     |   +------- année d'émission
 *     +----------- type : QUI, REC ou AVI
 *
 * Le rang est calculé sur les documents **déjà enregistrés pour l'année**, et
 * sur les rangs **consommés** — ceux dont le document a été supprimé.
 *
 * Le second terme n'est pas une précaution de style : supprimer une quittance
 * retire sa ligne, donc fait baisser le maximum, et la suivante porterait le
 * numéro de celle qu'on vient de retirer. Or une quittance a pu être remise au
 * locataire avant d'être supprimée de l'application : deux quittances
 * différentes porteraient alors le même numéro. Un numéro attribué est donc
 * consommé pour toujours — c'est la souche, qui reste au carnet quand la
 * feuille est détachée.
 */

import type { TypeDocument } from './types';

const PREFIXE: Record<TypeDocument, string> = {
  quittance: 'QUI',
  recu: 'REC',
  avis_echeance: 'AVI',
};

export function prefixeDocument(type: TypeDocument): string {
  return PREFIXE[type];
}

/**
 * Construit un numéro de document.
 *
 * `rang` commence à 1. Une année à cheval sur le changement d'année repart donc
 * naturellement à `0001`.
 */
export function numeroDocument(
  type: TypeDocument,
  annee: number,
  rang: number,
): string {
  if (!Number.isInteger(rang) || rang < 1) {
    throw new Error(`Rang de document invalide : ${rang}`);
  }
  if (rang > 9999) {
    throw new Error(
      `Plus de 9999 documents de type ${type} pour l'année ${annee}. ` +
        'Le format de numérotation doit être revu.',
    );
  }
  return `${PREFIXE[type]}-${annee}-${String(rang).padStart(4, '0')}`;
}

/**
 * Déduit le rang suivant à partir des numéros déjà utilisés.
 * On repère le rang maximal connu, et on ajoute un. Si un numéro ne suit pas le
 * format attendu, il est ignoré du calcul plutôt que de faire échouer l'émission.
 *
 * `rangsConsommes` porte les rangs des documents **supprimés**. Ils comptent
 * exactement comme les numéros encore présents : le maximum est pris sur les
 * deux ensembles, jamais sur les seuls survivants. Le paramètre a une valeur par
 * défaut pour qu'un appelant qui n'a pas de souches — un test, une évaluation —
 * obtienne le calcul d'avant sans le connaître.
 */
export function rangSuivant(
  numerosExistants: readonly string[],
  type: TypeDocument,
  annee: number,
  rangsConsommes: readonly number[] = [],
): number {
  const motif = new RegExp(`^${PREFIXE[type]}-${annee}-(\\d{4})$`);

  let maximum = 0;
  for (const numero of numerosExistants) {
    const correspondance = motif.exec(numero);
    if (!correspondance) continue;
    const rang = Number(correspondance[1]);
    if (rang > maximum) maximum = rang;
  }

  for (const rang of rangsConsommes) {
    if (Number.isInteger(rang) && rang > maximum) maximum = rang;
  }

  return maximum + 1;
}

/**
 * Le rang porté par un numéro, ou `null` s'il ne suit pas le format attendu.
 *
 * La souche d'une quittance supprimée ne conserve **pas** son rang : elle
 * conserve son numéro, et le rang s'en relit. Deux représentations du même fait
 * finiraient par diverger — une ligne dont le numéro dit 7 et la colonne 5
 * rendrait la numérotation imprévisible, sans que rien ne le signale.
 */
export function rangDeNumero(
  numero: string,
  type: TypeDocument,
  annee: number,
): number | null {
  const correspondance = new RegExp(`^${PREFIXE[type]}-${annee}-(\\d{4})$`).exec(numero);
  return correspondance ? Number(correspondance[1]) : null;
}

/** Vrai si le numéro respecte le format attendu. */
export function numeroValide(numero: string): boolean {
  return /^(QUI|REC|AVI)-\d{4}-\d{4}$/.test(numero);
}

/**
 * Nom de fichier du PDF.
 *
 * On évite les accents et les espaces : certains gestionnaires de fichiers
 * Android transforment les accents en caractères parasites. Le nom reste
 * néanmoins descriptif :
 *
 *     QUI-2026-0007_Appartement-1_septembre-2026.pdf
 */
export function nomFichierDocument(params: {
  numero: string;
  logementNom: string;
  periodeLibelle: string;
}): string {
  const { numero, logementNom, periodeLibelle } = params;
  const nettoyer = (texte: string) =>
    texte
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // retire les accents
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

  return `${nettoyer(numero)}_${nettoyer(logementNom)}_${nettoyer(periodeLibelle)}.pdf`;
}
