/**
 * Dépôt des paiements.
 *
 * Aucune opération ne permet d'écrire un statut « payé » : on n'enregistre que
 * des encaissements réels. Le statut affiché est toujours recalculé à partir
 * d'eux. C'est la garantie qu'une quittance correspond à un paiement effectif.
 */

import { executer, lireToutes, lireUne } from '../database';
import { maintenantISO, nouvelId } from '../ids';
import type { ModePaiement, Paiement } from '../../domain/types';

interface LignePaiement {
  id: string;
  bail_id: string;
  periode: string;
  montant: number;
  date_paiement: string;
  mode: string;
  note: string | null;
  cree_le: string;
}

function versDomaine(l: LignePaiement): Paiement {
  return {
    id: l.id,
    bailId: l.bail_id,
    periode: l.periode,
    montant: l.montant,
    datePaiement: l.date_paiement,
    mode: l.mode as ModePaiement,
    note: l.note,
    creeLe: l.cree_le,
  };
}

export async function paiementsDuBail(bailId: string): Promise<Paiement[]> {
  const lignes = await lireToutes<LignePaiement>(
    'SELECT * FROM paiements WHERE bail_id = ? ORDER BY periode DESC, date_paiement ASC',
    [bailId],
  );
  return lignes.map(versDomaine);
}

export async function paiementsDuBailPourMois(
  bailId: string,
  periode: string,
): Promise<Paiement[]> {
  const lignes = await lireToutes<LignePaiement>(
    'SELECT * FROM paiements WHERE bail_id = ? AND periode = ? ORDER BY date_paiement ASC, cree_le ASC',
    [bailId, periode],
  );
  return lignes.map(versDomaine);
}

/** Tous les paiements, pour les calculs globaux du tableau de bord. */
export async function tousLesPaiements(): Promise<Paiement[]> {
  const lignes = await lireToutes<LignePaiement>(
    'SELECT * FROM paiements ORDER BY periode DESC, date_paiement ASC',
  );
  return lignes.map(versDomaine);
}

/** Paiements regroupés par identifiant de bail. */
export async function paiementsParBail(): Promise<Map<string, Paiement[]>> {
  const lignes = await lireToutes<LignePaiement>(
    'SELECT * FROM paiements ORDER BY bail_id ASC, periode ASC, date_paiement ASC',
  );

  const parBail = new Map<string, Paiement[]>();
  for (const ligne of lignes) {
    const paiement = versDomaine(ligne);
    const existants = parBail.get(paiement.bailId);
    if (existants) existants.push(paiement);
    else parBail.set(paiement.bailId, [paiement]);
  }
  return parBail;
}

export interface SaisiePaiement {
  bailId: string;
  /** Mois soldé, clé `AAAA-MM`. */
  periode: string;
  montant: number;
  datePaiement: string;
  mode: ModePaiement;
  note?: string | null;
}

/**
 * Enregistre un encaissement.
 * Le montant doit être strictement positif : un paiement nul ou négatif
 * n'existe pas, et serait un moyen détourné de manipuler un solde.
 */
export async function enregistrerPaiement(saisie: SaisiePaiement): Promise<Paiement> {
  if (!Number.isInteger(saisie.montant) || saisie.montant <= 0) {
    throw new Error('Le montant du paiement doit être supérieur à zéro.');
  }
  if (!/^\d{4}-\d{2}$/.test(saisie.periode)) {
    throw new Error(`Mois invalide : ${saisie.periode}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saisie.datePaiement)) {
    throw new Error(`Date invalide : ${saisie.datePaiement}`);
  }

  const id = nouvelId();
  await executer(
    `INSERT INTO paiements (id, bail_id, periode, montant, date_paiement, mode, note, cree_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      saisie.bailId,
      saisie.periode,
      saisie.montant,
      saisie.datePaiement,
      saisie.mode,
      saisie.note?.trim() || null,
      maintenantISO(),
    ],
  );

  const cree = await lireUne<LignePaiement>('SELECT * FROM paiements WHERE id = ?', [id]);
  if (!cree) throw new Error("Le paiement n'a pas pu être relu après enregistrement.");
  return versDomaine(cree);
}

export async function modifierPaiement(
  id: string,
  champs: Partial<Omit<SaisiePaiement, 'bailId' | 'periode'>>,
): Promise<void> {
  const existant = await lireUne<LignePaiement>('SELECT * FROM paiements WHERE id = ?', [id]);
  if (!existant) throw new Error('Paiement introuvable.');

  const montant = champs.montant ?? existant.montant;
  if (!Number.isInteger(montant) || montant <= 0) {
    throw new Error('Le montant du paiement doit être supérieur à zéro.');
  }

  await executer(
    `UPDATE paiements
        SET montant = ?, date_paiement = ?, mode = ?, note = ?
      WHERE id = ?`,
    [
      montant,
      champs.datePaiement ?? existant.date_paiement,
      champs.mode ?? existant.mode,
      (champs.note ?? existant.note)?.trim() || null,
      id,
    ],
  );
}

/**
 * Supprime un paiement.
 *
 * Attention : si une quittance a été émise pour ce mois, la supprimer rendrait
 * le document infondé. On refuse donc tant qu'un document de type quittance ou
 * reçu existe pour ce mois, et on invite à traiter le cas explicitement.
 */
export async function supprimerPaiement(id: string): Promise<void> {
  const paiement = await lireUne<LignePaiement>('SELECT * FROM paiements WHERE id = ?', [id]);
  if (!paiement) return;

  const document = await lireUne<{ numero: string; type: string }>(
    `SELECT numero, type FROM documents
      WHERE bail_id = ? AND periode = ? AND type IN ('quittance', 'recu')
      LIMIT 1`,
    [paiement.bail_id, paiement.periode],
  );

  if (document) {
    throw new Error(
      `Un document (${document.numero}) a déjà été émis pour ce mois. ` +
        'Retirez d’abord ce document si vous devez corriger le paiement.',
    );
  }

  await executer('DELETE FROM paiements WHERE id = ?', [id]);
}

/** Total encaissé sur un intervalle de mois, toutes locations confondues. */
export async function totalEncaisseEntre(
  periodeDebut: string,
  periodeFin: string,
): Promise<number> {
  const ligne = await lireUne<{ total: number | null }>(
    'SELECT SUM(montant) AS total FROM paiements WHERE periode BETWEEN ? AND ?',
    [periodeDebut, periodeFin],
  );
  return ligne?.total ?? 0;
}
