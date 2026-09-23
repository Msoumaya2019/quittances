/**
 * Consultation et partage des documents.
 *
 * Le partage utilise la feuille native du système : l'utilisateur retrouve donc
 * exactement les mêmes possibilités que depuis n'importe quelle application
 * (mail, messagerie, enregistrement dans les fichiers, impression).
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export class ErreurPartage extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurPartage';
  }
}

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

/** Ouvre le PDF dans le lecteur du système. */
export async function ouvrirDocument(chemin: string): Promise<boolean> {
  if (!(await documentExiste(chemin))) return false;
  await Print.printAsync({ uri: chemin });
  return true;
}

/**
 * Partage un PDF par impression : permet d'imprimer ou d'enregistrer en PDF
 * depuis la boîte de dialogue du système.
 */
export async function imprimerDocument(chemin: string): Promise<boolean> {
  if (!(await documentExiste(chemin))) return false;
  await Print.printAsync({ uri: chemin });
  return true;
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
