/**
 * Relire un contenu enregistré sans jamais lever, et la photo qu'il porte.
 *
 * Un contenu structuré — les pièces d'un état des lieux, les meubles d'un
 * inventaire — vit dans une colonne JSON. Il peut venir d'une version
 * antérieure, d'une sauvegarde restaurée, ou d'un JSON tronqué. Le laisser
 * passer tel quel ferait entrer dans un document des valeurs qu'aucun contrôle
 * n'a vues, et un état inventé est un constat que personne n'a fait.
 *
 * Ce module est **partagé** par l'état des lieux et l'inventaire du mobilier.
 * Les primitives y sont banales ; ce qui ne l'est pas, c'est `reprendrePhoto`,
 * qui porte deux règles de sûreté : une photo sans fichier n'est pas une photo,
 * et l'identifiant d'une photo est rendu unique **dans tout le document**.
 * Écrites deux fois, la première correction apportée à l'une aurait laissé
 * l'autre imprimer une image à la place d'une autre.
 *
 * Module **pur** : ni SQLite, ni React, ni système de fichiers.
 */

import { dateCivileValide } from './period.ts';
import { identifiantRepris } from './identifiants.ts';

/**
 * Une photo rangée dans le dossier des documents de l'application.
 *
 * Elle est **rattachée à ce qu'elle montre** — elle vit dans l'objet de
 * l'élément ou du meuble, et non dans une liste à part — parce que le décret
 * n° 2016-382 demande une description « illustrée d'images » : une photo
 * détachée de son objet ne prouve plus rien.
 *
 * Le type s'appelle `PhotoEdl` dans le module des états des lieux, où il a été
 * écrit d'abord ; c'est le même, et il n'en existe qu'un.
 */
export interface PhotoDocument {
  /** Identifiant local, stable dans le document. */
  id: string;
  /** Chemin du fichier dans le dossier des documents de l'application. */
  chemin: string;
  /** Ce que la photo montre, écrit par l'utilisateur. */
  legende: string;
  /** Date de prise de vue, `AAAA-MM-JJ`. */
  priseLe: string;
  /** Largeur en pixels, si on la connaît : sert à ne pas déformer l'image. */
  largeur?: number;
  /** Hauteur en pixels, si on la connaît. */
  hauteur?: number;
}

/** Une chaîne, ou la chaîne vide. Un nombre n'est jamais converti en texte. */
export function texteOuVide(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : '';
}

/** Un tableau, ou un tableau vide. */
export function tableau(valeur: unknown): unknown[] {
  return Array.isArray(valeur) ? valeur : [];
}

/** Un objet, ou `null`. Un tableau et une chaîne ne sont pas des objets. */
export function objet(valeur: unknown): Record<string, unknown> | null {
  if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur)) return null;
  return valeur as Record<string, unknown>;
}

/**
 * Relit une photo, ou rend `null` si ce n'en est pas une.
 *
 * Une photo sans chemin de fichier est **écartée** : la garder ferait afficher
 * une image vide dans le document, et personne ne saurait qu'il en manque une.
 */
export function reprendrePhoto(valeur: unknown, prises: string[]): PhotoDocument | null {
  const o = objet(valeur);
  if (!o) return null;
  const chemin = texteOuVide(o.chemin);
  if (!chemin) return null;

  const photo: PhotoDocument = {
    id: identifiantRepris(o.id, 'ph', prises),
    chemin,
    legende: texteOuVide(o.legende),
    priseLe: dateCivileValide(texteOuVide(o.priseLe)) ? texteOuVide(o.priseLe) : '',
  };
  if (typeof o.largeur === 'number' && Number.isFinite(o.largeur) && o.largeur > 0) {
    photo.largeur = Math.round(o.largeur);
  }
  if (typeof o.hauteur === 'number' && Number.isFinite(o.hauteur) && o.hauteur > 0) {
    photo.hauteur = Math.round(o.hauteur);
  }
  return photo;
}

/**
 * Relit une liste de photos, en tenant à jour les identifiants déjà pris.
 *
 * `prises` est **partagé** entre toutes les listes d'un même document : c'est
 * lui qui garantit qu'un `ph1` déjà employé ailleurs ne sera pas réattribué.
 */
export function reprendrePhotos(valeur: unknown, prises: string[]): PhotoDocument[] {
  const photos: PhotoDocument[] = [];
  for (const brut of tableau(valeur)) {
    const photo = reprendrePhoto(brut, prises);
    if (photo) {
      photos.push(photo);
      prises.push(photo.id);
    }
  }
  return photos;
}
