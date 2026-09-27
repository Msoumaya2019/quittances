/**
 * Ce qu'une suppression emporte, et ce qu'elle n'emporte pas.
 *
 * Supprimer un document est un geste simple ; le danger est ailleurs. Une
 * quittance n'est pas qu'un PDF : c'est la preuve qu'un mois a été réglé, et le
 * bailleur pourrait croire qu'en la supprimant il efface le paiement. Un bail
 * n'est pas qu'un PDF non plus : c'est la pièce qui fonde une location, et sa
 * disparition ne doit pas faire disparaître les locataires, le loyer ni les
 * quittances déjà émises.
 *
 * La règle tient donc en une phrase : **une suppression n'emporte que le
 * document**. Elle est écrite ici, en fonction pure, pour deux raisons :
 *
 *  - les deux écrans qui suppriment (l'onglet DOCUMENTS, le dossier d'un
 *    logement) et l'aperçu d'une quittance disent alors exactement la même
 *    chose — une phrase recopiée trois fois finit par diverger ;
 *  - ce que l'application **affirme** avant d'effacer devient vérifiable : un
 *    banc peut exiger que le texte d'une quittance nomme le paiement, et que
 *    celui d'un bail nomme la location. Une phrase fausse se voit alors, au lieu
 *    de se découvrir chez le bailleur.
 *
 * Où ce module s'arrête : il ne supprime rien, ne lit ni la base ni le disque,
 * et ne connaît pas les dépôts. Le geste lui-même est dans
 * `src/documents/suppression.ts`.
 */

// Les extensions `.ts` sont obligatoires : ce module est chargé directement par
// `node --test`, qui ne résout ni `@/` ni un chemin sans extension.
import type { CleSection } from './dossier.ts';
import type { ElementDossier } from './dossier.ts';

export interface Suppression {
  /** Ce que le geste retire du dossier, en une phrase. */
  emporte: string;
  /**
   * Ce que le geste **ne** retire pas.
   *
   * Jamais vide : toute suppression épargne quelque chose, et le taire ferait
   * croire que supprimer une quittance efface le paiement qui l'a permise. Un
   * texte vide serait donc un texte faux.
   */
  epargne: string;
}

/**
 * Le geste est sans retour, et le fichier est effacé du téléphone.
 *
 * La phrase est la même pour tous les documents : la répéter par type ferait
 * croire à des différences qui n'existent pas.
 */
export const SANS_RETOUR =
  'Le fichier PDF est effacé du téléphone. Cette action ne peut pas être annulée.';

/**
 * Ce qu'une suppression épargne, par section du dossier.
 *
 * La clé est la **section** et non la catégorie : deux états des lieux se
 * rangent dans une seule catégorie mais dans deux sections, et ce sont bien deux
 * conséquences différentes — retirer l'entrée empêche une comparaison future,
 * retirer la sortie ne l'empêche pas.
 */
const EPARGNE: Record<CleSection, string> = {
  quittances:
    'Les paiements enregistrés pour ce mois ne sont pas touchés : le mois redeviendra ' +
    '« à rattraper », et une nouvelle quittance pourra être produite. Les numéros déjà ' +
    'attribués restent consommés.',
  bail:
    'La location n’est pas touchée : les locataires, le loyer, les échéances et les ' +
    'quittances déjà émises restent en place.',
  edl_entree:
    'Aucun autre document n’est touché. Un état des lieux de sortie ne pourra plus être ' +
    'comparé à celui-ci.',
  edl_sortie:
    'L’état des lieux d’entrée de la même location reste dans le dossier, et l’entrée ' +
    'reste comparable.',
  inventaire:
    'Aucun autre document n’est touché. Le logement, le locataire et les constats déjà ' +
    'signés restent en place.',
  autres: 'Aucun autre document n’est touché.',
};

/**
 * Ce qu'il faut dire au bailleur avant d'effacer.
 *
 * `emporte` nomme le document tel qu'il est affiché — son libellé, qui porte
 * déjà le mois pour une quittance — plutôt qu'un mot générique : c'est ce qui
 * permet de vérifier qu'on supprime bien celui qu'on croit, dans une liste où
 * trois quittances se ressemblent.
 */
export function suppressionDe(element: ElementDossier): Suppression {
  const numero = element.numero ? ` (n° ${element.numero})` : '';

  return {
    emporte: `« ${element.libelle} »${numero} et son fichier PDF seront retirés du dossier.`,
    epargne: EPARGNE[element.section],
  };
}

/**
 * Le message complet d'une confirmation de suppression.
 *
 * Une seule fonction pour les trois écrans : deux compositions différentes
 * donneraient deux textes pour le même geste.
 */
export function messageDeSuppression(element: ElementDossier): string {
  const { emporte, epargne } = suppressionDe(element);
  return `${emporte} ${epargne} ${SANS_RETOUR}`;
}
