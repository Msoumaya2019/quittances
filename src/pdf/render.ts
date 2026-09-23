/**
 * Émission d'un document : assemblage du contenu, impression PDF, stockage.
 *
 * C'est le point d'entrée unique de la génération. Aucun écran ne fabrique un
 * document à la main : ils appellent tous `emettreDocument`, qui applique les
 * mêmes règles de fond et de forme.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

import {
  bailEnCours,
  trouverBail,
  trouverLogement,
  periodesLoyerDuBail,
  titulairesDuBail,
} from '../db/repositories/properties';
import { trouverProprietaire } from '../db/repositories/owners';
import {
  cumulerPaiementsPourCle,
  determinerStatut,
  paiementsImprimes,
  soldeRestant,
  type DocumentEmissible,
} from '../domain/payments';
import { mentionPourDocument } from '../domain/mentions';
import { montantDuPourCle } from '../domain/rent';
import { paiementsPourBail } from './chargement';
import {
  enregistrerDocument,
  nomFichierPour,
  prochainNumero,
} from '../db/repositories/documents';
import { lireReglages } from '../db/repositories/settings';
import {
  libelleLongCapitalise,
  depuisCle,
  echeanceDuMois,
  formaterDateCourte,
  formaterDateFr,
  aujourdHui,
  premierJour,
  dernierJour,
  periodeActuelle,
} from '../domain/period';
import { nomPourDocument, type Document, type TypeDocument } from '../domain/types';
import { adresseEnLignes } from '../domain/types';
import { rendreHtml, type ContenuDocument } from './models';
import { PAGE_IMPRESSION } from './page';

export class ErreurEmission extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurEmission';
  }
}

export interface DemandeEmission {
  logementId: string;
  /** Mois concerné, clé `AAAA-MM`. */
  periode: string;
  /**
   * Type souhaité. Le type est `DocumentEmissible`, pas `TypeDocument` : le
   * domaine a restreint la **création** à la seule quittance, alors que la
   * lecture continue d'accepter les reçus et avis d'échéance déjà émis. Le
   * compilateur refuse donc ici un reçu, ce qu'aucun test n'aurait pu garantir
   * aussi tôt.
   */
  type: DocumentEmissible;
}

/**
 * Émet un document et renvoie sa fiche, une fois le PDF écrit sur l'appareil.
 *
 * L'application ne **crée** qu'une quittance. Les reçus et les avis d'échéance
 * émis par une version antérieure restent lisibles — la base et les sauvegardes
 * les portent — mais ils ne s'émettent plus.
 *
 * Contrôles appliqués avant toute écriture :
 *  1. le logement et son bail existent ;
 *  2. le mois est couvert par le bail ;
 *  3. la **quittance** n'est émise que si le règlement est intégral ;
 *  4. le montant attesté correspond exactement à la somme des paiements.
 */
export async function emettreDocument(demande: DemandeEmission): Promise<Document> {
  const logement = await trouverLogement(demande.logementId);
  if (!logement) {
    throw new ErreurEmission("Ce logement n'existe plus.");
  }

  const bail = await bailEnCours(logement.id);
  if (!bail) {
    throw new ErreurEmission(
      "Ce logement n'a pas de locataire en place. Ajoutez un locataire pour émettre un document.",
    );
  }

  const proprietaire = await trouverProprietaire(logement.proprietaireId);
  if (!proprietaire) {
    throw new ErreurEmission("Le propriétaire de ce logement est introuvable.");
  }

  const mois = depuisCle(demande.periode);
  if (!mois) {
    throw new ErreurEmission(`Le mois demandé est invalide : ${demande.periode}`);
  }

  const [periodesLoyer, titulaires, paiements] = await Promise.all([
    periodesLoyerDuBail(bail.id),
    titulairesDuBail(bail.id),
    paiementsPourBail(bail.id),
  ]);

  const montantDu = montantDuPourCle(bail, periodesLoyer, demande.periode);
  const cumul = cumulerPaiementsPourCle(paiements, demande.periode);

  if (montantDu.total <= 0) {
    throw new ErreurEmission(
      `Aucun loyer n'est dû pour ${libelleLongCapitalise(mois)}. ` +
        "Vérifiez les dates de location et le montant du loyer.",
    );
  }

  const solde = soldeRestant(montantDu, cumul);

  // Garde-fou central : jamais de quittance sans paiement intégral.
  //
  // C'est le dernier verrou avant l'écriture du fichier. Il double celui du
  // domaine — `documentAutorise` — parce qu'ici le mois est relu de la base, et
  // qu'un écran ne peut pas le contourner.
  if (solde > 0) {
    throw new ErreurEmission(
      `Le règlement de ${libelleLongCapitalise(mois)} n'est pas complet : ` +
        `il reste ${(solde / 100).toFixed(2).replace('.', ',')} € à percevoir. ` +
        'Enregistrez le paiement manquant : la quittance s’ouvrira alors.',
    );
  }

  const reglages = await lireReglages();
  const numero = await prochainNumero(demande.type, mois.annee);
  const dateEmission = aujourdHui();

  const adresseBailleur = [
    proprietaire.adresse.trim(),
    `${proprietaire.codePostal.trim()} ${proprietaire.ville.trim()}`.trim(),
  ].filter((l) => l.length > 0);

  const adresseLogement = adresseEnLignes({
    adresse: logement.adresse,
    complement: logement.complement,
    codePostal: logement.codePostal,
    ville: logement.ville,
  });

  const locataires =
    titulaires.length > 0
      ? titulaires.map((t) => nomPourDocument(t))
      : ['Le locataire'];

  const signatureIncluse = reglages.signatureActive && !!reglages.signatureBase64;

  // Date d'exigibilité du loyer du mois : le jour convenu au bail, ramené au
  // dernier jour quand le mois est plus court (un bail au 31 en février).
  const echeance = echeanceDuMois(mois, bail.jourEcheance);

  const contenu: ContenuDocument = {
    type: demande.type,
    numero,
    periodeLibelle: libelleLongCapitalise(mois),
    dateEmission: formaterDateFr(dateEmission),
    emetteur: {
      nom: proprietaire.nom,
      civilite: reglages.civiliteBailleur,
      adresse: adresseBailleur,
      qualite: proprietaire.qualite ?? null,
      telephone: proprietaire.telephone ?? null,
      email: proprietaire.email ?? null,
      siret: proprietaire.siret ?? null,
    },
    locataires,
    logement: {
      nom: logement.nom,
      adresse: adresseLogement,
    },
    montants: {
      loyer: montantDu.loyer,
      charges: montantDu.charges,
      total: montantDu.total,
    },
    montantRecu: cumul.encaisse,
    // L'appariement date/mode est fait une seule fois, dans le domaine : deux
    // listes parallèles finissaient par nommer un mode de paiement qui n'était
    // pas celui de l'encaissement.
    paiements: paiementsImprimes(cumul),
    dateEcheance: formaterDateCourte(echeance),
    periodeDebut: formaterDateCourte(premierJour(mois)),
    periodeFin: formaterDateCourte(dernierJour(mois)),
    echeanceLibelle: formaterDateFr(echeance),
    resteAPercevoir: solde,
    lieuEmission: reglages.lieuEmission || proprietaire.ville,
    signatureBase64: signatureIncluse ? reglages.signatureBase64 : null,
    // La mention est bornée ici, et pas seulement à la saisie : une sauvegarde
    // restaurée peut en porter une plus longue, et un volet en `flex` ne se
    // poursuit pas sur la page suivante — il perd le débordement en silence.
    mentionLibre: mentionPourDocument(reglages.mentionLibre),
    mentionCharges: reglages.mentionCharges,
  };

  const html = rendreHtml(contenu, reglages.modeleParDefaut);

  // --- Impression du PDF -------------------------------------------------
  let uriTemporaire: string;
  try {
    // Le format de page doit être demandé explicitement : sans ces deux
    // valeurs, `expo-print` prend le format US Letter — 279,4 mm de haut — et
    // la feuille de 297 mm se scinde en deux, le talon à découper partant seul
    // sur la seconde page. Voir `page.ts` pour la mesure et le choix des
    // valeurs.
    const resultat = await Print.printToFileAsync({
      html,
      base64: false,
      width: PAGE_IMPRESSION.largeurPt,
      height: PAGE_IMPRESSION.hauteurPt,
    });
    uriTemporaire = resultat.uri;
  } catch (erreur) {
    throw new ErreurEmission(
      "Le PDF n'a pas pu être produit. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // --- Déplacement vers le dossier des documents -------------------------
  const dossier = `${FileSystem.documentDirectory}documents/`;
  const nomFichier = nomFichierPour({
    type: demande.type,
    numero,
    logementNom: logement.nom,
    periode: demande.periode,
  });
  const destination = `${dossier}${nomFichier}`;

  try {
    const info = await FileSystem.getInfoAsync(dossier);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
    }
    await FileSystem.moveAsync({ from: uriTemporaire, to: destination });
  } catch (erreur) {
    throw new ErreurEmission(
      "Le PDF a été produit mais n'a pas pu être enregistré dans l'application. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }

  // --- Enregistrement en base --------------------------------------------
  try {
    return await enregistrerDocument({
      numero,
      type: demande.type,
      logementId: logement.id,
      bailId: bail.id,
      periode: demande.periode,
      logementNom: logement.nom,
      proprietaireNom: proprietaire.nom,
      proprietaireAdresse: adresseBailleur.join(', '),
      logementAdresse: adresseLogement.join(', '),
      titulaires: locataires,
      loyer: montantDu.loyer,
      charges: montantDu.charges,
      total: montantDu.total,
      datesPaiement: cumul.dates,
      dateEmission,
      modele: reglages.modeleParDefaut,
      cheminFichier: destination,
      signatureIncluse,
    });
  } catch (erreur) {
    // Le PDF existe déjà : on le retire pour ne pas laisser un fichier orphelin
    // que rien ne référencerait, et qui encombrerait le stockage.
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    throw new ErreurEmission(
      "Le document n'a pas pu être enregistré dans l'application. " +
        (erreur instanceof Error ? `Détail technique : ${erreur.message}` : ''),
    );
  }
}

/** Ce que l'application peut dire d'un mois, en vue d'une quittance. */
export interface DiagnosticMois {
  /** Le mois peut-il donner lieu à une quittance ? */
  peutQuittance: boolean;
  /** Pourquoi, en français, à afficher tel quel par l'écran. */
  explication: string;
}

/**
 * Détermine si le mois peut donner lieu à une quittance, et pourquoi.
 *
 * L'explication est écrite ici, pas dans l'écran : c'est la même phrase qui sert
 * de motif au refus et de message à l'utilisateur, donc elle ne peut pas
 * annoncer autre chose que ce que l'émission fera réellement.
 */
export async function diagnostiquerMois(
  logementId: string,
  periode: string,
): Promise<DiagnosticMois> {
  const logement = await trouverLogement(logementId);
  if (!logement) {
    return { peutQuittance: false, explication: "Ce logement n'existe plus." };
  }

  const bail = await bailEnCours(logementId);
  if (!bail) {
    return {
      peutQuittance: false,
      explication: "Ce logement n'a pas de locataire en place.",
    };
  }

  const mois = depuisCle(periode);
  if (!mois) {
    return { peutQuittance: false, explication: 'Le mois demandé est invalide.' };
  }

  const [periodesLoyer, paiements] = await Promise.all([
    periodesLoyerDuBail(bail.id),
    paiementsPourBail(bail.id),
  ]);

  const montantDu = montantDuPourCle(bail, periodesLoyer, periode);
  const cumul = cumulerPaiementsPourCle(paiements, periode);
  const statut = determinerStatut({
    montantDu,
    cumul,
    periode: mois,
    bail,
    periodeDuJour: periodeActuelle(),
    jourDuJour: new Date().getDate(),
  });

  if (statut === 'hors_bail') {
    return {
      peutQuittance: false,
      explication: `Le logement n'était pas loué en ${libelleLongCapitalise(mois)}.`,
    };
  }

  if (statut === 'paye') {
    return {
      peutQuittance: true,
      explication: 'Le loyer est intégralement réglé : la quittance peut être générée.',
    };
  }

  if (statut === 'partiel') {
    const restant = soldeRestant(montantDu, cumul);
    return {
      peutQuittance: false,
      explication:
        `Paiement partiel enregistré : il reste ${(restant / 100).toFixed(2).replace('.', ',')} € à percevoir. ` +
        'Une quittance ne peut attester qu’un règlement intégral — enregistrez le complément.',
    };
  }

  return {
    peutQuittance: false,
    explication:
      "Aucun paiement n'est enregistré pour ce mois. " +
      'Enregistrez le règlement du loyer pour obtenir la quittance.',
  };
}

/** Retrouve le bail utilisé par un logement, ou `null`. */
export async function bailDuLogement(logementId: string): Promise<string | null> {
  const bail = await bailEnCours(logementId);
  return bail?.id ?? null;
}

/** Charge un bail par son identifiant, pour les écrans qui n'ont que lui. */
export { trouverBail };
