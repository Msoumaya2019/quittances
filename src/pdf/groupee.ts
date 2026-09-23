/**
 * Génération groupée de documents.
 *
 * On émet les documents **un par un**, en collectant les échecs plutôt qu'en
 * interrompant tout : sur dix logements, une erreur sur l'un d'eux ne doit pas
 * priver le bailleur des neuf autres quittances.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { emettreDocument, ErreurEmission } from './render';
import { documentExiste } from './partage';
import {
  base64VersOctets,
  chaineVersOctets,
  concatener as concatenerOctets,
  crc32,
  octetsVersBase64,
} from './encodage';
import { libelleLong, depuisCle } from '../domain/period';
import type { DocumentEmissible } from '../domain/payments';
import type { Document } from '../domain/types';

export interface DemandeLigne {
  logementId: string;
  periode: string;
  /** `DocumentEmissible`, pas `TypeDocument` : la série n'émet que des quittances. */
  type: DocumentEmissible;
}

export interface ResultatEmission {
  logementId: string;
  periode: string;
  succes: boolean;
  document?: Document;
  /** Message lisible expliquant l'échec. */
  erreur?: string;
}

export interface BilanGeneration {
  resultats: ResultatEmission[];
  reussis: Document[];
  echecs: ResultatEmission[];
  dureeMs: number;
}

/**
 * Émet une liste de documents, en série.
 *
 * La série est volontaire : produire plusieurs PDF simultanément sollicite
 * fortement la mémoire sur les appareils modestes, et rend les erreurs
 * difficiles à attribuer.
 */
export async function genererEnSerie(
  demandes: DemandeLigne[],
  onProgression?: (fait: number, total: number) => void,
): Promise<BilanGeneration> {
  const debut = Date.now();
  const resultats: ResultatEmission[] = [];

  for (const [index, demande] of demandes.entries()) {
    try {
      const document = await emettreDocument(demande);
      resultats.push({
        logementId: demande.logementId,
        periode: demande.periode,
        succes: true,
        document,
      });
    } catch (erreur) {
      resultats.push({
        logementId: demande.logementId,
        periode: demande.periode,
        succes: false,
        erreur:
          erreur instanceof ErreurEmission
            ? erreur.message
            : "La génération a échoué pour une raison inattendue.",
      });
    }

    onProgression?.(index + 1, demandes.length);
  }

  const reussis = resultats
    .filter((r) => r.succes && r.document)
    .map((r) => r.document as Document);
  const echecs = resultats.filter((r) => !r.succes);

  return {
    resultats,
    reussis,
    echecs,
    dureeMs: Date.now() - debut,
  };
}

/**
 * Regroupe plusieurs PDF dans une archive ZIP.
 *
 * Le ZIP est produit sans dépendance externe : les fichiers PDF sont déjà
 * compressés, donc on les **stocke** dans l'archive plutôt que de les
 * recompresser. Le format « store » est simple à écrire, et évite d'ajouter une
 * bibliothèque de compression pour un gain nul.
 */
export async function creerArchiveZip(
  documents: Document[],
  nomArchive: string,
): Promise<string> {
  if (documents.length === 0) {
    throw new Error('Aucun document à regrouper dans l’archive.');
  }

  const morceaux: Uint8Array[] = [];
  const entrees: { nom: string; donnees: Uint8Array; crc: number; offset: number }[] = [];

  // En-tête de chaque fichier local, puis son contenu.
  let offset = 0;
  for (const document of documents) {
    if (!(await documentExiste(document.cheminFichier))) continue;

    const base64 = await FileSystem.readAsStringAsync(document.cheminFichier, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const donnees = base64VersOctets(base64);
    const crc = crc32(donnees);
    const nom = nomEntreeZip(document);

    const entete = enteteFichierLocal(nom, donnees.length, crc);
    entrees.push({ nom, donnees, crc, offset: offset + entete.length });

    morceaux.push(entete, donnees);
    offset += entete.length + donnees.length;
  }

  if (entrees.length === 0) {
    throw new Error('Aucun des fichiers de cette sélection n’est disponible sur l’appareil.');
  }

  // Répertoire central, puis fin du répertoire central.
  const tailleDossierCentral = entrees.reduce(
    (total, entree) => total + enteteDossierCentral(entree.nom, entree.donnees.length, entree.crc, entree.offset).length,
    0,
  );
  const decalageDossier = offset;

  for (const entree of entrees) {
    morceaux.push(
      enteteDossierCentral(entree.nom, entree.donnees.length, entree.crc, entree.offset),
    );
  }

  morceaux.push(finDossierCentral(entrees.length, tailleDossierCentral, decalageDossier));

  const octets = concatenerOctets(morceaux);
  const chemin = `${FileSystem.cacheDirectory}${nomArchive}`;
  await FileSystem.writeAsStringAsync(chemin, octetsVersBase64(octets), {
    encoding: FileSystem.EncodingType.Base64,
  });

  return chemin;
}

/** Partage une archive ZIP à l'aide de la feuille native. */
export async function partagerArchive(chemin: string): Promise<boolean> {
  if (!(await documentExiste(chemin))) return false;
  if (!(await Sharing.isAvailableAsync())) return false;

  await Sharing.shareAsync(chemin, {
    mimeType: 'application/zip',
    dialogTitle: 'Partager les quittances',
    UTI: 'public.zip-archive',
  });
  return true;
}

// ---------------------------------------------------------------------------
// Écriture du format ZIP (méthode « store », sans compression)
// ---------------------------------------------------------------------------

function nomEntreeZip(document: Document): string {
  const fichier = document.cheminFichier.split('/').pop() ?? `${document.numero}.pdf`;
  return fichier;
}

function enteteFichierLocal(nom: string, taille: number, crc: number): Uint8Array {
  const nomOctets = chaineVersOctets(nom);
  const entete = new Uint8Array(30 + nomOctets.length);
  const vue = new DataView(entete.buffer);

  vue.setUint32(0, 0x04034b50, true); // signature
  vue.setUint16(4, 20, true); // version nécessaire
  vue.setUint16(6, 0x0800, true); // indicateur : noms en UTF-8
  vue.setUint16(8, 0, true); // méthode : stockage
  vue.setUint16(10, 0, true); // heure
  vue.setUint16(12, 0, true); // date
  vue.setUint32(14, crc, true);
  vue.setUint32(18, taille, true); // taille compressée
  vue.setUint32(22, taille, true); // taille réelle
  vue.setUint16(26, nomOctets.length, true);
  vue.setUint16(28, 0, true); // champ supplémentaire
  entete.set(nomOctets, 30);

  return entete;
}

function enteteDossierCentral(
  nom: string,
  taille: number,
  crc: number,
  offset: number,
): Uint8Array {
  const nomOctets = chaineVersOctets(nom);
  const entete = new Uint8Array(46 + nomOctets.length);
  const vue = new DataView(entete.buffer);

  vue.setUint32(0, 0x02014b50, true); // signature
  vue.setUint16(4, 20, true); // version d'écriture
  vue.setUint16(6, 20, true); // version nécessaire
  vue.setUint16(8, 0x0800, true); // noms en UTF-8
  vue.setUint16(10, 0, true); // stockage
  vue.setUint16(12, 0, true);
  vue.setUint16(14, 0, true);
  vue.setUint32(16, crc, true);
  vue.setUint32(20, taille, true);
  vue.setUint32(24, taille, true);
  vue.setUint16(28, nomOctets.length, true);
  vue.setUint16(30, 0, true); // extra
  vue.setUint16(32, 0, true); // commentaire
  vue.setUint16(34, 0, true); // numéro de disque
  vue.setUint16(36, 0, true); // attributs internes
  vue.setUint32(38, 0, true); // attributs externes
  vue.setUint32(42, offset, true);
  entete.set(nomOctets, 46);

  return entete;
}

function finDossierCentral(nombre: number, tailleDossier: number, decalage: number): Uint8Array {
  const fin = new Uint8Array(22);
  const vue = new DataView(fin.buffer);

  vue.setUint32(0, 0x06054b50, true);
  vue.setUint16(4, 0, true);
  vue.setUint16(6, 0, true);
  vue.setUint16(8, nombre, true);
  vue.setUint16(10, nombre, true);
  vue.setUint32(12, tailleDossier, true);
  vue.setUint32(16, decalage, true);
  vue.setUint16(20, 0, true);

  return fin;
}

export function nomArchivePourMois(periode: string): string {
  const p = depuisCle(periode);
  const libelle = p ? libelleLong(p) : periode;
  const nettoye = libelle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
  return `quittances-${nettoye}.zip`;
}
