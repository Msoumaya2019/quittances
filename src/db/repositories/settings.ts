/**
 * Réglages de l'application : préférences du bailleur, conservées localement.
 *
 * Un accès typé évite d'éparpiller des chaînes de caractères dans les écrans :
 * une clé mal orthographiée devient une erreur de compilation.
 */

import { executer, lireToutes } from '../database';
import { MODELES_PROPOSES, type ModelePropose } from '../../domain/types';
// Import de type uniquement : `palette.ts` ne contient que des données, et rien
// n'est embarqué à l'exécution. Les réglages ont besoin de connaître les valeurs
// admises, pas de dessiner.
import type { CouleurTheme, ModeTheme } from '../../ui/palette';

export interface Reglages {
  /**
   * Modèle de document utilisé par défaut.
   *
   * Le type est celui des modèles **proposés**, plus étroit que celui des
   * modèles lisibles : il est donc impossible d'écrire `officiel` ici, et le
   * compilateur le refuse. C'est ce qui rend le retrait du papier du bailleur
   * définitif plutôt que déconseillé.
   */
  modeleParDefaut: ModelePropose;
  /** Couleur d'accent choisie par le bailleur. */
  couleurTheme: CouleurTheme;
  /** Mode clair ou nuit. */
  modeTheme: ModeTheme;
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
  // Le modèle coloré par défaut : c'est celui que le bailleur a choisi, et il
  // porte toutes les informations obligatoires.
  modeleParDefaut: 'colore',
  couleurTheme: 'vert',
  modeTheme: 'clair',
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
  couleurTheme: 'couleur_theme',
  modeTheme: 'mode_theme',
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

/** Couleurs d'accent admises, dans l'ordre d'affichage des réglages. */
const COULEURS_ADMISES: CouleurTheme[] = ['bleu', 'vert', 'rose', 'noir'];

/** Modes admis. */
const MODES_ADMIS: ModeTheme[] = ['clair', 'sombre'];

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
  //
  // Le contrôle porte sur la valeur **lue**, qui peut être n'importe quoi — un
  // `officiel` écrit par une version antérieure, ou une chaîne abîmée. Le type,
  // lui, ne connaît que les modèles proposés : sans ce passage par `string`, le
  // compilateur croirait la comparaison toujours vraie et l'écarterait.
  const modeleLu: string = resultat.modeleParDefaut;
  if (!(MODELES_PROPOSES as readonly string[]).includes(modeleLu)) {
    resultat.modeleParDefaut = REGLAGES_PAR_DEFAUT.modeleParDefaut;
  }
  // Une couleur ou un mode inconnu — réglage écrit par une version antérieure,
  // ou valeur abîmée — ramène l'application à un thème qui existe.
  if (!COULEURS_ADMISES.includes(resultat.couleurTheme)) {
    resultat.couleurTheme = REGLAGES_PAR_DEFAUT.couleurTheme;
  }
  if (!MODES_ADMIS.includes(resultat.modeTheme)) {
    resultat.modeTheme = REGLAGES_PAR_DEFAUT.modeTheme;
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
