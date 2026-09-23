/**
 * Mentions légales des documents remis au locataire.
 *
 * Références utilisées :
 *  - loi n° 89-462 du 6 juillet 1989, article 21, pour l'obligation de
 *    délivrer une quittance au locataire qui a payé son loyer ;
 *  - décret n° 2015-587 du 29 mai 2015, pour le contenu du reçu de paiement
 *    partiel.
 *
 * Ces textes sont reproduits ici sous forme de résumés rédactionnels. Ils ne
 * remplacent pas le conseil d'un professionnel, et l'application n'invente
 * aucune mention qu'elle ne saurait pas justifier.
 *
 * L'import ci-dessous est **de type seulement** : il disparaît à la
 * compilation, et ce module continue de n'emporter aucun code à l'exécution —
 * c'est ce qui permet à `node --test` de le charger sans émulateur. Il évite
 * surtout de recopier l'union des types de document, qui vit dans le domaine.
 */

import type { TypeDocument } from '../domain/types.ts';

export const REFERENCE_LOI_1989 =
  "Loi n° 89-462 du 6 juillet 1989, article 21 : le bailleur est tenu de délivrer gratuitement " +
  "une quittance au locataire qui en fait la demande, lorsque le loyer et les charges sont " +
  "intégralement acquittés.";

export const REFERENCE_DECRET_2015 =
  "Décret n° 2015-587 du 29 mai 2015 : en cas de paiement partiel, le bailleur remet un reçu " +
  "distinct de la quittance, portant mention du montant reçu et du montant restant dû.";

/**
 * Mention figurant sur une quittance.
 * La quittance atteste le paiement intégral : elle ne doit donc être émise que
 * dans ce cas, ce que le moteur métier garantit en amont.
 */
export function mentionQuittance(params: {
  periodeLibelle: string;
  total: string;
  locataires: string;
}): string {
  return (
    `Le bailleur reconnaît avoir reçu de ${params.locataires} la somme de ${params.total}, ` +
    `au titre du loyer et des charges de la période ${params.periodeLibelle}, ` +
    `et lui en donne quittance, sous réserve de tous droits.`
  );
}

/** Mention figurant sur un reçu de paiement partiel. */
export function mentionRecu(params: {
  periodeLibelle: string;
  montantRecu: string;
  montantDu: string;
  montantRestant: string;
}): string {
  return (
    `Le bailleur reconnaît avoir reçu la somme de ${params.montantRecu} au titre de la période ` +
    `${params.periodeLibelle}. Le montant total dû pour cette période étant de ${params.montantDu}, ` +
    `il reste ${params.montantRestant} à régler. ` +
    "Ce reçu ne vaut pas quittance, la quittance ne pouvant être délivrée qu'après règlement intégral."
  );
}

/** Mention figurant sur un avis d'échéance. */
export function mentionAvisEcheance(params: {
  periodeLibelle: string;
  total: string;
  echeance: string;
}): string {
  return (
    `Le montant dû au titre de la période ${params.periodeLibelle} s'élève à ${params.total}. ` +
    `L'échéance habituelle est fixée au ${params.echeance}. ` +
    "Cet avis d'échéance ne constitue pas une quittance."
  );
}

/** Rappel utile imprimé en bas de document. */
export const RAPPEL_LOCATAIRE =
  "Conservez ce document : il peut vous être demandé comme justificatif de paiement de votre loyer.";

/** Avertissement sur la valeur du document. */
export function avertissement(type: TypeDocument): string | null {
  if (type === 'quittance') return null;
  if (type === 'recu') {
    return (
      'Ce document est un reçu de paiement partiel. Il ne constitue pas une quittance au sens ' +
      'de la loi du 6 juillet 1989, la quittance supposant un règlement intégral.'
    );
  }
  return (
    "Cet avis d'échéance est un document d'information. Il ne constitue pas une quittance."
  );
}
