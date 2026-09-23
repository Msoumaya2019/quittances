/**
 * Fonctions de chargement ciblées, utilisées par la génération de documents.
 *
 * Ce module existe pour éviter que `render.ts` importe toute la couche de
 * dépôts : on y expose seulement ce dont l'émission a besoin.
 */

import { paiementsDuBail } from '../db/repositories/payments';
import type { Paiement } from '../domain/types';

/** Tous les paiements d'un bail, du plus ancien au plus récent. */
export async function paiementsPourBail(bailId: string): Promise<Paiement[]> {
  return paiementsDuBail(bailId);
}
