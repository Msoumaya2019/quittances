/**
 * Émission d'un état des lieux : assemblage, impression PDF, rangement.
 *
 * Point d'entrée **unique** de la génération. Aucun écran ne fabrique un
 * document à la main : l'écran de vérification et l'écran final appellent tous
 * `emettreEtatDesLieux`, qui applique les mêmes règles.
 *
 * Quatre choses s'y décident, et nulle part ailleurs :
 *
 *  1. **Rien ne s'établit tant que le domaine refuse.** `manquesDeLEdl` est relu
 *     ici, et pas seulement dans le formulaire : un brouillon restauré d'une
 *     sauvegarde, ou écrit par une version antérieure, ne doit pas produire un
 *     état des lieux qui décrit un élément sans dire dans quel état il est.
 *  2. **Les signataires sont nommés.** La liste vient des titulaires du bail,
 *     avec leurs identifiants : c'est elle qui permet au document d'imprimer
 *     chaque signature sous le bon nom, et de dire qui n'a pas signé.
 *  3. **Les photos sont lues au dernier moment.** Le brouillon ne porte que des
 *     chemins ; c'est ici qu'on lit les fichiers et qu'on les transforme en URI
 *     de données. Une photo illisible rend une chaîne vide, et le document
 *     imprime « Photo illisible » plutôt que d'échouer.
 *  4. **Le fichier est rangé avant la ligne.** Une pièce listée mais illisible
 *     est pire qu'un fichier orphelin, parce que l'application prétendrait
 *     encore pouvoir l'ouvrir.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

import {
  bailEnCours,
  periodesLoyerDuBail,
  titulairesDuBail,
  trouverLogement,
} from '../db/repositories/properties';
import { trouverProprietaire } from '../db/repositories/owners';
import { enregistrerPiece } from '../db/repositories/pieces';
import { supprimerBrouillon } from '../db/repositories/brouillons';
import { lireReglages } from '../db/repositories/settings';
import { aujourdHui, depuisCle } from '../domain/period';
import { periodeLoyerApplicable } from '../domain/rent';
import {
  LIBELLE_TYPE_EDL,
  avertissementsDeLEdl,
  manquesDeLEdl,
  signatairesAttendusDeLEdl,
  syntheseEdl,
  titreDeLEdl,
} from '../domain/etat-des-lieux';
import type { BrouillonEdl, TypeEdl } from '../domain/etat-des-lieux';
import type { Signature } from '../domain/signature';
import type { PieceDossier, TypePiece } from '../domain/types';
import { contenuEdlDepuis, rendreEtatDesLieux } from './etat-des-lieux';
import type { PhotosEdl } from './etat-des-lieux';
import { donneesImage, mimeDeLExtension } from './trace';
import { PAGE_IMPRESSION } from './page';
import { deplacerPiece } from '../documents/stockage';
import { photoEnBase64 } from '../documents/photos';
import { ErreurEmission } from './render';

/** Le type de pièce correspondant à la nature de l'état des lieux. */
export function typePieceDeLEdl(type: TypeEdl): TypePiece {
  return type === 'entree' ? 'edl_entree' : 'edl_sortie';
}

/**
 * Ce qu'un état des lieux laisse dans le dossier, en plus de son PDF.
 *
 * Le contenu structuré est conservé à côté du document parce qu'un état des
 * lieux se **relit** : comparer une sortie à une entrée demande de lire des
 * états, pas un PDF. Un PDF ne se relit pas.
 */
export interface DonneesEdl {
  type: TypeEdl;
  /** Les pièces et leurs éléments, avec les états relevés. */
  pieces: BrouillonEdl['pieces'];
  compteurs: BrouillonEdl['compteurs'];
  cles: BrouillonEdl['cles'];
  observations: string | null;
  mandataire: string | null;
  compteursIndividuels: boolean;
  signatures: Signature[];
  /** Le compte par état, figé au moment de l'établissement. */
  synthese: ReturnType<typeof syntheseEdl>;
  /** Les réserves telles qu'elles ont été imprimées. */
  reserves: string[];
  /** Pour une sortie : la date de l'état des lieux d'entrée. */
  dateEntree: string | null;
  etabliLe: string;
}

export interface EdlEmis {
  piece: PieceDossier;
  donnees: DonneesEdl;
}

/**
 * Lit toutes les photos d'un état des lieux et les transforme en URI de données.
 *
 * Une photo illisible donne une entrée vide, et non une absence d'entrée : le
 * document doit pouvoir dire « cette photo existe mais je ne sais plus la
 * lire ». Les confondre ferait disparaître la mention, et le lecteur croirait
 * qu'aucune photo n'avait été prise.
 */
async function chargerPhotos(brouillon: BrouillonEdl): Promise<PhotosEdl> {
  const photos: PhotosEdl = {};
  const aLire: { id: string; chemin: string; legende: string; largeur?: number; hauteur?: number }[] =
    [];

  for (const piece of brouillon.pieces ?? []) {
    for (const p of piece.photos) {
      aLire.push({ id: p.id, chemin: p.chemin, legende: p.legende, largeur: p.largeur, hauteur: p.hauteur });
    }
    for (const element of piece.elements) {
      for (const p of element.photos) {
        aLire.push({ id: p.id, chemin: p.chemin, legende: p.legende, largeur: p.largeur, hauteur: p.hauteur });
      }
    }
  }
  for (const compteur of brouillon.compteurs ?? []) {
    if (compteur.photo) {
      aLire.push({
        id: compteur.photo.id,
        chemin: compteur.photo.chemin,
        legende: compteur.photo.legende,
        largeur: compteur.photo.largeur,
        hauteur: compteur.photo.hauteur,
      });
    }
  }

  for (const photo of aLire) {
    // Les identifiants de photos sont uniques dans un document, par
    // construction du domaine (`ph1`, `ph2`… par élément). Deux photos
    // porteraient le même identifiant qu'une seule serait imprimée : on
    // n'écrase donc pas une entrée déjà remplie par une entrée vide.
    if (photos[photo.id]?.donnees) continue;
    const base64 = await photoEnBase64(photo.chemin);
    photos[photo.id] = {
      id: photo.id,
      donnees: base64 ? donneesImage(base64, mimeDeLExtension(photo.chemin)) : '',
      legende: photo.legende,
      largeur: photo.largeur,
      hauteur: photo.hauteur,
    };
  }

  return photos;
}

/**
 * Produit l'état des lieux et le range dans le dossier du logement.
 *
 * Lève `ErreurEmission` quand le domaine refuse, quand l'impression échoue ou
 * quand le rangement échoue — toujours avec une phrase en français qui dit ce
 * qui s'est passé.
 */
export async function emettreEtatDesLieux(params: {
  brouillon: BrouillonEdl;
  /** Date d'établissement du PDF, `AAAA-MM-JJ`. Fournie pour rester éprouvable. */
  etabliLe?: string;
}): Promise<EdlEmis> {
  const { brouillon } = params;
  const etabliLe = params.etabliLe ?? aujourdHui();

  // --- 1. Ce que la location porte déjà ----------------------------------
  const logement = await trouverLogement(brouillon.logementId);
  if (!logement) {
    throw new ErreurEmission(
      "Le logement de cet état des lieux n'existe plus. Le brouillon ne peut pas aboutir.",
    );
  }

  const bail = await bailEnCours(logement.id);
  if (!bail || bail.id !== brouillon.bailId) {
    throw new ErreurEmission(
      'La location de ce logement a changé depuis le début du formulaire. ' +
        'Reprenez l’état des lieux depuis la fiche du logement : le document doit nommer ' +
        'le locataire réellement en place.',
    );
  }

  const proprietaire = await trouverProprietaire(logement.proprietaireId);
  if (!proprietaire) {
    throw new ErreurEmission(
      "Le propriétaire de ce logement est introuvable : l'état des lieux ne peut pas nommer le bailleur.",
    );
  }

  const titulaires = await titulairesDuBail(bail.id);
  if (titulaires.length === 0) {
    throw new ErreurEmission(
      'Aucun locataire n’est enregistré sur cette location. Un état des lieux sans locataire nommé ' +
        'ne constate rien pour lui : ajoutez-le d’abord depuis la fiche du logement.',
    );
  }

  const ordonnes = titulaires.slice().sort((a, b) => a.ordre - b.ordre);

  // --- 2. Les signataires attendus ---------------------------------------
  // L'ordre est celui du bail, et les identifiants viennent des titulaires :
  // c'est ce qui permet au document d'imprimer chaque signature sous le bon nom.
  // La règle vit dans le domaine, parce que le formulaire l'applique aussi pour
  // savoir s'il peut laisser avancer.
  const attendus = signatairesAttendusDeLEdl({
    nomBailleur: proprietaire.nom,
    titulaires: ordonnes,
    mandataire: brouillon.mandataire,
  });

  // --- 3. Le domaine garde la porte --------------------------------------
  const manques = manquesDeLEdl(brouillon, attendus);
  if (manques.length > 0) {
    throw new ErreurEmission(
      `L'état des lieux ne peut pas être établi en l'état :\n${manques.join('\n')}`,
    );
  }

  const periodes = await periodesLoyerDuBail(bail.id);
  // La règle « quelle période s'applique à ce mois » vit dans `domain/rent.ts`,
  // avec celle qui calcule la quittance : deux implémentations finiraient par
  // ne plus s'accorder, et le document rappellerait un loyer que la quittance
  // ne réclamerait pas.
  const moisEffet = depuisCle((brouillon.dateEdl ?? bail.dateEntree).slice(0, 7));
  const periode = moisEffet ? periodeLoyerApplicable(periodes, moisEffet) : null;
  if (!periode) {
    throw new ErreurEmission(
      'Aucun loyer n’est enregistré pour la période de cet état des lieux. ' +
        'Le document doit rappeler le loyer réellement dû : renseignez-le depuis la fiche du logement.',
    );
  }

  const reglages = await lireReglages();
  const reserves = avertissementsDeLEdl(brouillon);

  // --- 4. Les photos ------------------------------------------------------
  const photos = await chargerPhotos(brouillon);

  // --- 5. L'assemblage ---------------------------------------------------
  const contenu = contenuEdlDepuis({
    type: brouillon.type,
    dateEdl: brouillon.dateEdl!,
    etabliLe,
    lieu: reglages.lieuEmission,
    logement,
    bailleur: proprietaire,
    locataires: ordonnes.map((t) => ({
      nom: t.nom,
      prenom: t.prenom,
      telephone: t.telephone,
      email: t.email,
      dateNaissance: t.dateNaissance,
      lieuNaissance: t.lieuNaissance,
    })),
    locatairesIds: ordonnes.map((t) => t.id),
    mandataire: brouillon.mandataire,
    bail: {
      dateEntree: bail.dateEntree,
      dateSortie: bail.dateSortie,
      loyer: periode.loyer,
      charges: periode.charges,
      depotGarantie: bail.depotGarantie ?? 0,
      jourEcheance: bail.jourEcheance,
    },
    compteurs: brouillon.compteurs,
    cles: brouillon.cles,
    pieces: brouillon.pieces,
    observations: brouillon.observations,
    signatures: brouillon.signatures,
    compteursIndividuels: brouillon.compteursIndividuels,
    dateEntree: brouillon.dateEntree,
    nouveauDomicile: brouillon.nouveauDomicile,
    photos,
    reserves,
  });

  const html = rendreEtatDesLieux(contenu);

  // --- 6. Impression ------------------------------------------------------
  let uriTemporaire: string;
  try {
    // Le format A4 doit être demandé explicitement : sans ces deux valeurs,
    // `expo-print` prend le format US Letter et chaque feuille se décale.
    const resultat = await Print.printToFileAsync({
      html,
      base64: false,
      width: PAGE_IMPRESSION.largeurPt,
      height: PAGE_IMPRESSION.hauteurPt,
    });
    uriTemporaire = resultat.uri;
  } catch (erreur) {
    throw new ErreurEmission(
      "Le PDF de l'état des lieux n'a pas pu être produit. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // --- 7. Rangement dans le dossier des documents -------------------------
  const titre = titreDeLEdl(contenu.type, contenu.dateEdl);
  const typePiece = typePieceDeLEdl(contenu.type);
  let destination: string;
  try {
    const range = await deplacerPiece({
      sourceUri: uriTemporaire,
      type: typePiece,
      titre,
      date: contenu.dateEdl,
    });
    destination = range.chemin;
  } catch (erreur) {
    await FileSystem.deleteAsync(uriTemporaire, { idempotent: true }).catch(() => undefined);
    throw new ErreurEmission(
      "Le PDF de l'état des lieux a été produit mais n'a pas pu être rangé dans le dossier " +
        'du logement. ' +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // --- 8. La ligne du dossier --------------------------------------------
  const donnees: DonneesEdl = {
    type: contenu.type,
    pieces: brouillon.pieces ?? [],
    compteurs: brouillon.compteurs ?? [],
    cles: brouillon.cles ?? [],
    observations: brouillon.observations?.trim() ? brouillon.observations : null,
    mandataire: brouillon.mandataire?.trim() ? brouillon.mandataire : null,
    compteursIndividuels: brouillon.compteursIndividuels === true,
    signatures: brouillon.signatures ?? [],
    synthese: syntheseEdl(brouillon),
    reserves,
    dateEntree: brouillon.dateEntree ?? null,
    etabliLe,
  };

  let piece: PieceDossier;
  try {
    piece = await enregistrerPiece({
      logementId: logement.id,
      bailId: bail.id,
      type: typePiece,
      titre,
      dateDocument: contenu.dateEdl,
      cheminFichier: destination,
      donnees: JSON.stringify(donnees),
    });
  } catch (erreur) {
    // Le PDF existe déjà : on le retire pour ne pas laisser un fichier que rien
    // ne référence, et que personne ne saurait retrouver.
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    throw new ErreurEmission(
      "L'état des lieux a été produit mais n'a pas pu être enregistré dans le dossier. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // Le brouillon a abouti : le laisser ferait proposer de reprendre un travail
  // terminé. Son retrait vient en dernier — si une étape précédente échoue, le
  // bailleur doit retrouver sa saisie.
  await supprimerBrouillon(logement.id, 'etat_des_lieux');

  return { piece, donnees };
}

/** Le libellé complet d'un état des lieux, pour les écrans de confirmation. */
export function libelleDeLEdl(type: TypeEdl): string {
  return LIBELLE_TYPE_EDL[type];
}
