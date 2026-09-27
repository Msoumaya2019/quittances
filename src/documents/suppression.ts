/**
 * Le geste qui fait disparaître un document.
 *
 * Il vit ici, en un seul exemplaire, parce que trois écrans le proposent —
 * l'onglet DOCUMENTS, le dossier d'un logement, l'aperçu d'une quittance — et
 * qu'un geste recopié trois fois finit par diverger. La divergence serait ici
 * coûteuse : c'est le seul endroit de l'application qui efface un document, donc
 * le seul endroit où l'ordre des deux opérations compte.
 *
 * **La ligne d'abord, le fichier ensuite.** L'ordre n'est pas indifférent :
 * effacer le fichier d'abord laisserait un document listé mais illisible, et
 * l'application prétendrait encore pouvoir l'ouvrir — le pire des deux états,
 * puisque rien ne le signalerait. Dans l'autre sens, un effacement de fichier qui
 * échoue laisse un orphelin invisible sur le téléphone : de la place perdue, mais
 * aucune promesse rompue.
 *
 * **Ce module ne touche à rien d'autre.** Il n'importe ni les paiements, ni les
 * baux, ni les logements. Supprimer une quittance retire la preuve d'un
 * règlement, jamais le règlement : le mois reste réglé, et une nouvelle
 * quittance pourra être produite. C'est la promesse que
 * `tests/suppression-document.test.ts` garde, en exigeant que ce fichier ne
 * nomme aucun dépôt de paiement.
 */

import { supprimerDocument } from '@/db/repositories/documents';
import { supprimerPiece } from '@/db/repositories/pieces';
import { supprimerFichier } from '@/documents/stockage';
import type { ElementDossier } from '@/domain/dossier';

/**
 * Retire un document du dossier : sa ligne, puis son fichier.
 *
 * Le chemin du fichier vient de l'élément affiché, et non d'une relecture en
 * base : l'élément est ce que le bailleur a sous les yeux au moment où il
 * confirme, donc ce qu'il supprime. Le fichier peut avoir déjà disparu du
 * téléphone — `supprimerFichier` est idempotent, et la ligne disparaîtra quand
 * même.
 */
export async function supprimerElement(element: ElementDossier): Promise<void> {
  if (element.origine === 'document') {
    await supprimerDocument(element.id);
  } else {
    await supprimerPiece(element.id);
  }

  if (element.cheminFichier) await supprimerFichier(element.cheminFichier);
}
