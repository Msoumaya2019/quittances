/**
 * Les photos d'un état des lieux : prise de vue, compression, rangement.
 *
 * Ce module est le **seul** à parler à la caméra et à la galerie. Il est donc
 * impur par nécessité, et tout ce qui peut être éprouvé sans appareil vit
 * ailleurs : la règle de nommage dans `stockage.ts`, la conversion en URI de
 * données dans `pdf/trace.ts`.
 *
 * Trois règles gouvernent ce fichier :
 *
 *  1. **La photo est rangée immédiatement.** L'article 2, 1°, h) du décret
 *     demande une description « illustrée d'images » ; une photo qui vivrait
 *     dans le cache de l'appareil photo disparaîtrait au premier nettoyage du
 *     système. On range donc le fichier dans `documents/photos/`, que la remise
 *     à zéro connaît, et l'état des lieux n'enregistre qu'un chemin — jamais le
 *     contenu, qui alourdirait chaque écriture de brouillon de plusieurs
 *     mégaoctets.
 *  2. **Elle est compressée pour être imprimable.** Une photo de téléphone fait
 *     plusieurs mégaoctets ; vingt d'entre elles feraient un PDF que ni
 *     l'impression ni le partage ne digèrent. On ramène la largeur à
 *     `LARGEUR_PHOTO_PX` et on réencode en JPEG. La compression est **mesurée**
 *     et rendue à l'appelant, qui peut l'afficher : « compressée » est une
 *     affirmation, et une affirmation se prouve.
 *  3. **Un refus n'est pas un plantage.** Permission refusée, caméra absente,
 *     prise de vue annulée : chaque cas rend un résultat qui dit ce qui s'est
 *     passé, en français. Aucun ne lève.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { DOSSIER_DOCUMENTS } from '../db/reinitialisation';
import { assainir } from './stockage';

/**
 * Largeur maximale d'une photo rangée, en pixels.
 *
 * 1280 pixels tiennent sur 174 mm de large à environ 187 ppp : largement de quoi
 * distinguer une rayure d'une tache à l'impression, sans garder la définition
 * d'un capteur de téléphone dont le document n'a rien à faire.
 */
export const LARGEUR_PHOTO_PX = 1280;

/** Qualité du réencodage JPEG. `0.6` : lisible à l'impression, bien plus léger. */
export const QUALITE_PHOTO = 0.6;

/** Le sous-dossier des photos, sous le dossier des documents. */
export function dossierPhotos(): string {
  return `${FileSystem.documentDirectory}${DOSSIER_DOCUMENTS}photos/`;
}

export interface PhotoRangee {
  /** Chemin du fichier dans le stockage de l'application. */
  chemin: string;
  /** Dimensions réelles du fichier rangé, en pixels. */
  largeur: number;
  hauteur: number;
  /** Poids du fichier rangé, en octets. Zéro si la mesure a échoué. */
  octets: number;
}

export interface RefusPhoto {
  /** Ce qui s'est passé, en français, prêt à être affiché. */
  message: string;
}

/** Le résultat d'une prise de vue : une photo rangée, un refus, ou rien. */
export type ResultatPhoto = PhotoRangee | RefusPhoto | null;

/** Vrai si le résultat est un refus. */
export function estRefus(resultat: ResultatPhoto): resultat is RefusPhoto {
  return resultat !== null && 'message' in resultat;
}

/** Un nom de fichier horodaté, assaini, sans jamais écraser un existant. */
async function cheminLibre(horodatage: string): Promise<string> {
  const dossier = dossierPhotos();
  const info = await FileSystem.getInfoAsync(dossier);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  }

  const base = `photo_${assainir(horodatage) || 'etat-des-lieux'}`;
  let candidat = `${dossier}${base}.jpg`;
  let rang = 2;
  // Deux photos prises dans la même seconde — c'est courant quand on avance
  // vite — produiraient le même nom. On suffixe plutôt que d'écraser : écraser
  // une photo déjà rattachée à un élément la ferait disparaître du document
  // sans que personne ne s'en aperçoive.
  while (rang <= 99) {
    const existe = await FileSystem.getInfoAsync(candidat);
    if (!existe.exists) break;
    candidat = `${dossier}${base}-${rang}.jpg`;
    rang += 1;
  }
  return candidat;
}

/** Un horodatage lisible et trié, pour nommer le fichier. */
function horodatage(maintenant: Date = new Date()): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return (
    `${maintenant.getFullYear()}-${deux(maintenant.getMonth() + 1)}-${deux(maintenant.getDate())}` +
    `_${deux(maintenant.getHours())}${deux(maintenant.getMinutes())}${deux(maintenant.getSeconds())}`
  );
}

/**
 * Compresse et range une image, puis rend ce qu'elle est devenue.
 *
 * La compression se fait en **un seul passage** : on redimensionne seulement si
 * l'image est plus large que `LARGEUR_PHOTO_PX` — agrandir une petite photo
 * n'ajouterait que du poids — et on réencode en JPEG. Le résultat est écrit
 * directement dans le dossier des documents.
 */
async function compresserEtRanger(params: {
  uriSource: string;
  largeurSource: number;
  maintenant?: Date;
}): Promise<PhotoRangee | RefusPhoto> {
  const { uriSource, largeurSource } = params;

  let uriCompressee: string;
  let largeur: number;
  let hauteur: number;
  try {
    const contexte = ImageManipulator.manipulate(uriSource);
    if (Number.isFinite(largeurSource) && largeurSource > LARGEUR_PHOTO_PX) {
      // Une seule dimension : l'autre est calculée pour conserver le rapport.
      // Étirer une photo la déformerait, et une preuve déformée ne prouve rien.
      contexte.resize({ width: LARGEUR_PHOTO_PX });
    }
    const reference = await contexte.renderAsync();
    const resultat = await reference.saveAsync({
      compress: QUALITE_PHOTO,
      format: SaveFormat.JPEG,
    });
    uriCompressee = resultat.uri;
    largeur = resultat.width;
    hauteur = resultat.height;
  } catch (erreur) {
    return {
      message:
        "La photo n'a pas pu être préparée. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    };
  }

  const destination = await cheminLibre(horodatage(params.maintenant));
  try {
    await FileSystem.moveAsync({ from: uriCompressee, to: destination });
  } catch (erreur) {
    await FileSystem.deleteAsync(uriCompressee, { idempotent: true }).catch(() => undefined);
    return {
      message:
        "La photo a été prise mais n'a pas pu être rangée dans le dossier du logement. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    };
  }

  let octets = 0;
  try {
    const info = await FileSystem.getInfoAsync(destination);
    if (info.exists && 'size' in info && typeof info.size === 'number') octets = info.size;
  } catch {
    // Le poids est une information d'affichage : son absence ne doit pas faire
    // échouer une prise de vue qui a réussi.
  }

  return { chemin: destination, largeur, hauteur, octets };
}

/**
 * Prend une photo avec la caméra.
 *
 * Rend `null` quand l'utilisateur annule : annuler n'est pas une erreur, et
 * afficher un message d'échec après un simple retour en arrière serait
 * désagréable et faux.
 */
export async function prendrePhoto(params: {
  maintenant?: Date;
} = {}): Promise<ResultatPhoto> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return {
      message:
        "L'application n'a pas l'autorisation d'utiliser l'appareil photo. " +
        'Vous pouvez la donner dans les réglages du téléphone, ou choisir une photo ' +
        'déjà enregistrée.',
    };
  }

  let resultat: ImagePicker.ImagePickerResult;
  try {
    resultat = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      // La compression est faite ensuite, en un seul passage, par le module de
      // redimensionnement : demander ici une qualité dégradée puis recompresser
      // dégraderait l'image deux fois pour rien.
      quality: 1,
      allowsEditing: false,
      exif: false,
      base64: false,
    });
  } catch (erreur) {
    return {
      message:
        "L'appareil photo n'a pas pu être ouvert. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    };
  }

  if (resultat.canceled) return null;
  const asset = resultat.assets?.[0];
  if (!asset?.uri) {
    return { message: "La photo n'a pas été reçue : aucune image n'est revenue de l'appareil." };
  }

  return compresserEtRanger({
    uriSource: asset.uri,
    largeurSource: asset.width ?? 0,
    maintenant: params.maintenant,
  });
}

/**
 * Choisit une photo déjà enregistrée sur le téléphone.
 *
 * Utile quand on complète un état des lieux après coup, ou quand la caméra est
 * refusée. La photo est copiée chez l'application, exactement comme une photo
 * prise sur place : le fichier d'origine peut vivre dans un cache que le
 * système efface.
 */
export async function choisirPhoto(params: {
  maintenant?: Date;
} = {}): Promise<ResultatPhoto> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      message:
        "L'application n'a pas l'autorisation d'accéder à vos photos. " +
        'Vous pouvez la donner dans les réglages du téléphone.',
    };
  }

  let resultat: ImagePicker.ImagePickerResult;
  try {
    resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
      exif: false,
      base64: false,
    });
  } catch (erreur) {
    return {
      message:
        "La galerie n'a pas pu être ouverte. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    };
  }

  if (resultat.canceled) return null;
  const asset = resultat.assets?.[0];
  if (!asset?.uri) return { message: "Aucune image n'a été reçue de la galerie." };

  return compresserEtRanger({
    uriSource: asset.uri,
    largeurSource: asset.width ?? 0,
    maintenant: params.maintenant,
  });
}

/**
 * Lit une photo rangée et la rend en base64, pour l'impression.
 *
 * L'échec est rendu par une chaîne vide, et non par une exception : le document
 * imprime alors « Photo illisible » à la place de l'image, ce qui vaut mieux
 * qu'un état des lieux qui refuse de s'établir parce qu'une photo a été
 * déplacée.
 */
export async function photoEnBase64(chemin: string): Promise<string> {
  if (!chemin) return '';
  try {
    const info = await FileSystem.getInfoAsync(chemin);
    if (!info.exists) return '';
    return await FileSystem.readAsStringAsync(chemin, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return '';
  }
}

/** Le poids lisible d'un fichier, ou `null` s'il est inconnu. */
export async function poidsLisible(chemin: string): Promise<string | null> {
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
