/**
 * Ce qu'il faut lire en base pour établir le bail d'un logement.
 *
 * Deux écrans en ont besoin — le formulaire guidé et la vérification avant
 * génération — et l'émetteur aussi. Cette lecture est donc écrite **une fois** :
 * deux copies finiraient par ne plus choisir la même période de loyer, et le
 * formulaire afficherait un montant que le document n'imprimerait pas.
 *
 * Toutes les erreurs sont en français et disent ce qui manque : l'écran les
 * affiche telles quelles.
 */

import {
  bailEnCours,
  periodesLoyerDuBail,
  titulairesDuBail,
  trouverLogement,
} from '../db/repositories/properties';
import { trouverProprietaire } from '../db/repositories/owners';
import { periodeLoyerApplicable } from '../domain/rent';
import { aujourdHui, depuisCle } from '../domain/period';
import type { Bail, Logement, PeriodeLoyer, Proprietaire, TitulaireBail } from '../domain/types';

export interface ContexteBail {
  logement: Logement;
  proprietaire: Proprietaire;
  /** La location en cours. Un bail sans locataire en place n'en a pas. */
  bail: Bail | null;
  /** Les titulaires, dans l'ordre d'affichage. */
  titulaires: TitulaireBail[];
  /** Le loyer applicable à la prise d'effet, ou `null` s'il n'est pas renseigné. */
  periode: PeriodeLoyer | null;
}

/**
 * Lit tout ce qui concerne le bail d'un logement.
 *
 * Lève une erreur explicite quand le logement ou son propriétaire est
 * introuvable : sans eux, le document ne peut ni nommer le bailleur, ni
 * désigner les lieux.
 */
export async function chargerContexteBail(logementId: string): Promise<ContexteBail> {
  const logement = await trouverLogement(logementId);
  if (!logement) {
    throw new Error("Ce logement n'existe plus : son bail ne peut pas être établi.");
  }

  const [proprietaire, bail] = await Promise.all([
    trouverProprietaire(logement.proprietaireId),
    bailEnCours(logement.id),
  ]);
  if (!proprietaire) {
    throw new Error(
      'Le propriétaire de ce logement est introuvable : le bail ne peut pas nommer le bailleur.',
    );
  }

  const titulaires = bail
    ? (await titulairesDuBail(bail.id)).slice().sort((a, b) => a.ordre - b.ordre)
    : [];
  const periodes = bail ? await periodesLoyerDuBail(bail.id) : [];

  const mois = depuisCle((bail?.dateEntree ?? aujourdHui()).slice(0, 7));
  const periode = mois ? periodeLoyerApplicable(periodes, mois) : null;

  return { logement, proprietaire, bail, titulaires, periode };
}
