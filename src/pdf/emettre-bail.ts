/**
 * Émission d'un bail : assemblage, impression PDF, rangement dans le dossier.
 *
 * Point d'entrée **unique** de la génération d'un bail. Aucun écran ne fabrique
 * un document à la main : l'aperçu et l'écran final appellent tous
 * `emettreBail`, qui applique les mêmes règles.
 *
 * Trois choses s'y décident, et nulle part ailleurs :
 *
 *  1. **Rien ne s'émet tant que le domaine refuse.** `manquesDuBail` est relu
 *     ici, et pas seulement dans le formulaire : un brouillon restauré d'une
 *     sauvegarde, ou écrit par une version antérieure, ne doit pas pouvoir
 *     produire un bail que la loi interdit.
 *  2. **Le bail reprend ce que la location porte déjà.** Le loyer, les charges
 *     et la date de prise d'effet viennent du bail en base, jamais du
 *     formulaire : deux endroits pour saisir la même donnée en produiraient
 *     deux versions, et la quittance serait calculée sur l'une pendant que le
 *     bail imprimerait l'autre. Ce que le formulaire peut corriger — le dépôt
 *     de garantie et le jour d'échéance — est **réécrit en base**, pour qu'il
 *     n'existe jamais deux vérités.
 *  3. **Le fichier est rangé avant la ligne.** L'ordre compte : une pièce
 *     listée mais illisible est pire qu'un fichier orphelin, parce que
 *     l'application prétendrait encore pouvoir l'ouvrir.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

import {
  bailEnCours,
  modifierBail,
  periodesLoyerDuBail,
  titulairesDuBail,
  trouverLogement,
} from '../db/repositories/properties';
import { trouverProprietaire } from '../db/repositories/owners';
import { enregistrerPiece } from '../db/repositories/pieces';
import { supprimerBrouillon } from '../db/repositories/brouillons';
import { lireReglages } from '../db/repositories/settings';
import { aujourdHui, depuisCle, formaterDateFr } from '../domain/period';
import { periodeLoyerApplicable } from '../domain/rent';
import { LIBELLE_BAIL, manquesDuBail } from '../domain/bail';
import type { BrouillonBail, CategorieBail, SignatureBail, TypeAnnexe } from '../domain/bail';
import type { PieceDossier } from '../domain/types';
import { contenuDepuis, finDuBailISO, rendreBail } from './bail';
import { PAGE_IMPRESSION } from './page';
import { deplacerPiece } from '../documents/stockage';
import { ErreurEmission } from './render';

/**
 * Ce qu'un bail laisse dans le dossier, en plus de son PDF.
 *
 * Le contenu structuré est enregistré à côté du document parce qu'un bail se
 * **relit** : la Phase 4 comparera un état des lieux de sortie à l'entrée, et
 * l'échéance d'un bail se retrouve dans sa durée, pas dans son PDF. Un PDF ne
 * se relit pas.
 */
export interface DonneesBail {
  categorie: CategorieBail;
  dureeMois: number;
  /** Fin du bail, en date civile `AAAA-MM-JJ`. */
  fin: string;
  depotGarantie: number;
  jourEcheance: number;
  motifMobilite: string | null;
  annexes: TypeAnnexe[];
  diagnostics: { libelle: string; date: string; aRenouveler: boolean }[];
  signatures: SignatureBail[];
  clausesParticulieres: string | null;
  residencePrincipale: boolean;
  etabliLe: string;
}

export interface BailEmis {
  piece: PieceDossier;
  donnees: DonneesBail;
}

/** Le titre du bail tel qu'il apparaîtra dans le dossier. */
export function titreDuBail(categorie: CategorieBail, dateDebut: string): string {
  return `Bail ${LIBELLE_BAIL[categorie].toLowerCase()} du ${formaterDateFr(dateDebut)}`;
}

/**
 * Produit le bail et le range dans le dossier du logement.
 *
 * Lève `ErreurEmission` quand le domaine refuse, quand l'impression échoue, ou
 * quand le rangement échoue — toujours avec une phrase en français qui dit ce
 * qui s'est passé.
 */
export async function emettreBail(params: {
  brouillon: BrouillonBail;
  /** Date d'établissement, `AAAA-MM-JJ`. Fournie pour rester éprouvable. */
  etabliLe?: string;
}): Promise<BailEmis> {
  const { brouillon } = params;
  const etabliLe = params.etabliLe ?? aujourdHui();

  // --- 1. Le domaine garde la porte --------------------------------------
  const manques = manquesDuBail(brouillon);
  if (manques.length > 0) {
    throw new ErreurEmission(
      `Le bail ne peut pas être établi en l'état :\n${manques.join('\n')}`,
    );
  }

  // --- 2. Ce que la location porte déjà ----------------------------------
  const logement = await trouverLogement(brouillon.logementId);
  if (!logement) {
    throw new ErreurEmission(
      "Le logement de ce bail n'existe plus. Le brouillon ne peut pas aboutir.",
    );
  }

  const bail = await bailEnCours(logement.id);
  if (!bail || bail.id !== brouillon.bailId) {
    throw new ErreurEmission(
      "La location de ce logement a changé depuis le début du formulaire. " +
        'Reprenez le bail depuis la fiche du logement : le document doit nommer ' +
        'le locataire réellement en place.',
    );
  }

  const proprietaire = await trouverProprietaire(logement.proprietaireId);
  if (!proprietaire) {
    throw new ErreurEmission(
      "Le propriétaire de ce logement est introuvable : le bail ne peut pas nommer le bailleur.",
    );
  }

  const titulaires = await titulairesDuBail(bail.id);
  if (titulaires.length === 0) {
    throw new ErreurEmission(
      'Aucun locataire n’est enregistré sur cette location. Un bail sans locataire nommé ne vaut rien : ' +
        'ajoutez-le d’abord depuis la fiche du logement.',
    );
  }

  const periodes = await periodesLoyerDuBail(bail.id);
  // La règle « quelle période s'applique à ce mois » vit dans `domain/rent.ts`,
  // avec celle qui calcule la quittance : deux implémentations finiraient par
  // ne plus s'accorder, et le bail imprimerait un loyer que la quittance ne
  // réclamerait pas.
  const moisEffet = depuisCle((brouillon.dateDebut || bail.dateEntree).slice(0, 7));
  const periode = moisEffet ? periodeLoyerApplicable(periodes, moisEffet) : null;
  if (!periode) {
    throw new ErreurEmission(
      'Aucun loyer n’est enregistré pour la date de prise d’effet de ce bail. ' +
        'Le bail doit imprimer le loyer réellement dû : renseignez-le depuis la fiche du logement.',
    );
  }

  const reglages = await lireReglages();

  // --- 3. L'assemblage ---------------------------------------------------
  const contenu = contenuDepuis({
    sources: {
      bailleur: proprietaire,
      logement,
      locataires: titulaires
        .slice()
        .sort((a, b) => a.ordre - b.ordre)
        .map((t) => ({
          nom: t.nom,
          prenom: t.prenom,
          dateNaissance: t.dateNaissance,
          lieuNaissance: t.lieuNaissance,
          telephone: t.telephone,
          email: t.email,
        })),
    },
    brouillon: {
      ...brouillon,
      // Le loyer et la date viennent de la location, pas du formulaire : ce
      // sont les valeurs sur lesquelles les quittances seront calculées.
      loyer: periode.loyer,
      charges: periode.charges,
      dateDebut: brouillon.dateDebut || bail.dateEntree,
    },
    reglages: { lieuEmission: reglages.lieuEmission },
    etabliLe,
  });

  const html = rendreBail(contenu);

  // --- 4. Impression ------------------------------------------------------
  let uriTemporaire: string;
  try {
    // Le format A4 doit être demandé explicitement, comme pour la quittance :
    // sans ces deux valeurs, `expo-print` prend le format US Letter et la
    // feuille se scinde en deux. Voir `page.ts`.
    const resultat = await Print.printToFileAsync({
      html,
      base64: false,
      width: PAGE_IMPRESSION.largeurPt,
      height: PAGE_IMPRESSION.hauteurPt,
    });
    uriTemporaire = resultat.uri;
  } catch (erreur) {
    throw new ErreurEmission(
      "Le PDF du bail n'a pas pu être produit. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // --- 5. Rangement dans le dossier des documents -------------------------
  const titre = titreDuBail(contenu.categorie, contenu.dateDebut);
  let destination: string;
  try {
    const range = await deplacerPiece({
      sourceUri: uriTemporaire,
      type: 'bail',
      titre,
      date: contenu.dateDebut,
    });
    destination = range.chemin;
  } catch (erreur) {
    await FileSystem.deleteAsync(uriTemporaire, { idempotent: true }).catch(() => undefined);
    throw new ErreurEmission(
      "Le PDF du bail a été produit mais n'a pas pu être rangé dans le dossier du logement. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // --- 6. La ligne, puis la mise à jour de la location --------------------
  const donnees: DonneesBail = {
    categorie: contenu.categorie,
    dureeMois: contenu.dureeMois,
    fin: finDuBailISO(contenu.dateDebut, contenu.dureeMois),
    depotGarantie: contenu.depotGarantie,
    jourEcheance: contenu.jourEcheance,
    motifMobilite: contenu.motifMobilite ?? null,
    annexes: contenu.annexes,
    diagnostics: (brouillon.diagnostics ?? []).map((d) => ({
      libelle: d.libelle,
      date: d.date,
      aRenouveler: d.aRenouveler === true,
    })),
    signatures: contenu.signatures,
    clausesParticulieres: contenu.clausesParticulieres ?? null,
    residencePrincipale: contenu.residencePrincipale === true,
    etabliLe,
  };

  let piece: PieceDossier;
  try {
    piece = await enregistrerPiece({
      logementId: logement.id,
      bailId: bail.id,
      type: 'bail',
      titre,
      dateDocument: contenu.dateDebut,
      cheminFichier: destination,
      donnees: JSON.stringify(donnees),
    });
  } catch (erreur) {
    // Le PDF existe déjà : on le retire pour ne pas laisser un fichier que
    // rien ne référence, et que personne ne saurait retrouver.
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    throw new ErreurEmission(
      "Le bail a été produit mais n'a pas pu être enregistré dans le dossier. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // Le dépôt et le jour d'échéance peuvent avoir été corrigés dans le
  // formulaire : ils sont réécrits sur la location, pour qu'il n'existe pas un
  // dépôt imprimé et un autre enregistré. On n'écrit que s'il y a un écart, afin
  // de ne pas dater une modification qui n'a pas eu lieu.
  const aCorriger: Parameters<typeof modifierBail>[1] = {};
  if ((bail.depotGarantie ?? null) !== contenu.depotGarantie) {
    aCorriger.depotGarantie = contenu.depotGarantie;
  }
  if (bail.jourEcheance !== contenu.jourEcheance) {
    aCorriger.jourEcheance = contenu.jourEcheance;
  }
  if (Object.keys(aCorriger).length > 0) {
    await modifierBail(bail.id, aCorriger);
  }

  // Le brouillon a abouti : le laisser ferait proposer de reprendre un travail
  // terminé. Son retrait vient en dernier — si une étape précédente échoue, le
  // bailleur doit retrouver sa saisie.
  await supprimerBrouillon(logement.id, 'bail');

  return { piece, donnees };
}
