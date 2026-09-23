/**
 * Cryptographie de la sauvegarde.
 *
 * Une sauvegarde contient des noms, des adresses, des montants et des
 * signatures : la chiffrer n'est pas un luxe. On emploie donc AES-256-GCM, qui
 * chiffre **et** authentifie. Une sauvegarde modifiée est détectée et refusée,
 * au lieu d'être restaurée silencieusement de travers.
 *
 * La clé n'est jamais stockée : elle est recalculée à partir du mot de passe,
 * au moyen de PBKDF2-HMAC-SHA256 et d'un sel tiré au hasard pour chaque
 * sauvegarde. Posséder le fichier ne suffit donc pas à le lire.
 *
 * Le format est volontairement stable et versionné : une sauvegarde faite
 * aujourd'hui doit rester restaurable dans deux ans.
 */

import * as Crypto from 'expo-crypto';

import { deriverCleDepuisMotDePasse, pbkdf2 } from './pbkdf2.ts';
import {
  base64VersOctets,
  chaineVersOctets,
  octetsVersBase64,
  octetsVersChaine,
} from '../pdf/encodage.ts';

/**
 * Itérations PBKDF2.
 *
 * Ce calcul tourne en JavaScript : chaque itération refait un HMAC complet. La
 * valeur retenue vise l'équilibre entre la résistance à une attaque par force
 * brute et un déverrouillage qui reste acceptable sur un téléphone d'entrée de
 * gamme. Le nombre employé est enregistré dans la sauvegarde, ce qui permettra
 * de l'augmenter sans rendre les anciens fichiers illisibles.
 */
export const ITERATIONS_PBKDF2 = 60_000;

/** Longueur de la clé AES-256, en octets. */
export const TAILLE_CLE = 32;

/** Longueur du sel, en octets. */
export const TAILLE_SEL = 16;

/** Longueur du vecteur d'initialisation GCM, en octets. */
export const TAILLE_IV = 12;

/** Marque en tête de sauvegarde : reconnaître le fichier sans tenter de le lire. */
export const MAGIE = 'QUITTANCES-SAUVEGARDE';

/** Version du format. À incrémenter seulement si la structure change. */
export const VERSION_FORMAT = 1;

/**
 * Enveloppe d'une sauvegarde, telle qu'écrite dans le fichier `.json`.
 *
 * Les métadonnées sont en clair : elles ne révèlent rien de sensible et
 * permettent de dire « ce fichier n'est pas une sauvegarde » avant même de
 * demander un mot de passe.
 */
export interface EnveloppeSauvegarde {
  magie: string;
  version: number;
  /** Sel PBKDF2, en base64. */
  sel: string;
  /** Vecteur d'initialisation GCM, en base64. */
  iv: string;
  iterations: number;
  /** Contenu chiffré, authentifié, en base64. */
  donnees: string;
  /** Empreinte SHA-256 du contenu en clair, pour confirmer l'intégrité. */
  empreinte: string;
  /** Date de création, au format `AAAA-MM-JJ`. */
  creeLe: string;
}

/**
 * Erreur dont le message est directement présentable à l'utilisateur.
 * Un échec de déchiffrement ne doit jamais remonter une erreur technique.
 */
export class ErreurSauvegarde extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurSauvegarde';
  }
}

/** Tire des octets aléatoires cryptographiquement sûrs. */
export async function tirerOctetsAleatoires(taille: number): Promise<Uint8Array> {
  const octets = await Crypto.getRandomBytesAsync(taille);
  return new Uint8Array(octets);
}

/**
 * Dérive la clé de chiffrement depuis le mot de passe.
 *
 * On passe par le PBKDF2 maison, éprouvé contre les vecteurs officiels (voir
 * `tests/pbkdf2.test.ts`), parce que `expo-crypto` ne propose pas de dérivation.
 */
export function deriverCle(
  motDePasse: string,
  sel: Uint8Array,
  iterations = ITERATIONS_PBKDF2,
): Uint8Array {
  if (motDePasse.length < 8) {
    throw new ErreurSauvegarde(
      'Choisissez un mot de passe d’au moins 8 caractères : il protège toutes vos données.',
    );
  }
  return deriverCleDepuisMotDePasse(motDePasse, sel, iterations, TAILLE_CLE);
}

/**
 * Chiffre un contenu textuel et renvoie l'enveloppe à écrire dans le fichier.
 *
 * `quand` est la date de création, au format `AAAA-MM-JJ`.
 */
export async function chiffrer(
  contenu: string,
  motDePasse: string,
  quand: string,
): Promise<EnveloppeSauvegarde> {
  const sel = await tirerOctetsAleatoires(TAILLE_SEL);
  const iv = await tirerOctetsAleatoires(TAILLE_IV);
  const cle = deriverCle(motDePasse, sel);

  const cleAes = await Crypto.AESEncryptionKey.import(cle);

  // Le vecteur d'initialisation est fourni plutôt que tiré par la bibliothèque :
  // il doit être enregistré à côté du contenu pour permettre le déchiffrement.
  const scelle = await Crypto.aesEncryptAsync(chaineVersOctets(contenu), cleAes, {
    nonce: { bytes: iv },
  });

  const chiffre = await scelle.ciphertext({ includeTag: true, encoding: 'bytes' });

  return {
    magie: MAGIE,
    version: VERSION_FORMAT,
    sel: octetsVersBase64(sel),
    iv: octetsVersBase64(iv),
    iterations: ITERATIONS_PBKDF2,
    donnees: octetsVersBase64(new Uint8Array(chiffre)),
    empreinte: await empreinteContenu(contenu),
    creeLe: quand,
  };
}

/**
 * Déchiffre une enveloppe et rend le contenu en clair.
 *
 * Deux causes d'échec sont distinguées, parce qu'elles appellent deux gestes
 * différents : mot de passe erroné, ou fichier abîmé.
 */
export async function dechiffrer(
  enveloppe: EnveloppeSauvegarde,
  motDePasse: string,
): Promise<string> {
  verifierEnveloppe(enveloppe);

  const sel = base64VersOctets(enveloppe.sel);
  const iv = base64VersOctets(enveloppe.iv);
  const donnees = base64VersOctets(enveloppe.donnees);

  if (iv.length !== TAILLE_IV) {
    throw new ErreurSauvegarde(
      'Cette sauvegarde est incomplète : elle ne peut pas être restaurée.',
    );
  }

  const cle = deriverCle(motDePasse, sel, enveloppe.iterations);
  const cleAes = await Crypto.AESEncryptionKey.import(cle);

  let contenu: string;
  try {
    // GCM refuse de déchiffrer si la clé est fausse ou si le contenu a été
    // modifié : les deux cas produisent la même exception, et on le dit.
    const scelle = Crypto.AESSealedData.fromParts(iv, donnees, 16);
    const clair = await Crypto.aesDecryptAsync(scelle, cleAes, { output: 'bytes' });
    contenu = octetsVersChaine(new Uint8Array(clair));
  } catch (e) {
    if (e instanceof ErreurSauvegarde) throw e;
    throw new ErreurSauvegarde(
      'Impossible d’ouvrir cette sauvegarde. Le mot de passe est peut-être erroné, ou le fichier a été modifié.',
    );
  }

  // L'empreinte confirme que le contenu ressorti est bien celui qui avait été
  // enregistré. GCM protège déjà l'intégrité ; ceci couvre en plus le cas d'une
  // lecture partielle du fichier.
  if (enveloppe.empreinte) {
    const obtenue = await empreinteContenu(contenu);
    if (obtenue !== enveloppe.empreinte) {
      throw new ErreurSauvegarde(
        'Le contenu de cette sauvegarde ne correspond pas à ce qui avait été enregistré.',
      );
    }
  }

  return contenu;
}

/** Vérifie qu'une enveloppe est bien une sauvegarde de ce format. */
export function verifierEnveloppe(enveloppe: EnveloppeSauvegarde): void {
  if (!enveloppe || typeof enveloppe !== 'object') {
    throw new ErreurSauvegarde('Ce fichier n’est pas une sauvegarde de l’application.');
  }

  if (enveloppe.magie !== MAGIE) {
    throw new ErreurSauvegarde(
      'Ce fichier n’a pas été créé par l’application. Vérifiez que vous avez choisi le bon fichier.',
    );
  }

  if (!Number.isFinite(enveloppe.version) || enveloppe.version > VERSION_FORMAT) {
    throw new ErreurSauvegarde(
      'Cette sauvegarde a été créée par une version plus récente de l’application.',
    );
  }

  if (!enveloppe.sel || !enveloppe.iv || !enveloppe.donnees) {
    throw new ErreurSauvegarde(
      'Cette sauvegarde est incomplète : elle ne peut pas être restaurée.',
    );
  }

  if (!Number.isFinite(enveloppe.iterations) || enveloppe.iterations < 1_000) {
    throw new ErreurSauvegarde(
      'Cette sauvegarde est incomplète : elle ne peut pas être restaurée.',
    );
  }
}

/** Empreinte SHA-256 du contenu, en hexadécimal. */
export async function empreinteContenu(contenu: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, contenu);
}

/**
 * Vérifie qu'un mot de passe ouvre bien une sauvegarde, sans rien restaurer.
 * Sert à valider la saisie avant d'annoncer une restauration.
 */
export async function verifierMotDePasse(
  enveloppe: EnveloppeSauvegarde,
  motDePasse: string,
): Promise<boolean> {
  try {
    verifierEnveloppe(enveloppe);
    const sel = base64VersOctets(enveloppe.sel);
    const iv = base64VersOctets(enveloppe.iv);
    const donnees = base64VersOctets(enveloppe.donnees);
    const cle = deriverCle(motDePasse, sel, enveloppe.iterations);
    const cleAes = await Crypto.AESEncryptionKey.import(cle);
    const scelle = Crypto.AESSealedData.fromParts(iv, donnees, 16);
    await Crypto.aesDecryptAsync(scelle, cleAes, { output: 'bytes' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Dérive une clé à partir d'un code de récupération, sans mot de passe.
 * Exposé pour permettre un déverrouillage par code, plus tard, sans changer le
 * format des sauvegardes.
 */
export function deriverDepuisCode(code: string, sel: Uint8Array, iterations: number): Uint8Array {
  return pbkdf2(chaineVersOctets(code), sel, iterations, TAILLE_CLE);
}
