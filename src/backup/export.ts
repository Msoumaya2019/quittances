/**
 * Export d'une sauvegarde complète.
 *
 * La sauvegarde contient tout ce qu'il faut pour retrouver l'application telle
 * qu'elle était : propriétaires, logements, baux, locataires, historiques de
 * loyers, paiements, documents **et** réglages — signature comprise. Sans les
 * réglages, une restauration perdrait le modèle choisi et la signature, et les
 * documents suivants ne seraient plus conformes à ceux d'avant.
 *
 * Elle contient aussi **les fichiers eux-mêmes**, et c'est un changement de
 * promesse, décidé par la mesure : les photos d'un état des lieux ou d'un
 * inventaire n'existent **que** sous forme de fichiers. La base ne porte que
 * leur chemin. Une sauvegarde sans eux laissait donc un bailleur restaurer son
 * dossier et découvrir des constats sans images — sans recours, puisque rien ne
 * les reconstitue.
 *
 * Le fichier produit est chiffré. Une simple copie de la base SQLite ne serait
 * pas une sauvegarde sûre : elle serait lisible par quiconque met la main sur
 * le téléphone. Les fichiers sont chiffrés avec le reste, et non joints en
 * clair : des photos de logement sont des données personnelles.
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
import { toutesLesPieces } from '@/db/repositories/pieces';
import { dateDuJour, maintenantISO } from '@/db/ids';
import { DOSSIER_DOCUMENTS } from '@/db/reinitialisation';
import type {
  Bail,
  Document,
  Logement,
  Paiement,
  PeriodeLoyer,
  PieceDossier,
  Proprietaire,
  TitulaireBail,
} from '@/domain/types';

import {
  chiffrer,
  ErreurSauvegarde,
  VERSION_FORMAT,
  type EnveloppeSauvegarde,
} from './crypto';

/**
 * Version du contenu sauvegardé, distincte de la version du format de fichier.
 *
 * 1 → 2 : les fichiers du dossier documentaire sont joints. Le changement est
 * **purement additif** — une sauvegarde de version 1 se restaure sans fichiers,
 * ce qui est exactement ce qu'elle contenait — et le sens de lecture reste le
 * même : le champ nouveau est facultatif, jamais exigé.
 */
export const VERSION_CONTENU = 2;

/**
 * Un fichier du dossier documentaire, dans la sauvegarde.
 *
 * `chemin` est **relatif au dossier de l'application**, et non absolu : le
 * chemin absolu d'une application change à chaque installation, et une
 * sauvegarde restaurée sur un autre téléphone ne retrouverait rien. C'est
 * exactement le piège que la restauration évitait déjà en interrogeant le
 * fichier plutôt que le chemin.
 */
export interface FichierSauvegarde {
  /** Chemin relatif au dossier de l'application, par exemple `documents/photos/a.jpg`. */
  chemin: string;
  /** Le contenu du fichier, encodé en base64. */
  donnees: string;
}

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
    /**
     * Les pièces du dossier documentaire : baux signés, états des lieux,
     * inventaires, autres documents.
     *
     * Le champ est **facultatif**, et c'est délibéré : une sauvegarde écrite par
     * la version 1.0.2 n'en contient pas, et la refuser ferait perdre à
     * l'utilisateur l'accès à ses propres sauvegardes. Une sauvegarde ancienne
     * se restaure donc sans pièces, ce qui est exactement ce qu'elle contenait.
     */
    pieces?: PieceDossier[];
    /**
     * Les fichiers du dossier documentaire : PDF émis, photos des constats,
     * documents scannés. Facultatif pour la même raison que `pieces` — une
     * sauvegarde de version 1 n'en a pas.
     */
    fichiers?: FichierSauvegarde[];
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
    pieces?: number;
    /** Nombre de fichiers joints. */
    fichiers?: number;
    /** Poids des fichiers joints, en octets, avant encodage. */
    octetsFichiers?: number;
  };
}

/**
 * Ce que la sauvegarde accepte d'embarquer, en octets de fichiers.
 *
 * Un plafond, et il se dit : au-delà, l'application refuse et l'explique, au
 * lieu de laisser le téléphone manquer de mémoire au milieu du chiffrement. Une
 * sauvegarde qui échoue en silence serait pire qu'un refus annoncé.
 *
 * 64 Mo couvrent largement un dossier réel : plusieurs centaines de photos
 * compressées, et les PDF qui les accompagnent.
 */
export const TAILLE_MAXIMALE_FICHIERS = 64 * 1024 * 1024;


/**
 * Rassemble toutes les données de l'application.
 *
 * Les baux, locataires et historiques de loyers sont chargés logement par
 * logement : ils dépendent du logement, et un logement peut avoir eu plusieurs
 * locataires successifs qu'il faut tous conserver.
 */
export async function rassemblerDonnees(): Promise<ContenuSauvegarde['donnees']> {
  const [proprietaires, logements, paiements, documents, pieces, reglages] = await Promise.all([
    listerProprietaires(),
    listerLogements(),
    tousLesPaiements(),
    tousLesDocuments(),
    toutesLesPieces(),
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

  return {
    proprietaires,
    logements,
    baux,
    titulaires,
    periodesLoyer,
    paiements,
    documents,
    pieces,
    reglages,
  };
}

/** Prépare le contenu de sauvegarde, en clair. */
export async function preparerContenu(): Promise<ContenuSauvegarde> {
  const donnees = await rassemblerDonnees();
  const fichiers = await rassemblerFichiers();

  return {
    version: VERSION_CONTENU,
    creeLe: maintenantISO(),
    application: 'Quittances',
    donnees: { ...donnees, fichiers },
    resume: {
      proprietaires: donnees.proprietaires.length,
      logements: donnees.logements.length,
      baux: donnees.baux.length,
      titulaires: donnees.titulaires.length,
      periodesLoyer: donnees.periodesLoyer.length,
      paiements: donnees.paiements.length,
      documents: donnees.documents.length,
      pieces: (donnees.pieces ?? []).length,
      fichiers: fichiers.length,
      octetsFichiers: fichiers.reduce(
        // Le base64 gonfle d'environ un tiers : le décompte annoncé à
        // l'utilisateur doit être celui des fichiers, pas celui de leur
        // encodage.
        (total, f) => total + Math.floor((f.donnees.length * 3) / 4),
        0,
      ),
    },
  };
}

/**
 * Les fichiers du dossier documentaire, encodés pour la sauvegarde.
 *
 * Le parcours est **récursif** : les photos des constats vivent dans
 * `documents/photos/`, les pièces dans `documents/`. Ne lire que le premier
 * niveau laisserait les photos de côté, et c'est précisément ce qu'on ne peut
 * pas reconstituer.
 *
 * Le dossier des sauvegardes n'est jamais parcouru : il vit à côté, et
 * l'embarquer ferait entrer une sauvegarde dans la suivante.
 *
 * Lève quand le dossier dépasse le plafond, avec une phrase qui dit quoi faire.
 * Un refus annoncé vaut mieux qu'un manque de mémoire au milieu du chiffrement.
 */
export async function rassemblerFichiers(): Promise<FichierSauvegarde[]> {
  const racine = `${FileSystem.documentDirectory}${DOSSIER_DOCUMENTS}`;
  const info = await FileSystem.getInfoAsync(racine);
  if (!info.exists) return [];

  const fichiers: FichierSauvegarde[] = [];
  let octets = 0;

  const parcourir = async (dossier: string): Promise<void> => {
    let noms: string[];
    try {
      noms = await FileSystem.readDirectoryAsync(dossier);
    } catch {
      // Un sous-dossier illisible ne doit pas faire échouer toute la
      // sauvegarde : ce qui est lisible est sauvegardé, et le reste est signalé
      // par son absence au moment de la restauration.
      return;
    }

    for (const nom of noms) {
      const chemin = `${dossier}${nom}`;
      // `getInfoAsync` rend la taille d'un fichier sans qu'on la demande : la
      // seule option qu'il connaisse est l'empreinte MD5.
      const fiche = await FileSystem.getInfoAsync(chemin);
      if (!fiche.exists) continue;
      if (fiche.isDirectory) {
        await parcourir(`${chemin}/`);
        continue;
      }

      octets += fiche.size ?? 0;
      if (octets > TAILLE_MAXIMALE_FICHIERS) {
        throw new ErreurSauvegarde(
          `Le dossier documentaire dépasse ${Math.floor(
            TAILLE_MAXIMALE_FICHIERS / (1024 * 1024),
          )} Mo, ce que cette sauvegarde ne peut pas embarquer d’un coup. ` +
            'Rangez ou déplacez les documents les plus anciens depuis la fiche du logement, ' +
            'puis relancez la sauvegarde.',
        );
      }

      const donnees = await FileSystem.readAsStringAsync(chemin, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Le chemin enregistré est relatif au dossier de l'application : le
      // chemin absolu change à chaque installation, et le restaurer tel quel
      // désignerait un dossier qui n'existe pas sur l'autre téléphone.
      fichiers.push({
        chemin: chemin.slice(FileSystem.documentDirectory!.length),
        donnees,
      });
    }
  };

  await parcourir(`${racine}/`);
  return fichiers;
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
