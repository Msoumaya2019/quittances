/**
 * Émission d'un inventaire du mobilier : assemblage, impression PDF, rangement.
 *
 * Point d'entrée **unique** de la génération, comme pour l'état des lieux.
 * Aucun écran ne fabrique un document à la main : l'écran de vérification et
 * l'écran final appellent tous `emettreInventaire`, qui applique les mêmes
 * règles.
 *
 * Quatre choses s'y décident, et nulle part ailleurs :
 *
 *  1. **Rien ne s'établit tant que le domaine refuse.** `manquesDeLInventaire`
 *     est relu ici, et pas seulement dans le formulaire : un brouillon restauré
 *     d'une sauvegarde, ou écrit par une version antérieure, ne doit pas produire
 *     un inventaire qui compte un meuble sans dire dans quel état il est.
 *  2. **Les signataires sont nommés.** La liste vient des titulaires du bail,
 *     avec leurs identifiants : c'est elle qui permet au document d'imprimer
 *     chaque signature sous le bon nom, et de dire qui n'a pas signé.
 *  3. **Les photos sont lues au dernier moment, dans deux index séparés.** Le
 *     brouillon ne porte que des chemins. Une photo illisible rend une chaîne
 *     vide, et le document imprime « Photo illisible » plutôt que d'échouer.
 *  4. **Le fichier est rangé avant la ligne.** Une pièce listée mais illisible
 *     est pire qu'un fichier orphelin, parce que l'application prétendrait
 *     encore pouvoir l'ouvrir.
 *
 * Ce que l'inventaire ajoute à l'état des lieux, et qui se décide ici :
 *
 * - **Un inventaire de sortie ne recopie pas le constat d'entrée.** Il en
 *   reprend les pièces, les meubles, leurs identifiants et leurs noms — c'est ce
 *   qui permet à la comparaison d'apparier sans deviner — et rien d'autre. Le
 *   rappel de la quantité d'entrée est rendu **à part**, pour que l'écran
 *   l'affiche à côté d'un champ vide.
 * - **La déclaration « loué meublé » de l'entrée fait foi.** C'est elle qui a été
 *   signée. Une déclaration contraire dans le brouillon de sortie ne se tranche
 *   pas en silence : l'application le dit et s'arrête, parce qu'un des deux
 *   documents se tromperait, et que le choix appartient au bailleur.
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
import { enregistrerPiece, trouverPiece } from '../db/repositories/pieces';
import { supprimerBrouillon } from '../db/repositories/brouillons';
import { lireReglages } from '../db/repositories/settings';
import { aujourdHui, depuisCle } from '../domain/period';
import { periodeLoyerApplicable } from '../domain/rent';
import { analyserDonnees, brouillonDeLInventaire } from '../domain/brouillon';
import {
  LIBELLE_TYPE_INVENTAIRE,
  avertissementsDeLInventaire,
  comparerInventaire,
  manquesDeLInventaire,
  reprendreBrouillonInventaire,
  signatairesAttendusDeLInventaire,
  syntheseInventaire,
  titreDeLInventaire,
} from '../domain/inventaire';
import type { BrouillonInventaire, PieceInventaire, TypeInventaire } from '../domain/inventaire';
import type { Signature } from '../domain/signature';
import type { PieceDossier } from '../domain/types';
import { contenuInventaireDepuis, rendreInventaire } from './inventaire';
import type { PhotosImprimables } from './constats';
import { donneesImage, mimeDeLExtension } from './trace';
import { PAGE_IMPRESSION } from './page';
import { deplacerPiece } from '../documents/stockage';
import { photoEnBase64 } from '../documents/photos';
import { ErreurEmission } from './render';

/** Le type de pièce sous lequel un inventaire se range, entrée comme sortie. */
export const TYPE_PIECE_INVENTAIRE = 'inventaire' as const;

/**
 * Ce qu'un inventaire laisse dans le dossier, en plus de son PDF.
 *
 * Le contenu structuré est conservé à côté du document parce qu'un inventaire se
 * **relit** : comparer une sortie à une entrée demande de lire des meubles, pas
 * un PDF. Un PDF ne se relit pas.
 *
 * `type` est indispensable ici : les deux natures de l'inventaire se rangent
 * sous le **même** type de pièce, `inventaire`, et c'est ce champ — et lui seul —
 * qui permet de dire si une pièce donnée est une entrée ou une sortie.
 */
export interface DonneesInventaire {
  type: TypeInventaire;
  /** Les pièces et leurs meubles, avec les quantités et les états relevés. */
  pieces: PieceInventaire[];
  observations: string | null;
  mandataire: string | null;
  /** Le logement est-il loué meublé, tel que déclaré. */
  meuble: boolean;
  signatures: Signature[];
  /** Le compte par état, figé au moment de l'établissement. */
  synthese: ReturnType<typeof syntheseInventaire>;
  /** Les réserves telles qu'elles ont été imprimées. */
  reserves: string[];
  /** Pour une sortie : la date de l'inventaire d'entrée comparé. */
  dateEntree: string | null;
  /** Pour une sortie : la pièce d'entrée comparée, et le nombre d'évolutions. */
  inventaireEntreeId: string | null;
  evolutions: number;
  etabliLe: string;
}

export interface InventaireEmis {
  piece: PieceDossier;
  donnees: DonneesInventaire;
}

/**
 * Lit toutes les photos d'un inventaire et les transforme en URI de données.
 *
 * Une photo illisible donne une entrée vide, et non une absence d'entrée : le
 * document doit pouvoir dire « cette photo existe mais je ne sais plus la lire ».
 * Les confondre ferait disparaître la mention, et le lecteur croirait qu'aucune
 * photo n'avait été prise.
 *
 * La source est décrite par sa seule forme — des pièces — et non par un
 * brouillon entier : l'émission d'un inventaire de sortie relit ainsi, avec **la
 * même fonction**, les photos de l'entrée et celles de la sortie. Deux lectures
 * séparées finiraient par traiter différemment une photo illisible, et le
 * « avant » du document ne serait plus comparable au « après ».
 */
async function chargerPhotos(source: {
  pieces?: readonly PieceInventaire[];
}): Promise<PhotosImprimables> {
  const photos: PhotosImprimables = {};
  const aLire: { id: string; chemin: string; legende: string; largeur?: number; hauteur?: number }[] =
    [];

  for (const piece of source.pieces ?? []) {
    for (const meuble of piece.meubles) {
      for (const p of meuble.photos) {
        aLire.push({
          id: p.id,
          chemin: p.chemin,
          legende: p.legende,
          largeur: p.largeur,
          hauteur: p.hauteur,
        });
      }
    }
  }

  for (const photo of aLire) {
    // Les identifiants de photos sont uniques dans un document, par
    // construction du domaine (`ph1`, `ph2`… par meuble, et `reprendre` les
    // rend uniques sur tout le document). Deux photos porteraient le même
    // identifiant qu'une seule serait imprimée : on n'écrase donc pas une entrée
    // déjà remplie par une entrée vide.
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
 * Relit l'inventaire d'entrée auquel une sortie se compare.
 *
 * Rend `null` — et non une comparaison vide — quand le contenu de l'entrée n'a
 * pas été conservé sous forme structurée. Un inventaire rangé par une version
 * antérieure n'a qu'un PDF : ses meubles ne sont pas lisibles, et imprimer
 * « aucun meuble n'a évolué » serait une affirmation que rien ne fonde. Le
 * document dit alors qu'il renvoie à l'autre, ce qui est vrai.
 *
 * Lève quand la pièce nommée n'existe plus, ou quand ce n'est pas une entrée :
 * se rabattre en silence ferait comparer la sortie d'un locataire à l'entrée
 * d'un autre, et le document affirmerait une évolution qui n'a jamais eu lieu.
 */
async function lireLInventaireEntree(
  logementId: string,
  inventaireEntreeId: string | undefined,
  dateEntree: string | undefined,
): Promise<{ pieces: PieceInventaire[]; meuble: boolean } | null> {
  if (!inventaireEntreeId) return null;

  const entree = await trouverPiece(inventaireEntreeId);
  if (!entree || entree.logementId !== logementId) {
    throw new ErreurEmission(
      "L'inventaire d'entrée auquel celui-ci se compare est introuvable. " +
        'Il a peut-être été supprimé : reprenez la sortie et désignez-le à nouveau.',
    );
  }

  // Les deux natures de l'inventaire partagent le **même** type de pièce :
  // c'est le contenu enregistré qui dit de laquelle il s'agit.
  const donnees = analyserDonnees(entree.donnees);
  if (donnees.type !== 'entree') {
    throw new ErreurEmission(
      "L'inventaire désigné comme référence n'est pas un inventaire d'entrée. " +
        'Un inventaire de sortie se compare à une entrée, pas à un autre inventaire de sortie.',
    );
  }
  if (dateEntree && entree.dateDocument !== dateEntree) {
    throw new ErreurEmission(
      `L'inventaire d'entrée enregistré porte la date du ${entree.dateDocument}, ` +
        `et non celle du ${dateEntree} que ce brouillon annonce. Reprenez la sortie : ` +
        'le document doit nommer la date qu’il compare.',
    );
  }
  if (!Array.isArray(donnees.pieces)) return null;

  const lues = reprendreBrouillonInventaire(donnees, {
    logementId,
    bailId: '',
    type: 'entree',
    pieces: [],
  });

  return { pieces: lues.pieces ?? [], meuble: lues.meuble === true };
}

/**
 * Produit l'inventaire et le range dans le dossier du logement.
 *
 * Lève `ErreurEmission` quand le domaine refuse, quand l'impression échoue ou
 * quand le rangement échoue — toujours avec une phrase en français qui dit ce
 * qui s'est passé.
 */
export async function emettreInventaire(params: {
  brouillon: BrouillonInventaire;
  /** Date d'établissement du PDF, `AAAA-MM-JJ`. Fournie pour rester éprouvable. */
  etabliLe?: string;
}): Promise<InventaireEmis> {
  const { brouillon } = params;
  const etabliLe = params.etabliLe ?? aujourdHui();

  // --- 1. Ce que la location porte déjà ----------------------------------
  const logement = await trouverLogement(brouillon.logementId);
  if (!logement) {
    throw new ErreurEmission(
      "Le logement de cet inventaire n'existe plus. Le brouillon ne peut pas aboutir.",
    );
  }

  const bail = await bailEnCours(logement.id);
  if (!bail || bail.id !== brouillon.bailId) {
    throw new ErreurEmission(
      'La location de ce logement a changé depuis le début du formulaire. ' +
        'Reprenez l’inventaire depuis la fiche du logement : le document doit nommer ' +
        'le locataire réellement en place.',
    );
  }

  const proprietaire = await trouverProprietaire(logement.proprietaireId);
  if (!proprietaire) {
    throw new ErreurEmission(
      "Le propriétaire de ce logement est introuvable : l'inventaire ne peut pas nommer le bailleur.",
    );
  }

  const titulaires = await titulairesDuBail(bail.id);
  if (titulaires.length === 0) {
    throw new ErreurEmission(
      'Aucun locataire n’est enregistré sur cette location. Un inventaire sans locataire nommé ' +
        'ne constate rien pour lui : ajoutez-le d’abord depuis la fiche du logement.',
    );
  }

  const ordonnes = titulaires.slice().sort((a, b) => a.ordre - b.ordre);

  // --- 2. Les signataires attendus ---------------------------------------
  // L'ordre est celui du bail, et les identifiants viennent des titulaires :
  // c'est ce qui permet au document d'imprimer chaque signature sous le bon nom.
  const attendus = signatairesAttendusDeLInventaire({
    nomBailleur: proprietaire.nom,
    titulaires: ordonnes,
    mandataire: brouillon.mandataire,
  });

  // --- 3. Le domaine garde la porte --------------------------------------
  const manques = manquesDeLInventaire(brouillon, attendus);
  if (manques.length > 0) {
    throw new ErreurEmission(
      `L'inventaire ne peut pas être établi en l'état :\n${manques.join('\n')}`,
    );
  }

  const periodes = await periodesLoyerDuBail(bail.id);
  // La règle « quelle période s'applique à ce mois » vit dans `domain/rent.ts`,
  // avec celle qui calcule la quittance : deux implémentations finiraient par ne
  // plus s'accorder, et le document rappellerait un loyer que la quittance ne
  // réclamerait pas.
  const moisEffet = depuisCle((brouillon.dateInventaire ?? bail.dateEntree).slice(0, 7));
  const periode = moisEffet ? periodeLoyerApplicable(periodes, moisEffet) : null;
  if (!periode) {
    throw new ErreurEmission(
      'Aucun loyer n’est enregistré pour la période de cet inventaire. ' +
        'Le document doit rappeler le loyer réellement dû : renseignez-le depuis la fiche du logement.',
    );
  }

  const reglages = await lireReglages();
  const reserves = avertissementsDeLInventaire(brouillon);

  // --- 4. Les photos ------------------------------------------------------
  const photos = await chargerPhotos(brouillon);

  // --- 4 bis. La comparaison, pour une sortie ------------------------------
  // L'inventaire d'entrée est relu ici, et non par l'écran : un document doit se
  // comparer à ce que la base porte réellement, même si l'écran qui l'a préparé
  // a été fermé entre-temps. Ses photos sont chargées par la **même** fonction
  // que celles de la sortie, dans un index séparé : les deux documents numérotent
  // leurs photos à partir de `ph1`, et un index commun ferait imprimer la photo
  // de l'entrée à la place de celle de la sortie.
  let comparaison: ReturnType<typeof comparerInventaire> | undefined;
  let photosEntree: PhotosImprimables | undefined;
  let meuble = brouillon.meuble === true;

  if (brouillon.type === 'sortie') {
    const entree = await lireLInventaireEntree(
      logement.id,
      brouillon.inventaireEntreeId,
      brouillon.dateEntree,
    );
    if (entree) {
      // La déclaration de l'entrée fait foi : c'est elle qui a été signée. Une
      // déclaration contraire ne se tranche pas en silence, parce qu'un des deux
      // documents se tromperait — et l'application ne choisit pas à la place du
      // bailleur laquelle de ses deux déclarations est la bonne.
      if (brouillon.meuble !== undefined && brouillon.meuble !== entree.meuble) {
        throw new ErreurEmission(
          "L'inventaire d'entrée déclare ce logement " +
            (entree.meuble ? 'loué meublé' : 'loué non meublé') +
            ', et ce brouillon de sortie déclare le contraire. ' +
            'Corrigez l’un des deux : le document ne peut pas contredire celui qu’il compare.',
        );
      }
      meuble = entree.meuble;
      comparaison = comparerInventaire(entree.pieces, brouillon.pieces ?? []);
      photosEntree = await chargerPhotos({ pieces: entree.pieces });
    }
  }

  // --- 5. L'assemblage ---------------------------------------------------
  const contenu = contenuInventaireDepuis({
    type: brouillon.type,
    dateInventaire: brouillon.dateInventaire!,
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
    pieces: brouillon.pieces,
    observations: brouillon.observations,
    signatures: brouillon.signatures,
    meuble,
    dateEntree: brouillon.dateEntree,
    comparaison,
    photos,
    photosEntree,
    reserves,
  });

  const html = rendreInventaire(contenu);

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
      "Le PDF de l'inventaire n'a pas pu être produit. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // --- 7. Rangement dans le dossier des documents -------------------------
  const titre = titreDeLInventaire(contenu.type, contenu.dateInventaire);
  let destination: string;
  try {
    const range = await deplacerPiece({
      sourceUri: uriTemporaire,
      type: TYPE_PIECE_INVENTAIRE,
      titre,
      date: contenu.dateInventaire,
    });
    destination = range.chemin;
  } catch (erreur) {
    await FileSystem.deleteAsync(uriTemporaire, { idempotent: true }).catch(() => undefined);
    throw new ErreurEmission(
      "Le PDF de l'inventaire a été produit mais n'a pas pu être rangé dans le dossier " +
        'du logement. ' +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // --- 8. La ligne du dossier --------------------------------------------
  const donnees: DonneesInventaire = {
    type: contenu.type,
    pieces: brouillon.pieces ?? [],
    observations: brouillon.observations?.trim() ? brouillon.observations : null,
    mandataire: brouillon.mandataire?.trim() ? brouillon.mandataire : null,
    meuble,
    signatures: brouillon.signatures ?? [],
    synthese: syntheseInventaire(brouillon),
    reserves,
    dateEntree: brouillon.dateEntree ?? null,
    inventaireEntreeId: brouillon.inventaireEntreeId ?? null,
    evolutions: comparaison?.evolutionsEtat ?? 0,
    etabliLe,
  };

  let piece: PieceDossier;
  try {
    piece = await enregistrerPiece({
      logementId: logement.id,
      bailId: bail.id,
      type: TYPE_PIECE_INVENTAIRE,
      titre,
      dateDocument: contenu.dateInventaire,
      cheminFichier: destination,
      donnees: JSON.stringify(donnees),
    });
  } catch (erreur) {
    // Le PDF existe déjà : on le retire pour ne pas laisser un fichier que rien
    // ne référence, et que personne ne saurait retrouver.
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    throw new ErreurEmission(
      "L'inventaire a été produit mais n'a pas pu être enregistré dans le dossier. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // Le brouillon a abouti : le laisser ferait proposer de reprendre un travail
  // terminé. Son retrait vient en dernier — si une étape précédente échoue, le
  // bailleur doit retrouver sa saisie. Le type est celui de la **nature** du
  // document : une entrée et une sortie ont deux brouillons distincts, et
  // effacer le mauvais ferait disparaître une saisie que personne n'a terminée.
  await supprimerBrouillon(logement.id, brouillonDeLInventaire(contenu.type));

  return { piece, donnees };
}

/** Le libellé complet d'un inventaire, pour les écrans de confirmation. */
export function libelleDeLInventaire(type: TypeInventaire): string {
  return LIBELLE_TYPE_INVENTAIRE[type];
}
