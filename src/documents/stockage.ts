/**
 * Stockage des pièces du dossier documentaire.
 *
 * Les pièces vivent dans le **même dossier** que les quittances émises
 * (`documents/`), et c'est délibéré : ce dossier est celui que la remise à zéro
 * efface en entier. Un second dossier aurait demandé de penser à l'effacer
 * aussi, et c'est exactement l'oubli qui laisse des documents personnels sur le
 * téléphone après que l'écran a annoncé « tout a été effacé ».
 *
 * Le nom du dossier n'est pas recopié ici : il est importé de
 * `db/reinitialisation.ts`, où il est déclaré une seule fois, sous la garde de
 * `tests/reinitialisation-fichiers.test.ts` — qui vérifie qu'il correspond bien
 * à celui où `pdf/render.ts` écrit.
 *
 * Aucun nom de fichier n'est repris tel quel depuis le téléphone : les accents
 * et les espaces de certains noms se transforment en caractères parasites sur
 * Android. Le nom d'origine est conservé comme **titre** du document, où il est
 * lisible, et le fichier reçoit un nom fabriqué ici.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { DOSSIER_DOCUMENTS } from '../db/reinitialisation';
import type { TypePiece } from '../domain/types';

/** Préfixe de fichier par type, pour retrouver une pièce dans un gestionnaire. */
const PREFIXE: Record<TypePiece, string> = {
  bail: 'bail',
  edl_entree: 'etat-des-lieux-entree',
  edl_sortie: 'etat-des-lieux-sortie',
  inventaire: 'inventaire',
  autre: 'document',
};

/** Le dossier des documents, tel que la remise à zéro le connaît. */
export function dossierDocuments(): string {
  return `${FileSystem.documentDirectory}${DOSSIER_DOCUMENTS}`;
}

/**
 * Retire accents et caractères gênants d'un nom de fichier.
 * La même règle que `domain/numbering.ts` : les deux produisent des noms que
 * les gestionnaires de fichiers Android affichent correctement.
 */
export function assainir(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

/** Extension d'un fichier, avec le point, en minuscules. `.pdf` par défaut. */
export function extensionDe(uri: string, mimeType?: string | null): string {
  const depuisNom = /\.([a-zA-Z0-9]{2,5})$/.exec(uri);
  if (depuisNom) return `.${depuisNom[1].toLowerCase()}`;

  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/heic') return '.heic';
  return '.pdf';
}

/** Vrai si le fichier existe déjà. */
async function existe(chemin: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(chemin);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Un chemin libre, dans le dossier des documents.
 *
 * Deux pièces du même type, le même jour, avec le même titre — deux états des
 * lieux d'entrée successifs, par exemple — produiraient le même nom. On essaie
 * donc `-2`, `-3`… plutôt que d'écraser silencieusement la première : écraser un
 * document signé serait une perte de données sans avertissement.
 */
async function cheminLibre(nomBase: string, extension: string): Promise<string> {
  const dossier = dossierDocuments();
  let candidat = `${dossier}${nomBase}${extension}`;
  let rang = 2;
  while (await existe(candidat)) {
    candidat = `${dossier}${nomBase}-${rang}${extension}`;
    rang += 1;
    if (rang > 99) break;
  }
  return candidat;
}

export interface PieceCopiee {
  chemin: string;
  nomFichier: string;
}

/**
 * Un chemin libre pour une pièce, dans le dossier des documents.
 *
 * La règle de nommage vit ici et **une seule fois** : ranger un fichier venu du
 * téléphone et déposer un PDF que l'application vient de produire doivent
 * donner des noms de la même famille, sans quoi deux documents du même type
 * seraient introuvables dans un gestionnaire de fichiers.
 */
export async function cheminPourPiece(params: {
  type: TypePiece;
  titre: string;
  date: string;
  extension: string;
}): Promise<string> {
  const dossier = dossierDocuments();
  const info = await FileSystem.getInfoAsync(dossier);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  }

  const nomBase = `${PREFIXE[params.type]}_${params.date}_${assainir(params.titre) || 'piece'}`;
  return cheminLibre(nomBase, params.extension);
}

function nomDe(chemin: string, repli: string): string {
  return chemin.split('/').pop() ?? repli;
}

/**
 * Copie un fichier choisi par l'utilisateur dans le dossier des documents.
 *
 * On **copie** au lieu de référencer : le fichier d'origine peut vivre dans un
 * cache que le système efface, ou sur une carte amovible qu'on retire. Une pièce
 * du dossier doit rester lisible des années plus tard, sur un autre téléphone,
 * sans dépendre d'un fichier qu'on ne contrôle pas.
 */
export async function copierPiece(params: {
  sourceUri: string;
  type: TypePiece;
  titre: string;
  date: string;
  mimeType?: string | null;
}): Promise<PieceCopiee> {
  const extension = extensionDe(params.sourceUri, params.mimeType);
  const destination = await cheminPourPiece({
    type: params.type,
    titre: params.titre,
    date: params.date,
    extension,
  });

  await FileSystem.copyAsync({ from: params.sourceUri, to: destination });

  return { chemin: destination, nomFichier: nomDe(destination, params.titre) };
}

/**
 * Déplace un fichier produit par l'application dans le dossier des documents.
 *
 * Un PDF fraîchement imprimé vit dans un dossier temporaire que le système
 * nettoie : le déplacer le fait entrer dans le dossier que la remise à zéro
 * connaît, et qui survit au nettoyage. On **déplace** et non on copie — le
 * temporaire n'a plus d'objet une fois le document rangé.
 */
export async function deplacerPiece(params: {
  sourceUri: string;
  type: TypePiece;
  titre: string;
  date: string;
  extension?: string;
}): Promise<PieceCopiee> {
  const extension = params.extension ?? extensionDe(params.sourceUri);
  const destination = await cheminPourPiece({
    type: params.type,
    titre: params.titre,
    date: params.date,
    extension,
  });

  await FileSystem.moveAsync({ from: params.sourceUri, to: destination });

  return { chemin: destination, nomFichier: nomDe(destination, params.titre) };
}

/**
 * Retire un fichier du dossier des documents.
 *
 * `idempotent` : retirer une pièce dont le fichier a déjà disparu ne doit pas
 * faire échouer la suppression de la ligne. L'utilisateur veut que la pièce
 * disparaisse de la liste, et elle disparaîtra.
 */
export async function supprimerFichierPiece(chemin: string): Promise<boolean> {
  if (!chemin) return false;
  try {
    await FileSystem.deleteAsync(chemin, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}

/** Taille lisible d'un fichier, ou `null` s'il est absent. */
export async function tailleLisible(chemin: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(chemin);
    if (!info.exists || !('size' in info) || typeof info.size !== 'number') return null;

    const octets = info.size;
    if (octets < 1024) return `${octets} o`;
    if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
    return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
  } catch {
    return null;
  }
}

/** Le titre proposé par défaut, à partir du nom du fichier choisi. */
export function titreDepuisNom(nom: string): string {
  return nom
    .replace(/\.[a-zA-Z0-9]{2,5}$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
