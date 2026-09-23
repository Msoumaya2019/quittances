/**
 * Loyer dû pour un mois donné.
 *
 * Cette fonction est le cœur de la fiabilité du projet : c'est elle qui décide
 * du montant qui figurera sur la quittance. Elle ne connaît que le domaine.
 */

import { ZERO, type Centimes } from './money.ts';
import {
  decaler,
  depuisCle,
  versCle,
  type ClePeriode,
  type Periode,
} from './period.ts';
import type { Bail, MontantDu, PeriodeLoyer } from './types.ts';

export const MONTANT_NUL: MontantDu = { loyer: ZERO, charges: ZERO, total: ZERO };

/**
 * Le bail couvre-t-il ce mois ?
 *
 * Un mois est couvert dès lors qu'il n'est pas entièrement antérieur à l'entrée
 * ou entièrement postérieur à la sortie. Un bail qui commence le 15 septembre
 * rend donc le mois de septembre dû **en entier** : c'est l'usage du bail
 * d'habitation, et l'application ne fabrique pas de prorata que le bailleur
 * n'aurait pas décidé.
 */
export function bailCouvreMois(bail: Bail, p: Periode): boolean {
  const cle = versCle(p);
  if (cle < bail.dateEntree.slice(0, 7)) return false;
  if (bail.dateSortie && cle > bail.dateSortie.slice(0, 7)) return false;
  return true;
}

/**
 * Période d'application applicable à un mois donné.
 *
 * S'il y en a plusieurs (ce qui ne devrait pas arriver), on retient la plus
 * récemment créée : elle représente la dernière décision du bailleur.
 */
export function periodeLoyerApplicable(
  periodes: readonly PeriodeLoyer[],
  p: Periode,
): PeriodeLoyer | null {
  const cle = versCle(p);

  const candidates = periodes.filter((periode) => {
    if (cle < periode.debut) return false;
    if (periode.fin && cle > periode.fin) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((meilleure, courante) => {
    if (courante.debut > meilleure.debut) return courante;
    if (courante.debut < meilleure.debut) return meilleure;
    // Départage stable : la plus récemment saisie gagne.
    return courante.creeLe >= meilleure.creeLe ? courante : meilleure;
  });
}

/**
 * Montant dû pour un mois.
 *
 * Renvoie un montant nul si le mois est hors bail, ou si aucune période de
 * loyer n'a été renseignée. On ne devine jamais un montant : mieux vaut ne rien
 * réclamer qu'un chiffre inventé.
 */
export function montantDuPourMois(
  bail: Bail,
  periodesLoyer: readonly PeriodeLoyer[],
  p: Periode,
): MontantDu {
  if (!bailCouvreMois(bail, p)) return MONTANT_NUL;

  const applicable = periodeLoyerApplicable(periodesLoyer, p);
  if (!applicable) return MONTANT_NUL;

  const loyer = Math.max(0, applicable.loyer);
  const charges = Math.max(0, applicable.charges);

  return { loyer, charges, total: loyer + charges };
}

/** Montant dû pour un mois, exprimé en clé `AAAA-MM`. */
export function montantDuPourCle(
  bail: Bail,
  periodesLoyer: readonly PeriodeLoyer[],
  cle: ClePeriode,
): MontantDu {
  const p = depuisCle(cle);
  if (!p) return MONTANT_NUL;
  return montantDuPourMois(bail, periodesLoyer, p);
}

/**
 * Contrôle de cohérence de l'historique des loyers.
 *
 * Deux périodes ne doivent jamais se chevaucher : un chevauchement signifie que
 * le montant d'un mois passé pourrait dépendre de l'ordre de lecture. On
 * préfère signaler le problème au lieu de le masquer.
 */
export interface ChevauchementLoyer {
  premiere: PeriodeLoyer;
  seconde: PeriodeLoyer;
}

export function chevauchements(
  periodes: readonly PeriodeLoyer[],
): ChevauchementLoyer[] {
  const triees = [...periodes].sort((a, b) => a.debut.localeCompare(b.debut));
  const conflits: ChevauchementLoyer[] = [];

  for (let i = 1; i < triees.length; i += 1) {
    const precedente = triees[i - 1];
    const courante = triees[i];
    const finPrecedente = precedente.fin ?? '9999-99';
    if (courante.debut <= finPrecedente) {
      conflits.push({ premiere: precedente, seconde: courante });
    }
  }

  return conflits;
}

/** Instruction à appliquer à une période existante pour laisser la place à la nouvelle. */
export type InstructionPeriode =
  | { action: 'supprimer'; id: string }
  | { action: 'clore'; id: string; fin: ClePeriode };

/** Résultat du calcul d'un changement de loyer : ce qu'il faut écrire, et quoi vérifier. */
export interface PlanChangementLoyer {
  /** Opérations à appliquer aux périodes existantes, dans cet ordre. */
  instructions: InstructionPeriode[];
  /** Vrai si une période identique existe déjà pour ce mois : deux loyers pour un mois. */
  conflitMemeMois: PeriodeLoyer | null;
}

/**
 * Calcule ce qu'il faut faire des périodes existantes pour ajouter un loyer.
 *
 * Cette fonction est mise à part de la base **exprès** : c'est elle qui porte la
 * promesse « un changement de loyer ne modifie jamais les quittances déjà
 * générées ». On ne modifie aucun montant : on **clôt** la période en cours le
 * mois précédant le changement, et on ouvre la nouvelle. Les mois passés
 * continuent donc de rendre exactement ce qu'ils rendaient.
 *
 * Deux cas particuliers méritent d'être vus :
 *  - la période précédente ne couvrait que le mois du changement : elle devient
 *    vide, donc on la supprime plutôt que de laisser une période sans aucun mois ;
 *  - un loyer existe déjà pour ce mois : on refuse, car deux loyers pour un même
 *    mois rendraient le montant dépendant de l'ordre de lecture.
 */
export function planifierChangementLoyer(
  periodes: readonly PeriodeLoyer[],
  nouveauDebut: ClePeriode,
): PlanChangementLoyer {
  const triees = [...periodes].sort((a, b) => a.debut.localeCompare(b.debut));

  const conflitMemeMois = triees.find((p) => p.debut === nouveauDebut) ?? null;
  if (conflitMemeMois) {
    return { instructions: [], conflitMemeMois };
  }

  // La période à clore est la dernière qui couvre encore ce mois de début.
  const aClore = triees
    .filter((p) => p.debut < nouveauDebut && (p.fin == null || p.fin >= nouveauDebut))
    .pop();

  if (!aClore) {
    return { instructions: [], conflitMemeMois: null };
  }

  const moisPrecedent = versCle(decaler(depuisCle(nouveauDebut) ?? { annee: 2000, mois: 1 }, -1));

  if (aClore.debut === moisPrecedent) {
    return { instructions: [{ action: 'supprimer', id: aClore.id }], conflitMemeMois: null };
  }

  return {
    instructions: [{ action: 'clore', id: aClore.id, fin: moisPrecedent }],
    conflitMemeMois: null,
  };
}
