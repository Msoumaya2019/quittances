/**
 * Règle des rappels de loyers.
 *
 * Une seule question ici : **quand** le rappel doit se déclencher. Le
 * déclenchement lui-même n'est pas du domaine — il vit dans
 * `src/notifications/rappels.ts`, qui parle au système.
 *
 * Le texte du rappel ne nomme volontairement pas le mois. Le rappel se répète
 * tous les mois, et son contenu est figé au moment où il est programmé :
 * annoncer « les loyers de septembre » produirait un message faux dès octobre.
 * Le rappel renvoie donc vers l'application, qui seule sait ce qui reste dû.
 */

import { type ClePeriode, periodeActuelle, versCle } from './period.ts';

/**
 * Le rappel tombe au plus tard le 28 : c'est le seul jour présent dans tous les
 * mois, donc la seule borne qui ne demande aucun cas particulier pour février.
 */
export const JOUR_RAPPEL_MIN = 1;
export const JOUR_RAPPEL_MAX = 28;

/** Heure locale du rappel. 9 h : assez tôt pour agir, assez tard pour ne pas réveiller. */
export const HEURE_RAPPEL = 9;

export interface ProchainRappel {
  /** Instant du prochain déclenchement, en heure locale. */
  quand: Date;
  /** Mois concerné, au format `AAAA-MM`. */
  mois: ClePeriode;
  titre: string;
  corps: string;
}

/** Ramène un jour quelconque dans les bornes autorisées. */
export function normaliserJourRappel(jour: number): number {
  if (!Number.isFinite(jour)) return JOUR_RAPPEL_MIN;
  const entier = Math.trunc(jour);
  if (entier < JOUR_RAPPEL_MIN) return JOUR_RAPPEL_MIN;
  if (entier > JOUR_RAPPEL_MAX) return JOUR_RAPPEL_MAX;
  return entier;
}

export function texteRappel(): { titre: string; corps: string } {
  return {
    titre: 'Loyers à encaisser',
    corps: 'Ouvrez Quittances pour voir ce qui reste à encaisser ce mois-ci.',
  };
}

/**
 * Prochain déclenchement à partir d'un instant donné.
 *
 * Le passage d'année est laissé au constructeur `Date`, qui le gère seul : on
 * ne teste donc pas le mois de décembre à part, on l'éprouve.
 */
export function prochainRappel(
  jourRappel: number,
  maintenant: Date = new Date(),
): ProchainRappel {
  const jour = normaliserJourRappel(jourRappel);

  const ceMois = new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    jour,
    HEURE_RAPPEL,
    0,
    0,
    0,
  );

  // `>=` et non `>` : si l'instant courant est exactement celui du rappel, il
  // est encore à venir. Le décaler d'un mois ferait sauter un rappel.
  const quand =
    ceMois.getTime() >= maintenant.getTime()
      ? ceMois
      : new Date(
          maintenant.getFullYear(),
          maintenant.getMonth() + 1,
          jour,
          HEURE_RAPPEL,
          0,
          0,
          0,
        );

  return {
    quand,
    mois: versCle(periodeActuelle(quand)),
    ...texteRappel(),
  };
}
