/**
 * Réglages de l'application : préférences du bailleur, conservées localement.
 *
 * Un accès typé évite d'éparpiller des chaînes de caractères dans les écrans :
 * une clé mal orthographiée devient une erreur de compilation.
 */

import { executer, lireToutes } from '../database';
import type { ModeleDocument } from '../../domain/types';

export interface Reglages {
  /** Modèle de document utilisé par défaut. */
  modeleParDefaut: ModeleDocument;
  /** Signature du bailleur, en base64 (image) ou `null`. */
  signatureBase64: string | null;
  /** Faut-il apposer la signature sur les documents émis ? */
  signatureActive: boolean;
  /** Lieu d'émission imprimé sur les documents. */
  lieuEmission: string;
  /** Préfixe affiché avant le nom du bailleur dans les documents. */
  civiliteBailleur: string;
  /** Verrouillage biométrique activé. */
  verrouBiometrique: boolean;
  /** Inclure les charges dans le total de la quittance. */
  mentionCharges: boolean;
  /** Mention libre ajoutée au bas des documents. */
  mentionLibre: string;
  /** Rappel automatique des loyers non réglés. */
  rappelPaiements: boolean;
  /** Jour du mois où le rappel est déclenché. */
  jourRappel: number;
}

export const REGLAGES_PAR_DEFAUT: Reglages = {
  modeleParDefaut: 'classique',
  signatureBase64: null,
  signatureActive: false,
  lieuEmission: '',
  civiliteBailleur: '',
  verrouBiometrique: false,
  mentionCharges: true,
  mentionLibre: '',
  rappelPaiements: false,
  jourRappel: 10,
};

/** Traduction entre les clés de la table et les champs typés. */
const CLES: Record<keyof Reglages, string> = {
  modeleParDefaut: 'modele_par_defaut',
  signatureBase64: 'signature_base64',
  signatureActive: 'signature_active',
  lieuEmission: 'lieu_emission',
  civiliteBailleur: 'civilite_bailleur',
  verrouBiometrique: 'verrou_biometrique',
  mentionCharges: 'mention_charges',
  mentionLibre: 'mention_libre',
  rappelPaiements: 'rappel_paiements',
  jourRappel: 'jour_rappel',
};

function serialiser(valeur: unknown): string {
  return JSON.stringify(valeur);
}

function deserialiser<T>(brut: string, defaut: T): T {
  try {
    const valeur = JSON.parse(brut) as T;
    return valeur === null || valeur === undefined ? defaut : valeur;
  } catch {
    return defaut;
  }
}

/** Lit tous les réglages, complétés par les valeurs par défaut. */
export async function lireReglages(): Promise<Reglages> {
  const lignes = await lireToutes<{ cle: string; valeur: string }>('SELECT * FROM reglages');

  const parCle = new Map(lignes.map((l) => [l.cle, l.valeur]));
  const resultat = { ...REGLAGES_PAR_DEFAUT };

  for (const [champ, cle] of Object.entries(CLES) as [keyof Reglages, string][]) {
    const brut = parCle.get(cle);
    if (brut === undefined) continue;

    const defaut = REGLAGES_PAR_DEFAUT[champ];
    // `as never` est nécessaire : le type de la valeur dépend du champ, que
    // TypeScript ne peut pas relier ici. La validation est faite ci-dessous.
    (resultat[champ] as unknown) = deserialiser(brut, defaut);
  }

  // Contrôles de forme : une valeur corrompue ne doit pas casser l'application.
  if (resultat.modeleParDefaut !== 'classique' && resultat.modeleParDefaut !== 'moderne') {
    resultat.modeleParDefaut = REGLAGES_PAR_DEFAUT.modeleParDefaut;
  }
  if (
    !Number.isInteger(resultat.jourRappel) ||
    resultat.jourRappel < 1 ||
    resultat.jourRappel > 28
  ) {
    resultat.jourRappel = REGLAGES_PAR_DEFAUT.jourRappel;
  }

  return resultat;
}

/** Écrit un ou plusieurs réglages. */
export async function ecrireReglages(partiel: Partial<Reglages>): Promise<void> {
  const entrees = Object.entries(partiel) as [keyof Reglages, unknown][];
  if (entrees.length === 0) return;

  for (const [champ, valeur] of entrees) {
    const cle = CLES[champ];
    if (!cle) continue;
    await executer(
      `INSERT INTO reglages (cle, valeur) VALUES (?, ?)
       ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`,
      [cle, serialiser(valeur)],
    );
  }
}

/** Réinitialise un réglage à sa valeur par défaut. */
export async function reinitialiserReglage(champ: keyof Reglages): Promise<void> {
  await executer('DELETE FROM reglages WHERE cle = ?', [CLES[champ]]);
}
