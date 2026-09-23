/**
 * Dépôt des documents émis.
 *
 * Chaque quittance enregistrée conserve une **copie figée** des identités et des
 * montants tels qu'ils étaient au moment de l'émission. Un changement de loyer
 * ou de locataire ne réécrit donc jamais un document déjà remis.
 */

import { executer, lireToutes, lireUne } from '../database';
import { maintenantISO, nouvelId } from '../ids';
import {
  nomFichierDocument,
  numeroDocument,
  rangSuivant,
} from '../../domain/numbering';
import { libelleLong, depuisCle } from '../../domain/period';
import type { Document, ModeleDocument, TypeDocument } from '../../domain/types';

interface LigneDocument {
  id: string;
  numero: string;
  type: string;
  logement_id: string;
  bail_id: string;
  periode: string;
  logement_nom: string;
  proprietaire_nom: string;
  proprietaire_adresse: string;
  logement_adresse: string;
  titulaires: string;
  loyer: number;
  charges: number;
  total: number;
  dates_paiement: string;
  date_emission: string;
  modele: string;
  chemin_fichier: string;
  signature_incluse: number;
  cree_le: string;
}

function versDomaine(l: LigneDocument): Document {
  let titulaires: string[] = [];
  let datesPaiement: string[] = [];

  try {
    titulaires = JSON.parse(l.titulaires) as string[];
  } catch {
    titulaires = [];
  }
  try {
    datesPaiement = JSON.parse(l.dates_paiement) as string[];
  } catch {
    datesPaiement = [];
  }

  return {
    id: l.id,
    numero: l.numero,
    type: l.type as TypeDocument,
    logementId: l.logement_id,
    bailId: l.bail_id,
    periode: l.periode,
    logementNom: l.logement_nom,
    proprietaireNom: l.proprietaire_nom,
    proprietaireAdresse: l.proprietaire_adresse,
    logementAdresse: l.logement_adresse,
    titulaires,
    loyer: l.loyer,
    charges: l.charges,
    total: l.total,
    datesPaiement,
    dateEmission: l.date_emission,
    modele: l.modele as ModeleDocument,
    cheminFichier: l.chemin_fichier,
    signatureIncluse: l.signature_incluse === 1,
    creeLe: l.cree_le,
  };
}

export async function trouverDocument(id: string): Promise<Document | null> {
  const ligne = await lireUne<LigneDocument>('SELECT * FROM documents WHERE id = ?', [id]);
  return ligne ? versDomaine(ligne) : null;
}

export async function documentsDuLogement(logementId: string): Promise<Document[]> {
  const lignes = await lireToutes<LigneDocument>(
    'SELECT * FROM documents WHERE logement_id = ? ORDER BY periode DESC, cree_le DESC',
    [logementId],
  );
  return lignes.map(versDomaine);
}

export async function documentsDuBail(bailId: string): Promise<Document[]> {
  const lignes = await lireToutes<LigneDocument>(
    'SELECT * FROM documents WHERE bail_id = ? ORDER BY periode DESC, cree_le DESC',
    [bailId],
  );
  return lignes.map(versDomaine);
}

/** Document existant pour un bail et un mois, quel que soit son type. */
export async function documentDuMois(
  bailId: string,
  periode: string,
): Promise<Document | null> {
  const ligne = await lireUne<LigneDocument>(
    `SELECT * FROM documents
      WHERE bail_id = ? AND periode = ?
      ORDER BY CASE type WHEN 'quittance' THEN 0 WHEN 'recu' THEN 1 ELSE 2 END,
               cree_le DESC
      LIMIT 1`,
    [bailId, periode],
  );
  return ligne ? versDomaine(ligne) : null;
}

/** Tous les documents, du plus récent au plus ancien. */
export async function tousLesDocuments(): Promise<Document[]> {
  const lignes = await lireToutes<LigneDocument>(
    'SELECT * FROM documents ORDER BY date_emission DESC, cree_le DESC',
  );
  return lignes.map(versDomaine);
}

export async function compterDocumentsParType(): Promise<Record<TypeDocument, number>> {
  const lignes = await lireToutes<{ type: string; total: number }>(
    'SELECT type, COUNT(*) AS total FROM documents GROUP BY type',
  );

  const resultat: Record<TypeDocument, number> = {
    quittance: 0,
    recu: 0,
    avis_echeance: 0,
  };
  for (const ligne of lignes) {
    if (ligne.type in resultat) {
      resultat[ligne.type as TypeDocument] = ligne.total;
    }
  }
  return resultat;
}

/** Numéros déjà attribués pour un type et une année. */
async function numerosExistants(type: TypeDocument, annee: number): Promise<string[]> {
  const lignes = await lireToutes<{ numero: string }>(
    `SELECT numero FROM documents
      WHERE type = ? AND substr(date_emission, 1, 4) = ?`,
    [type, String(annee)],
  );
  return lignes.map((l) => l.numero);
}

/**
 * Réserve le prochain numéro disponible pour un type et une année.
 * Le calcul se fait sur la base existante, donc un redémarrage de l'application
 * ne peut pas produire deux fois le même numéro.
 */
export async function prochainNumero(
  type: TypeDocument,
  annee: number,
): Promise<string> {
  const existants = await numerosExistants(type, annee);
  return numeroDocument(type, annee, rangSuivant(existants, type, annee));
}

export interface SaisieDocument {
  numero: string;
  type: TypeDocument;
  logementId: string;
  bailId: string;
  periode: string;
  logementNom: string;
  proprietaireNom: string;
  proprietaireAdresse: string;
  logementAdresse: string;
  titulaires: string[];
  loyer: number;
  charges: number;
  total: number;
  datesPaiement: string[];
  dateEmission: string;
  modele: ModeleDocument;
  cheminFichier: string;
  signatureIncluse: boolean;
}

export async function enregistrerDocument(saisie: SaisieDocument): Promise<Document> {
  const id = nouvelId();

  await executer(
    `INSERT INTO documents
       (id, numero, type, logement_id, bail_id, periode, logement_nom, proprietaire_nom,
        proprietaire_adresse, logement_adresse, titulaires, loyer, charges, total,
        dates_paiement, date_emission, modele, chemin_fichier, signature_incluse, cree_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      saisie.numero,
      saisie.type,
      saisie.logementId,
      saisie.bailId,
      saisie.periode,
      saisie.logementNom,
      saisie.proprietaireNom,
      saisie.proprietaireAdresse,
      saisie.logementAdresse,
      JSON.stringify(saisie.titulaires),
      saisie.loyer,
      saisie.charges,
      saisie.total,
      JSON.stringify(saisie.datesPaiement),
      saisie.dateEmission,
      saisie.modele,
      saisie.cheminFichier,
      saisie.signatureIncluse ? 1 : 0,
      maintenantISO(),
    ],
  );

  const cree = await trouverDocument(id);
  if (!cree) throw new Error("Le document n'a pas pu être relu après enregistrement.");
  return cree;
}

export async function mettreAJourCheminFichier(
  id: string,
  cheminFichier: string,
): Promise<void> {
  await executer('UPDATE documents SET chemin_fichier = ? WHERE id = ?', [cheminFichier, id]);
}

export async function supprimerDocument(id: string): Promise<void> {
  await executer('DELETE FROM documents WHERE id = ?', [id]);
}

/** Nom de fichier suggéré pour un document à émettre. */
export function nomFichierPour(params: {
  type: TypeDocument;
  numero: string;
  logementNom: string;
  periode: string;
}): string {
  const p = depuisCle(params.periode);
  const libelle = p ? libelleLong(p) : params.periode;

  return nomFichierDocument({
    numero: params.numero,
    logementNom: params.logementNom,
    periodeLibelle: libelle,
  });
}
