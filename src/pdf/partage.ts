/**
 * Consultation et partage des documents.
 *
 * **Ouvrir n'est pas imprimer.** L'appel d'impression ne montre jamais un
 * document : il demande au système de l'**imprimer**, et c'est donc une boîte
 * d'impression qui s'ouvre, avec le choix de l'imprimante. C'est ce que faisait
 * « Voir le PDF » jusqu'au 26 septembre 2026, et le défaut a été signalé depuis
 * le téléphone : « ça m'ouvre une fenêtre d'impression comme si je voulais
 * imprimer ».
 *
 * Les deux systèmes n'offrent pas la même chose, et il faut le dire :
 *
 * - **Android** sait ouvrir un PDF dans le lecteur installé, par une intention
 *   `ACTION_VIEW` portant une URI de contenu. C'est une vraie ouverture.
 * - **iOS n'expose aucune API** pour ouvrir un fichier dans une application
 *   tierce. La feuille de partage est le seul chemin, et c'est elle qui porte
 *   « Ouvrir dans… » et les lecteurs PDF installés. Sur iPhone, « voir le PDF »
 *   passe donc par la feuille de partage, et non par un lecteur ouvert d'office.
 *
 * Le partage, lui, utilise la feuille native du système : l'utilisateur
 * retrouve exactement les mêmes possibilités que depuis n'importe quelle
 * application (mail, messagerie, enregistrement dans les fichiers, impression).
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export class ErreurPartage extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurPartage';
  }
}

/**
 * `android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION`.
 *
 * Sans ce drapeau, le lecteur PDF n'a pas le droit de lire l'URI de contenu
 * qu'on lui passe : Android refuse l'ouverture. C'est la raison pour laquelle
 * `Linking.openURL` de React Native ne peut pas servir ici — il construit bien
 * une intention `ACTION_VIEW`, mais n'ajoute que `FLAG_ACTIVITY_NEW_TASK`,
 * jamais celui-ci.
 */
const LECTURE_AUTORISEE = 1;

/** `android.content.Intent.ACTION_VIEW` — absente de l'énumération d'`expo-intent-launcher`, qui ne recense que les écrans de réglages. */
const ACTION_VOIR = 'android.intent.action.VIEW';

/** Vrai si le partage natif est disponible sur cet appareil. */
export async function partageDisponible(): Promise<boolean> {
  try {
    return await Sharing.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Vrai si le fichier PDF existe encore sur l'appareil. */
export async function documentExiste(chemin: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(chemin);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Ouvre la feuille de partage pour un PDF.
 * Renvoie `false` si le fichier a disparu, pour que l'écran puisse le dire
 * plutôt que d'afficher une erreur technique. Le document n'est pas régénéré :
 * une quittance émise reste celle qui a été émise, et son fichier manquant ne
 * se reconstitue pas — l'écran ne doit donc pas promettre le contraire.
 */
export async function partagerDocument(chemin: string, titre?: string): Promise<boolean> {
  if (!(await documentExiste(chemin))) return false;

  if (!(await partageDisponible())) {
    throw new ErreurPartage(
      "Le partage n'est pas disponible sur cet appareil. " +
        'Vous pouvez toutefois ouvrir le PDF puis l’enregistrer depuis le lecteur.',
    );
  }

  await Sharing.shareAsync(chemin, {
    mimeType: 'application/pdf',
    dialogTitle: titre ?? 'Partager la quittance',
    UTI: 'com.adobe.pdf',
  });

  return true;
}

/**
 * Ouvre le PDF pour le lire — et non pour l'imprimer.
 *
 * Android : le lecteur PDF installé s'ouvre sur le document. Si aucun ne sait
 * le faire, on retombe sur la feuille de partage plutôt que d'échouer.
 * iOS : la feuille de partage, seul chemin que le système offre.
 *
 * Renvoie `false` si le fichier a disparu.
 */
export async function ouvrirDocument(chemin: string): Promise<boolean> {
  if (!(await documentExiste(chemin))) return false;

  if (Platform.OS === 'android') {
    try {
      // Le chemin de l'application n'est lisible par personne d'autre : il faut
      // le convertir en URI de contenu, puis autoriser la lecture.
      const uri = await FileSystem.getContentUriAsync(chemin);
      await IntentLauncher.startActivityAsync(ACTION_VOIR, {
        data: uri,
        type: 'application/pdf',
        flags: LECTURE_AUTORISEE,
      });
      return true;
    } catch {
      // Aucun lecteur PDF installé. La feuille de partage laisse au moins
      // choisir une application, ou enregistrer le fichier.
    }
  }

  return partagerDocument(chemin, 'Ouvrir le PDF');
}

/** Taille d'un fichier, mise en forme. */
export async function tailleDocument(chemin: string): Promise<string | null> {
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
