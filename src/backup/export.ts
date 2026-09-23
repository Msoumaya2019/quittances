/**
 * Export d'une sauvegarde complète.
 *
 * La sauvegarde contient tout ce qu'il faut pour retrouver l'application telle
 * qu'elle était : propriétaires, logements, baux, locataires, historiques de
 * loyers, paiements, documents **et** réglages — signature comprise. Sans les
 * réglages, une restauration perdrait le modèle choisi et la signature, et les
 * documents suivants ne seraient plus conformes à ceux d'avant.
 *
 * Le fichier produit est chiffré. Une simple copie de la base SQLite ne serait
 * pas une sauvegarde sûre : elle serait lisible par quiconque met la main sur
 * le téléphone.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { lireReglages, type Reglages } from '@/db/repositories/settings';
import { listerProprietaires } from '@/db/repositories/owners';
import {
  bauxDuLogement,
  listerLogements,
  periodesLoyerDuBail,
  titulairesParBail,
} from '@/db/repositories/properties';
import { tousLesPaiements } from '@/db/repositories/payments';
import { tousLesDocuments } from '@/db/repositories/documents';
import { dateDuJour, maintenantISO } from '@/db/ids';
import type {
  Bail,
  Document,
  Logement,
  Paiement,
  PeriodeLoyer,
  Proprietaire,
  TitulaireBail,
} from '@/domain/types';

import {
  chiffrer,
  ErreurSauvegarde,
  VERSION_FORMAT,
  type EnveloppeSauvegarde,
} from './crypto';

/** Version du contenu sauvegardé, distincte de la version du format de fichier. */
export const VERSION_CONTENU = 1;

/**
 * Contenu d'une sauvegarde, en clair avant chiffrement.
 *
 * Les identifiants internes sont conservés tels quels : c'est ce qui permet de
 * recoller les paiements à leurs baux, et les documents à leurs logements.
 */
export interface ContenuSauvegarde {
  version: number;
  creeLe: string;
  application: string;
  donnees: {
    proprietaires: Proprietaire[];
    logements: Logement[];
    baux: Bail[];
    titulaires: TitulaireBail[];
    periodesLoyer: PeriodeLoyer[];
    paiements: Paiement[];
    documents: Document[];
    reglages: Reglages;
  };
  /** Décompte, pour afficher ce que contient la sauvegarde avant de restaurer. */
  resume: {
    proprietaires: number;
    logements: number;
    baux: number;
    titulaires: number;
    periodesLoyer: number;
    paiements: number;
    documents: number;
  };
}

/**
 * Rassemble toutes les données de l'application.
 *
 * Les baux, locataires et historiques de loyers sont chargés logement par
 * logement : ils dépendent du logement, et un logement peut avoir eu plusieurs
 * locataires successifs qu'il faut tous conserver.
 */
export async function rassemblerDonnees(): Promise<ContenuSauvegarde['donnees']> {
  const [proprietaires, logements, paiements, documents, reglages] = await Promise.all([
    listerProprietaires(),
    listerLogements(),
    tousLesPaiements(),
    tousLesDocuments(),
    lireReglages(),
  ]);

  const baux: Bail[] = [];
  for (const logement of logements) {
    baux.push(...(await bauxDuLogement(logement.id)));
  }

  // Les titulaires sont chargés en une fois pour tous les baux, plutôt qu'un
  // par un : sur une centaine de baux, la différence est sensible.
  const titulairesParBailId = await titulairesParBail();

  const titulaires: TitulaireBail[] = [];
  const periodesLoyer: PeriodeLoyer[] = [];

  for (const bail of baux) {
    titulaires.push(...(titulairesParBailId.get(bail.id) ?? []));
    periodesLoyer.push(...(await periodesLoyerDuBail(bail.id)));
  }

  return { proprietaires, logements, baux, titulaires, periodesLoyer, paiements, documents, reglages };
}

/** Prépare le contenu de sauvegarde, en clair. */
export async function preparerContenu(): Promise<ContenuSauvegarde> {
  const donnees = await rassemblerDonnees();

  return {
    version: VERSION_CONTENU,
    creeLe: maintenantISO(),
    application: 'Quittances',
    donnees,
    resume: {
      proprietaires: donnees.proprietaires.length,
      logements: donnees.logements.length,
      baux: donnees.baux.length,
      titulaires: donnees.titulaires.length,
      periodesLoyer: donnees.periodesLoyer.length,
      paiements: donnees.paiements.length,
      documents: donnees.documents.length,
    },
  };
}

/** Dossier des sauvegardes, dans le stockage de l'application. */
function dossierSauvegardes(): string {
  return `${FileSystem.documentDirectory}sauvegardes/`;
}

/** Nom de fichier lisible et daté, pour retrouver la bonne sauvegarde. */
export function nomFichierSauvegarde(date = dateDuJour()): string {
  return `quittances-sauvegarde-${date}.json`;
}

/**
 * Crée la sauvegarde chiffrée et renvoie le chemin du fichier.
 *
 * `progression` est appelée à chaque étape, pour que l'écran puisse dire où en
 * est l'opération : dériver une clé prend un instant visible sur un vieux
 * téléphone.
 */
export async function creerSauvegarde(
  motDePasse: string,
  progression?: (etape: string) => void,
): Promise<{ chemin: string; resume: ContenuSauvegarde['resume'] }> {
  progression?.('Lecture des données…');
  const contenu = await preparerContenu();

  progression?.('Chiffrement…');
  const enveloppe = await chiffrer(JSON.stringify(contenu), motDePasse, dateDuJour());

  progression?.('Enregistrement du fichier…');
  const dossier = dossierSauvegardes();
  const info = await FileSystem.getInfoAsync(dossier);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  }

  const chemin = `${dossier}${nomFichierSauvegarde()}`;
  await FileSystem.writeAsStringAsync(chemin, JSON.stringify(enveloppe, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  progression?.('Terminé.');

  return { chemin, resume: contenu.resume };
}

/**
 * Lit une enveloppe depuis un fichier, sans la déchiffrer.
 * Permet d'annoncer ce que contient la sauvegarde avant de demander le mot de
 * passe, et de refuser tôt un fichier qui n'en est pas une.
 */
export async function lireEnveloppe(chemin: string): Promise<EnveloppeSauvegarde> {
  const existe = await FileSystem.getInfoAsync(chemin);
  if (!existe.exists) {
    throw new ErreurSauvegarde('Ce fichier est introuvable. Il a peut-être été déplacé ou supprimé.');
  }

  let texte: string;
  try {
    texte = await FileSystem.readAsStringAsync(chemin, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    throw new ErreurSauvegarde('Ce fichier n’a pas pu être lu.');
  }

  let enveloppe: EnveloppeSauvegarde;
  try {
    enveloppe = JSON.parse(texte) as EnveloppeSauvegarde;
  } catch {
    throw new ErreurSauvegarde(
      'Ce fichier n’est pas une sauvegarde de l’application. Vérifiez que vous avez choisi le bon fichier.',
    );
  }

  return enveloppe;
}

/** Taille d'une sauvegarde, en octets. Sert à rassurer : « 128 Ko », c'est peu. */
export async function tailleSauvegarde(chemin: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(chemin);
  return info.exists ? info.size : 0;
}

/** Version du format de fichier attendue, exposée pour les messages d'aide. */
export { VERSION_FORMAT };
