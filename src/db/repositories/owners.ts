/**
 * Dépôt des propriétaires.
 *
 * Un propriétaire peut porter plusieurs logements. La suppression est refusée
 * tant qu'un logement lui est rattaché : effacer un bailleur par mégarde
 * laisserait des quittances orphelines.
 */

import { executer, lireToutes, lireUne } from '../database';
import { maintenantISO, nouvelId } from '../ids';
import type { Proprietaire } from '../../domain/types';

interface LigneProprietaire {
  id: string;
  nom: string;
  qualite: string | null;
  adresse: string;
  code_postal: string;
  ville: string;
  telephone: string | null;
  email: string | null;
  siret: string | null;
  notes: string | null;
  cree_le: string;
  modifie_le: string;
}

function versDomaine(ligne: LigneProprietaire): Proprietaire {
  return {
    id: ligne.id,
    nom: ligne.nom,
    qualite: ligne.qualite,
    adresse: ligne.adresse,
    codePostal: ligne.code_postal,
    ville: ligne.ville,
    telephone: ligne.telephone,
    email: ligne.email,
    siret: ligne.siret,
    notes: ligne.notes,
    creeLe: ligne.cree_le,
    modifieLe: ligne.modifie_le,
  };
}

export type SaisieProprietaire = Omit<Proprietaire, 'id' | 'creeLe' | 'modifieLe'>;

export async function listerProprietaires(): Promise<Proprietaire[]> {
  const lignes = await lireToutes<LigneProprietaire>(
    'SELECT * FROM proprietaires ORDER BY nom COLLATE NOCASE ASC',
  );
  return lignes.map(versDomaine);
}

export async function trouverProprietaire(id: string): Promise<Proprietaire | null> {
  const ligne = await lireUne<LigneProprietaire>(
    'SELECT * FROM proprietaires WHERE id = ?',
    [id],
  );
  return ligne ? versDomaine(ligne) : null;
}

export async function compterProprietaires(): Promise<number> {
  const ligne = await lireUne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM proprietaires',
  );
  return ligne?.total ?? 0;
}

export async function creerProprietaire(saisie: SaisieProprietaire): Promise<Proprietaire> {
  const id = nouvelId();
  const maintenant = maintenantISO();

  await executer(
    `INSERT INTO proprietaires
       (id, nom, qualite, adresse, code_postal, ville, telephone, email, siret, notes, cree_le, modifie_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      saisie.nom.trim(),
      saisie.qualite?.trim() || null,
      saisie.adresse.trim(),
      saisie.codePostal.trim(),
      saisie.ville.trim(),
      saisie.telephone?.trim() || null,
      saisie.email?.trim() || null,
      saisie.siret?.trim() || null,
      saisie.notes?.trim() || null,
      maintenant,
      maintenant,
    ],
  );

  const cree = await trouverProprietaire(id);
  if (!cree) throw new Error("Le propriétaire vient d'être créé mais reste introuvable.");
  return cree;
}

export async function modifierProprietaire(
  id: string,
  saisie: SaisieProprietaire,
): Promise<void> {
  await executer(
    `UPDATE proprietaires
        SET nom = ?, qualite = ?, adresse = ?, code_postal = ?, ville = ?,
            telephone = ?, email = ?, siret = ?, notes = ?, modifie_le = ?
      WHERE id = ?`,
    [
      saisie.nom.trim(),
      saisie.qualite?.trim() || null,
      saisie.adresse.trim(),
      saisie.codePostal.trim(),
      saisie.ville.trim(),
      saisie.telephone?.trim() || null,
      saisie.email?.trim() || null,
      saisie.siret?.trim() || null,
      saisie.notes?.trim() || null,
      maintenantISO(),
      id,
    ],
  );
}

export async function compterLogementsDuProprietaire(id: string): Promise<number> {
  const ligne = await lireUne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM logements WHERE proprietaire_id = ?',
    [id],
  );
  return ligne?.total ?? 0;
}

/**
 * Supprime un propriétaire.
 * Refusé s'il porte encore des logements : on ne casse pas l'historique.
 */
export async function supprimerProprietaire(id: string): Promise<void> {
  const logements = await compterLogementsDuProprietaire(id);
  if (logements > 0) {
    throw new Error(
      `Ce propriétaire possède encore ${logements} logement${logements > 1 ? 's' : ''}. ` +
        'Déplacez ou supprimez ces logements avant de le retirer.',
    );
  }
  await executer('DELETE FROM proprietaires WHERE id = ?', [id]);
}

/** Adresse complète sur une ligne, pour les documents. */
export function adresseProprietaireSurUneLigne(p: Proprietaire): string {
  return `${p.adresse}, ${p.codePostal} ${p.ville}`.trim();
}
