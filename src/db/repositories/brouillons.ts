/**
 * Dépôt des brouillons.
 *
 * Une seule ligne par couple (logement, type) : il n'y a jamais deux brouillons
 * de bail pour le même logement, le second remplaçant le premier. C'est la clé
 * primaire de la table qui le garantit, et non une précaution de ce fichier —
 * un écran qui écrirait deux fois ne peut donc pas produire deux brouillons.
 *
 * `enregistrerBrouillon` est un `INSERT ... ON CONFLICT DO UPDATE` : il sert
 * aussi bien la première écriture que la trentième, sans que l'appelant ait à
 * savoir laquelle c'est. Un écran qui devrait distinguer les deux finirait par
 * oublier un cas.
 *
 * Ce dépôt ne touche à aucun fichier : un brouillon n'a pas de PDF, il porte
 * des valeurs. Les photos d'un état des lieux vivront dans le dossier des
 * documents, et le brouillon ne portera que leurs chemins.
 */

import { executer, lireToutes, lireUne } from '../database';
import { maintenantISO } from '../ids';
import { analyserDonnees, serialiserDonnees } from '../../domain/brouillon';
import type { TypeBrouillon } from '../../domain/brouillon';

interface LigneBrouillon {
  logement_id: string;
  type: string;
  etape: string;
  donnees: string;
  maj_le: string;
}

export interface BrouillonEnregistre {
  logementId: string;
  type: TypeBrouillon;
  etape: string;
  donnees: Record<string, unknown>;
  majLe: string;
}

function versDomaine(l: LigneBrouillon): BrouillonEnregistre {
  return {
    logementId: l.logement_id,
    type: l.type as TypeBrouillon,
    etape: l.etape,
    donnees: analyserDonnees(l.donnees),
    majLe: l.maj_le,
  };
}

/** Le brouillon d'un logement pour un type donné, ou `null`. */
export async function lireBrouillon(
  logementId: string,
  type: TypeBrouillon,
): Promise<BrouillonEnregistre | null> {
  const ligne = await lireUne<LigneBrouillon>(
    'SELECT * FROM brouillons WHERE logement_id = ? AND type = ?',
    [logementId, type],
  );
  return ligne ? versDomaine(ligne) : null;
}

/** Tous les brouillons d'un logement, du plus récent au plus ancien. */
export async function brouillonsDuLogement(logementId: string): Promise<BrouillonEnregistre[]> {
  const lignes = await lireToutes<LigneBrouillon>(
    'SELECT * FROM brouillons WHERE logement_id = ? ORDER BY maj_le DESC',
    [logementId],
  );
  return lignes.map(versDomaine);
}

/**
 * Tous les brouillons, tous logements confondus.
 *
 * Sert à l'écran qui propose de reprendre une saisie interrompue : le bailleur
 * doit pouvoir retrouver un état des lieux commencé trois jours plus tôt sans
 * se souvenir du logement.
 */
export async function tousLesBrouillons(): Promise<BrouillonEnregistre[]> {
  const lignes = await lireToutes<LigneBrouillon>(
    'SELECT * FROM brouillons ORDER BY maj_le DESC',
  );
  return lignes.map(versDomaine);
}

export interface SaisieBrouillon {
  logementId: string;
  type: TypeBrouillon;
  etape: string;
  donnees: unknown;
}

/**
 * Enregistre un brouillon, en remplaçant celui qui existait.
 *
 * La date de dernière écriture est posée ici, jamais fournie par l'appelant :
 * un écran qui l'oublierait produirait un brouillon dont on ne saurait pas
 * dire s'il est récent, et la proposition de reprise le classerait au hasard.
 */
export async function enregistrerBrouillon(saisie: SaisieBrouillon): Promise<void> {
  await executer(
    `INSERT INTO brouillons (logement_id, type, etape, donnees, maj_le)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (logement_id, type)
     DO UPDATE SET etape = excluded.etape,
                   donnees = excluded.donnees,
                   maj_le = excluded.maj_le`,
    [
      saisie.logementId,
      saisie.type,
      saisie.etape,
      serialiserDonnees(saisie.donnees),
      maintenantISO(),
    ],
  );
}

/**
 * Retire un brouillon.
 *
 * Appelé après l'émission du document : un brouillon qui a abouti n'a plus
 * lieu d'être, et le laisser ferait proposer de reprendre un travail terminé.
 */
export async function supprimerBrouillon(logementId: string, type: TypeBrouillon): Promise<void> {
  await executer('DELETE FROM brouillons WHERE logement_id = ? AND type = ?', [logementId, type]);
}

/** Nombre de brouillons en cours, pour une pastille de comptage. */
export async function compterBrouillons(): Promise<number> {
  const ligne = await lireUne<{ total: number }>('SELECT COUNT(*) AS total FROM brouillons');
  return ligne?.total ?? 0;
}
