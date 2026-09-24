/**
 * Dépôt des pièces du dossier documentaire.
 *
 * Une pièce est un document **établi** — bail, état des lieux, inventaire — par
 * opposition aux documents **émis** que porte `documents.ts`, qui sont numérotés
 * et attestent un règlement. Les deux dépôts restent séparés parce que leurs
 * règles de création n'ont rien de commun : une quittance ne s'émet que si le
 * mois est intégralement réglé, un état des lieux s'établit quand le bailleur le
 * décide.
 *
 * Aucune pièce n'est jamais supprimée par le dépôt quand un locataire part : la
 * clôture d'un bail ne touche pas au dossier. C'est ce qui permet de rouvrir,
 * des années plus tard, l'état des lieux d'entrée d'un locataire dont la
 * location est terminée.
 */

import { executer, lireToutes, lireUne } from '../database';
import { maintenantISO, nouvelId } from '../ids';
import type { PieceDossier, TypePiece } from '../../domain/types';

interface LignePiece {
  id: string;
  logement_id: string;
  bail_id: string | null;
  type: string;
  titre: string;
  date_document: string;
  chemin_fichier: string;
  donnees: string;
  cree_le: string;
  modifie_le: string;
}

function versDomaine(l: LignePiece): PieceDossier {
  return {
    id: l.id,
    logementId: l.logement_id,
    bailId: l.bail_id,
    type: l.type as TypePiece,
    titre: l.titre,
    dateDocument: l.date_document,
    cheminFichier: l.chemin_fichier,
    donnees: l.donnees,
    creeLe: l.cree_le,
    modifieLe: l.modifie_le,
  };
}

export async function trouverPiece(id: string): Promise<PieceDossier | null> {
  const ligne = await lireUne<LignePiece>('SELECT * FROM pieces WHERE id = ?', [id]);
  return ligne ? versDomaine(ligne) : null;
}

/** Les pièces d'un logement, de la plus récente à la plus ancienne. */
export async function piecesDuLogement(logementId: string): Promise<PieceDossier[]> {
  const lignes = await lireToutes<LignePiece>(
    'SELECT * FROM pieces WHERE logement_id = ? ORDER BY date_document DESC, cree_le DESC',
    [logementId],
  );
  return lignes.map(versDomaine);
}

/** Les pièces rattachées à une location donnée. */
export async function piecesDuBail(bailId: string): Promise<PieceDossier[]> {
  const lignes = await lireToutes<LignePiece>(
    'SELECT * FROM pieces WHERE bail_id = ? ORDER BY date_document DESC, cree_le DESC',
    [bailId],
  );
  return lignes.map(versDomaine);
}

/**
 * Toutes les pièces, tous logements confondus.
 *
 * Sert à l'onglet DOCUMENTS, qui répond à la question « où est passé ce
 * document ? » quand le logement concerné n'est plus connu.
 */
export async function toutesLesPieces(): Promise<PieceDossier[]> {
  const lignes = await lireToutes<LignePiece>(
    'SELECT * FROM pieces ORDER BY date_document DESC, cree_le DESC',
  );
  return lignes.map(versDomaine);
}

export interface SaisiePiece {
  logementId: string;
  bailId?: string | null;
  type: TypePiece;
  titre: string;
  dateDocument: string;
  cheminFichier?: string;
  /** Contenu structuré, déjà sérialisé en JSON. `'{}'` par défaut. */
  donnees?: string;
}

export async function enregistrerPiece(saisie: SaisiePiece): Promise<PieceDossier> {
  const id = nouvelId();
  const maintenant = maintenantISO();

  await executer(
    `INSERT INTO pieces
       (id, logement_id, bail_id, type, titre, date_document, chemin_fichier, donnees,
        cree_le, modifie_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      saisie.logementId,
      saisie.bailId ?? null,
      saisie.type,
      saisie.titre,
      saisie.dateDocument,
      saisie.cheminFichier ?? '',
      saisie.donnees ?? '{}',
      maintenant,
      maintenant,
    ],
  );

  const cree = await trouverPiece(id);
  if (!cree) throw new Error("La pièce n'a pas pu être relue après enregistrement.");
  return cree;
}

/**
 * Met à jour les champs fournis.
 *
 * `modifie_le` est toujours réécrit, même si rien d'autre ne change : c'est lui
 * qui datera une correction ultérieure, et un document signé corrigé doit
 * pouvoir être distingué de l'original.
 */
export async function mettreAJourPiece(
  id: string,
  partiel: Partial<Omit<SaisiePiece, 'logementId'>>,
): Promise<PieceDossier | null> {
  const champs: string[] = [];
  const valeurs: (string | null)[] = [];

  if (partiel.bailId !== undefined) {
    champs.push('bail_id = ?');
    valeurs.push(partiel.bailId);
  }
  if (partiel.type !== undefined) {
    champs.push('type = ?');
    valeurs.push(partiel.type);
  }
  if (partiel.titre !== undefined) {
    champs.push('titre = ?');
    valeurs.push(partiel.titre);
  }
  if (partiel.dateDocument !== undefined) {
    champs.push('date_document = ?');
    valeurs.push(partiel.dateDocument);
  }
  if (partiel.cheminFichier !== undefined) {
    champs.push('chemin_fichier = ?');
    valeurs.push(partiel.cheminFichier);
  }
  if (partiel.donnees !== undefined) {
    champs.push('donnees = ?');
    valeurs.push(partiel.donnees);
  }

  if (champs.length > 0) {
    champs.push('modifie_le = ?');
    valeurs.push(maintenantISO());
    await executer(`UPDATE pieces SET ${champs.join(', ')} WHERE id = ?`, [...valeurs, id]);
  }

  return trouverPiece(id);
}

/**
 * Supprime la ligne d'une pièce.
 *
 * Le fichier PDF n'est pas retiré ici : c'est l'appelant qui décide, et il le
 * fait après coup. Effacer le fichier d'abord laisserait une pièce listée mais
 * illisible — le même piège que pour les quittances.
 */
export async function supprimerPiece(id: string): Promise<void> {
  await executer('DELETE FROM pieces WHERE id = ?', [id]);
}

/** Nombre de pièces par type, pour les pastilles de l'onglet DOCUMENTS. */
export async function compterPiecesParType(): Promise<Record<TypePiece, number>> {
  const lignes = await lireToutes<{ type: string; total: number }>(
    'SELECT type, COUNT(*) AS total FROM pieces GROUP BY type',
  );

  const resultat: Record<TypePiece, number> = {
    bail: 0,
    edl_entree: 0,
    edl_sortie: 0,
    inventaire: 0,
    autre: 0,
  };
  for (const ligne of lignes) {
    if (ligne.type in resultat) resultat[ligne.type as TypePiece] = ligne.total;
  }
  return resultat;
}
