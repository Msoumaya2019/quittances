/**
 * L'impression d'un constat : la pastille d'un état, et la photo qui l'illustre.
 *
 * Ce module est **commun** à l'état des lieux et à l'inventaire du mobilier,
 * parce que les deux documents constatent la même chose dans les mêmes termes :
 * un meuble est décrit « Bon état » comme un mur, et sa photo s'imprime sous lui.
 *
 * Il porte deux règles de sûreté, et c'est pour elles qu'il existe plutôt que
 * d'être recopié :
 *
 *  1. **Aucune couleur ne porte seule une information.** Chaque état imprime son
 *     libellé à côté de sa pastille : un document photocopié en noir et blanc
 *     doit rester lisible, et « Mauvais état » ne peut pas dépendre d'un fond
 *     rouge.
 *  2. **Une photo illisible le dit.** Imprimer une image cassée ferait croire à
 *     un défaut d'affichage ; l'omettre ferait croire qu'il n'y avait pas de
 *     photo. Le document imprime donc « Photo illisible », avec sa légende.
 *
 * Une troisième règle est de mise en page : une photo en portrait, cadrée sur la
 * seule largeur, occuperait toute une feuille. On plafonne donc sa hauteur, en
 * conservant le rapport largeur/hauteur — une photo étirée ne prouverait plus ce
 * qu'elle montre.
 *
 * Module **pur** : ni SQLite, ni React, ni `expo-print`.
 */

import type { EtatElement } from '../domain/etats.ts';
import { ETATS_ELEMENT } from '../domain/etats.ts';
import { echapper } from './styles.ts';
import { dimensionDansLaLargeur } from './trace.ts';

// ---------------------------------------------------------------------------
// La pastille d'un état
// ---------------------------------------------------------------------------

/**
 * La largeur utile d'une photo, en millimètres.
 *
 * A4 fait 210 mm de large, et la page réserve 18 mm de marge de chaque côté :
 * il reste 174 mm. Deux photos côte à côte tiennent donc dans 85 mm chacune,
 * marges comprises. La valeur est écrite ici, et non calculée depuis la feuille
 * de style, parce qu'elle décide de la taille imprimée et qu'un changement de
 * marge doit la faire changer — le banc de mesure des marges s'en assure.
 */
export const LARGEUR_PHOTO_MM = 85;

/**
 * La hauteur maximale d'une photo, en millimètres.
 *
 * Une photo en portrait, cadrée sur la seule largeur, occuperait la moitié d'une
 * feuille et repousserait les éléments suivants. On plafonne donc la hauteur, en
 * conservant le rapport.
 */
export const HAUTEUR_PHOTO_MAX_MM = 105;

/** Le fond, le texte et la bordure d'une pastille d'état. */
export interface TonEtat {
  fond: string;
  texte: string;
  bordure: string;
}

export const TONS_ETAT: Record<EtatElement, TonEtat> = {
  neuf: { fond: '#E8F5E9', texte: '#1B5E20', bordure: '#A5D6A7' },
  tres_bon: { fond: '#F1F8E9', texte: '#33691E', bordure: '#C5E1A5' },
  bon: { fond: '#ECF5FA', texte: '#00406E', bordure: '#BBDEFB' },
  usage: { fond: '#FFF8E1', texte: '#8D6E00', bordure: '#FFE082' },
  mauvais: { fond: '#FDECEA', texte: '#B3261E', bordure: '#F5C6C2' },
  non_verifie: { fond: '#F5F5F5', texte: '#555555', bordure: '#DDDDDD' },
  non_applicable: { fond: '#FAFAFA', texte: '#777777', bordure: '#E8E8E8' },
};

/** Les noms de classes employés pour un état. Chaque document a les siennes. */
export interface ClassesEtat {
  pastille: string;
}

export const CLASSES_ETAT_DEFAUT: ClassesEtat = { pastille: 'e-etat' };

/**
 * La pastille d'un état : le libellé est toujours imprimé à côté.
 *
 * Un élément sans état n'est pas un élément en bon état : sa pastille le dit en
 * rouge, parce que c'est la seule ligne du document sur laquelle il reste
 * quelque chose à faire.
 */
export function pastille(
  etat: EtatElement | undefined,
  classes: ClassesEtat = CLASSES_ETAT_DEFAUT,
): string {
  if (!etat) {
    return (
      `<span class="${classes.pastille}" style="background:#FFFFFF;color:#B3261E;` +
      'border:0.25mm solid #F5C6C2">Non renseigné</span>'
    );
  }
  const presentation = ETATS_ELEMENT.find((e) => e.valeur === etat);
  const ton = TONS_ETAT[etat];
  const libelle = presentation?.libelle ?? etat;
  return (
    `<span class="${classes.pastille}" style="background:${ton.fond};color:${ton.texte};` +
    `border:0.25mm solid ${ton.bordure}">${echapper(libelle)}</span>`
  );
}

// ---------------------------------------------------------------------------
// Les photos
// ---------------------------------------------------------------------------

/**
 * Une photo prête à imprimer.
 *
 * `donnees` porte l'URI `data:` complète, construite au moment de l'émission en
 * lisant le fichier. Une chaîne vide signifie que le fichier est **illisible** :
 * le document imprime alors une ligne qui le dit, plutôt qu'une image cassée
 * dont personne ne saurait qu'il en manque une.
 */
export interface PhotoImprimable {
  id: string;
  donnees: string;
  legende: string;
  largeur?: number;
  hauteur?: number;
}

/** Les photos d'un document, indexées par identifiant. */
export type PhotosImprimables = Record<string, PhotoImprimable>;

/** Les noms de classes employés pour les photos. Chaque document a les siennes. */
export interface ClassesPhoto {
  photo: string;
  groupe: string;
  absente: string;
}

export const CLASSES_PHOTO_DEFAUT: ClassesPhoto = {
  photo: 'e-photo',
  groupe: 'e-photos',
  absente: 'e-photo-absente',
};

/**
 * Une photo, ou la mention de son absence.
 *
 * Une photo dont le fichier est illisible **le dit**. Imprimer une image cassée
 * ferait croire à un défaut d'affichage ; l'omettre ferait croire qu'il n'y
 * avait pas de photo.
 */
export function rendrePhoto(
  imprimable: PhotoImprimable | undefined,
  classes: ClassesPhoto = CLASSES_PHOTO_DEFAUT,
): string {
  if (!imprimable) return '';
  if (!imprimable.donnees) {
    return `<figure class="${classes.photo}"><div class="${classes.absente}">Photo illisible<br />${echapper(
      imprimable.legende || 'sans légende',
    )}</div></figure>`;
  }

  // Une photo en portrait, cadrée sur la seule largeur, occuperait toute une
  // feuille. On plafonne donc la hauteur, et on recalcule la largeur pour
  // conserver le rapport : une photo étirée ne prouverait plus rien.
  const cadre = dimensionDansLaLargeur(
    imprimable.largeur ?? 4,
    imprimable.hauteur ?? 3,
    LARGEUR_PHOTO_MM,
  );
  const hauteur = Math.min(cadre.hauteur, HAUTEUR_PHOTO_MAX_MM);
  const largeur = Math.round((cadre.largeur * hauteur) / Math.max(1, cadre.hauteur));

  return `<figure class="${classes.photo}" style="width:${largeur}mm">
    <img src="${echapper(imprimable.donnees)}" alt="${echapper(imprimable.legende || 'Photo du logement')}" />
    ${imprimable.legende ? `<figcaption>${echapper(imprimable.legende)}</figcaption>` : ''}
  </figure>`;
}

/** Toutes les photos d'une liste, dans l'ordre. */
export function rendrePhotos(
  liste: readonly { id: string }[],
  photos: PhotosImprimables,
  classes: ClassesPhoto = CLASSES_PHOTO_DEFAUT,
): string {
  const rendues = liste.map((p) => rendrePhoto(photos[p.id], classes)).filter((h) => h.length > 0);
  return rendues.length > 0
    ? `<div class="${classes.groupe}">${rendues.join('')}</div>`
    : '';
}
