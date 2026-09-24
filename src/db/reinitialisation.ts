/**
 * Remise à zéro : effacer **toutes** les données de l'application.
 *
 * Après cet appel, l'application se retrouve dans l'état d'une installation
 * neuve : plus aucun propriétaire, logement, bail, locataire, paiement ni
 * document, plus aucun réglage, et plus aucun PDF sur le téléphone. La base
 * elle-même est conservée — son schéma, sa version et ses migrations restent en
 * place — parce que la recréer exposerait les fichiers `-wal` et `-shm` à un
 * désaccord que rien ne réparerait. Vider les lignes suffit et ne peut pas
 * laisser une base illisible.
 *
 * Cet appel est **destructeur et irréversible**. Il n'est donc appelé que par un
 * écran qui a exigé le mot de confirmation (voir
 * `src/domain/reinitialisation.ts`), et il ne prend aucun paramètre : il n'y a
 * rien à choisir, rien à filtrer, rien à oublier.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { transaction } from './database';
import { TABLES_A_VIDER } from './schema';

/**
 * Le dossier des documents, tel que `render.ts` l'écrit.
 *
 * C'est **l'unique déclaration** de ce nom : `src/documents/stockage.ts` l'importe
 * pour y ranger les pièces du dossier — baux, états des lieux, inventaires — et
 * c'est ce qui garantit qu'elles partent avec le reste lors d'une remise à zéro.
 * Une seconde déclaration finirait par diverger, et les pièces resteraient sur
 * le téléphone alors que l'écran annonce que tout a été effacé.
 */
export const DOSSIER_DOCUMENTS = 'documents/';

export interface ResultatEffacement {
  /** Nombre de tables vidées. */
  tablesVidees: number;
  /**
   * Les PDF ont-ils pu être retirés du téléphone ?
   *
   * `false` signifie que les lignes sont bien effacées mais que des fichiers
   * subsistent, sans que rien ne les référence. L'écran le dit : annoncer une
   * remise à zéro complète alors que des documents traînent encore sur le
   * téléphone serait faux, et c'est exactement le genre de mensonge qu'un
   * utilisateur ne découvre qu'en fouillant son stockage.
   */
  fichiersEffaces: boolean;
}

/**
 * Efface toutes les données et rend compte de ce qui a été fait.
 *
 * L'ordre des deux étapes n'est pas indifférent :
 *
 *  1. **les lignes d'abord**, dans une seule transaction. Si elle échoue, rien
 *     n'a changé et l'application reste utilisable — l'utilisateur peut réessayer.
 *  2. **les fichiers ensuite.** Si cette étape échoue, il reste des PDF que plus
 *     aucune ligne ne référence : des orphelins, invisibles dans l'application,
 *     et que la prochaine remise à zéro effacera.
 *
 * L'ordre inverse serait pire : effacer les fichiers d'abord laisserait des
 * documents listés mais illisibles, c'est-à-dire des quittances que
 * l'application prétendrait encore pouvoir ouvrir.
 */
export async function effacerToutesLesDonnees(): Promise<ResultatEffacement> {
  await transaction(async (db) => {
    for (const table of TABLES_A_VIDER) {
      // Le nom de table vient d'une liste figée du schéma (`TABLES_A_VIDER`),
      // jamais d'une saisie : il ne peut donc pas être lié comme un paramètre,
      // et il n'en a pas besoin. La liste est un `readonly NomTable[]`, donc le
      // compilateur refuse d'y écrire autre chose qu'un nom de table connu.
      await db.runAsync(`DELETE FROM ${table}`);
    }
  });

  // Le dossier entier plutôt que les chemins un par un : c'est ce qui attrape
  // aussi les PDF qu'une ligne perdue avait déjà rendus orphelins. `deleteAsync`
  // supprime un dossier et tout son contenu (lire la documentation du paquet
  // installé), et l'option `idempotent` évite une erreur quand le dossier
  // n'existe pas — un utilisateur qui n'a jamais émis de document.
  const dossier = `${FileSystem.documentDirectory}${DOSSIER_DOCUMENTS}`;
  try {
    await FileSystem.deleteAsync(dossier, { idempotent: true });
    return { tablesVidees: TABLES_A_VIDER.length, fichiersEffaces: true };
  } catch {
    return { tablesVidees: TABLES_A_VIDER.length, fichiersEffaces: false };
  }
}
