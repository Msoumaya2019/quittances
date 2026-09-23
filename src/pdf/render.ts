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
import { cumulerPaiementsPourCle, determinerStatut, soldeRestant } from '../domain/payments';
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
import { MODES_PAIEMENT, nomPourDocument, type Document, type TypeDocument } from '../domain/types';
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
  /** Type souhaité. Une quittance est refusée si le mois n'est pas soldé. */
  type: TypeDocument;
}

/**
 * Émet un document et renvoie sa fiche, une fois le PDF écrit sur l'appareil.
 *
 * Contrôles appliqués avant toute écriture :
 *  1. le logement et son bail existent ;
 *  2. le mois est couvert par le bail ;
 *  3. une **quittance** n'est émise que si le règlement est intégral ;
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
  if (demande.type === 'quittance' && solde > 0) {
    throw new ErreurEmission(
      `Le règlement de ${libelleLongCapitalise(mois)} n'est pas complet : ` +
        `il reste ${(solde / 100).toFixed(2).replace('.', ',')} € à percevoir. ` +
        'Un reçu peut être émis à la place.',
    );
  }

  // Un reçu suppose un paiement, même partiel.
  if (demande.type === 'recu' && cumul.encaisse <= 0) {
    throw new ErreurEmission(
      `Aucun paiement n'est enregistré pour ${libelleLongCapitalise(mois)}. ` +
        'Enregistrez d’abord le règlement, ou émettez un avis d’échéance.',
    );
  }

  if (demande.type === 'avis_echeance' && cumul.encaisse > 0) {
    throw new ErreurEmission(
      `Un paiement est déjà enregistré pour ${libelleLongCapitalise(mois)}. ` +
        'Un avis d’échéance n’a plus lieu d’être.',
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

  const modesPaiement = Array.from(
    new Set(
      cumul.paiements.map(
        (p) => MODES_PAIEMENT.find((m) => m.valeur === p.mode)?.libelle ?? 'Autre',
      ),
    ),
  );

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
    datesPaiement: cumul.dates.map((d) => formaterDateFr(d)),
    modesPaiement,
    dateEcheance: formaterDateCourte(echeance),
    periodeDebut: formaterDateCourte(premierJour(mois)),
    periodeFin: formaterDateCourte(dernierJour(mois)),
    echeanceLibelle: formaterDateFr(echeance),
    resteAPercevoir: solde,
    lieuEmission: reglages.lieuEmission || proprietaire.ville,
    signatureBase64: signatureIncluse ? reglages.signatureBase64 : null,
    mentionLibre: reglages.mentionLibre,
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

/**
 * Détermine le document que l'application a le droit d'émettre pour un mois.
 * Renvoie aussi l'explication, pour que l'écran puisse l'afficher.
 */
export async function diagnostiquerMois(
  logementId: string,
  periode: string,
): Promise<{
  peutQuittance: boolean;
  peutRecu: boolean;
  peutAvis: boolean;
  explication: string;
}> {
  const logement = await trouverLogement(logementId);
  if (!logement) {
    return {
      peutQuittance: false,
      peutRecu: false,
      peutAvis: false,
      explication: "Ce logement n'existe plus.",
    };
  }

  const bail = await bailEnCours(logementId);
  if (!bail) {
    return {
      peutQuittance: false,
      peutRecu: false,
      peutAvis: false,
      explication: "Ce logement n'a pas de locataire en place.",
    };
  }

  const mois = depuisCle(periode);
  if (!mois) {
    return {
      peutQuittance: false,
      peutRecu: false,
      peutAvis: false,
      explication: 'Le mois demandé est invalide.',
    };
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
      peutRecu: false,
      peutAvis: false,
      explication: `Le logement n'était pas loué en ${libelleLongCapitalise(mois)}.`,
    };
  }

  if (statut === 'paye') {
    return {
      peutQuittance: true,
      peutRecu: false,
      peutAvis: false,
      explication: 'Le loyer est intégralement réglé : la quittance peut être générée.',
    };
  }

  if (statut === 'partiel') {
    const restant = soldeRestant(montantDu, cumul);
    return {
      peutQuittance: false,
      peutRecu: true,
      peutAvis: false,
      explication:
        `Paiement partiel enregistré. Il reste ${(restant / 100).toFixed(2).replace('.', ',')} € à percevoir : ` +
        'un reçu peut être remis en attendant le solde complet.',
    };
  }

  return {
    peutQuittance: false,
    peutRecu: false,
    peutAvis: true,
    explication:
      "Aucun paiement n'est enregistré pour ce mois. Un avis d'échéance peut être remis au locataire.",
  };
}

/** Retrouve le bail utilisé par un logement, ou `null`. */
export async function bailDuLogement(logementId: string): Promise<string | null> {
  const bail = await bailEnCours(logementId);
  return bail?.id ?? null;
}

/** Charge un bail par son identifiant, pour les écrans qui n'ont que lui. */
export { trouverBail };
