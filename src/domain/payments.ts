/**
 * Paiements, soldes et statuts.
 *
 * Règle fondatrice : **le statut « payé » n'est jamais saisi**. Il se déduit de
 * la somme des encaissements enregistrés pour le mois. On ne peut donc pas
 * produire une quittance attestant d'un paiement qui n'a pas eu lieu.
 */

import { ZERO, type Centimes } from './money.ts';
import { formaterDateFr, versCle, type ClePeriode, type Periode } from './period.ts';
import { montantDuPourMois } from './rent.ts';
import {
  MODES_PAIEMENT,
  type Bail,
  type MontantDu,
  type Paiement,
  type PeriodeLoyer,
  type StatutMois,
  type TypeDocument,
} from './types.ts';

/** Cumul des encaissements d'un mois, avec le détail des opérations. */
export interface CumulPaiements {
  /** Somme des montants reçus. */
  encaisse: Centimes;
  /** Nombre d'opérations enregistrées. */
  nombre: number;
  /** Paiements du mois, du plus ancien au plus récent. */
  paiements: Paiement[];
  /** Dates d'encaissement, dans l'ordre chronologique. */
  dates: string[];
}

export const CUMUL_VIDE: CumulPaiements = {
  encaisse: ZERO,
  nombre: 0,
  paiements: [],
  dates: [],
};

/** Filtre et additionne les paiements d'un mois. */
export function cumulerPaiements(
  paiements: readonly Paiement[],
  periode: Periode,
): CumulPaiements {
  const cle = versCle(periode);

  const duMois = paiements
    .filter((p) => p.periode === cle)
    .sort((a, b) => {
      if (a.datePaiement !== b.datePaiement) {
        return a.datePaiement.localeCompare(b.datePaiement);
      }
      return a.creeLe.localeCompare(b.creeLe);
    });

  if (duMois.length === 0) return CUMUL_VIDE;

  return {
    encaisse: duMois.reduce((total, p) => total + p.montant, ZERO),
    nombre: duMois.length,
    paiements: duMois,
    dates: Array.from(new Set(duMois.map((p) => p.datePaiement))),
  };
}

/** Cumul des encaissements à partir d'une clé `AAAA-MM`. */
export function cumulerPaiementsPourCle(
  paiements: readonly Paiement[],
  cle: ClePeriode,
): CumulPaiements {
  const duMois = paiements
    .filter((p) => p.periode === cle)
    .sort((a, b) =>
      a.datePaiement === b.datePaiement
        ? a.creeLe.localeCompare(b.creeLe)
        : a.datePaiement.localeCompare(b.datePaiement),
    );

  if (duMois.length === 0) return CUMUL_VIDE;

  return {
    encaisse: duMois.reduce((total, p) => total + p.montant, ZERO),
    nombre: duMois.length,
    paiements: duMois,
    dates: Array.from(new Set(duMois.map((p) => p.datePaiement))),
  };
}

/** Une date d'encaissement et les modes réellement enregistrés ce jour-là. */
export interface PaiementImprime {
  /** Date écrite comme le document l'imprime : « 5 août 2026 ». */
  date: string;
  /** Libellés des modes de ce jour, sans répétition, dans l'ordre d'enregistrement. */
  modes: string[];
}

/**
 * Les lignes de paiement à imprimer sur un document : une par **date**, chacune
 * portant les modes réellement enregistrés ce jour-là.
 *
 * La forme compte. Deux listes séparées — les dates d'un côté, les modes de
 * l'autre — ne s'apparient pas : chacune est dédoublonnée de son côté, et rien
 * ne garantit qu'elles avancent du même pas. Mesuré par
 * `.verif/eprouver-paiements.py`, avec un virement et des espèces le 5 août
 * puis un chèque le 12 : le document imprimait « Reçu le 12 août 2026 —
 * Espèces ». La quittance attestait donc un encaissement en espèces qui n'avait
 * pas eu lieu, et perdait le mode du second paiement du 5.
 *
 * La règle vit ici, dans le domaine, et non dans le rendu : c'est ce qui rend
 * l'appariement impossible à refaire autrement ailleurs.
 */
export function paiementsImprimes(cumul: CumulPaiements): PaiementImprime[] {
  const parDate = new Map<string, string[]>();

  for (const paiement of cumul.paiements) {
    const libelle =
      MODES_PAIEMENT.find((m) => m.valeur === paiement.mode)?.libelle ?? 'Autre';

    const modes = parDate.get(paiement.datePaiement);
    if (!modes) {
      parDate.set(paiement.datePaiement, [libelle]);
    } else if (!modes.includes(libelle)) {
      modes.push(libelle);
    }
  }

  // `cumul.paiements` est déjà rangé du plus ancien au plus récent, et une
  // `Map` conserve l'ordre d'insertion : les dates sortent dans l'ordre.
  return [...parDate.entries()].map(([date, modes]) => ({
    date: formaterDateFr(date),
    modes,
  }));
}

/**
 * Détermine le statut d'un mois.
 *
 * `dateDuJour` sert à distinguer « en attente » de « en retard ». Le jour
 * d'échéance habituel du bail est utilisé comme repère ; une fois ce jour passé
 * dans le mois courant, l'absence de paiement devient un retard.
 */
export function determinerStatut(params: {
  montantDu: MontantDu;
  cumul: CumulPaiements;
  periode: Periode;
  bail: Bail;
  /** Mois considéré comme « maintenant ». */
  periodeDuJour: Periode;
  /** Jour du mois, pour comparer à l'échéance. */
  jourDuJour: number;
}): StatutMois {
  const { montantDu, cumul, periode, bail, periodeDuJour, jourDuJour } = params;

  // Hors bail : rien n'est dû, l'application n'affiche ni retard ni attente.
  if (montantDu.total <= 0) {
    return 'hors_bail';
  }

  if (cumul.encaisse >= montantDu.total) return 'paye';
  if (cumul.encaisse > 0) return 'partiel';

  const comparaison = periode.annee * 12 + periode.mois - (periodeDuJour.annee * 12 + periodeDuJour.mois);

  // Mois passé, ou mois courant dont l'échéance est dépassée.
  if (comparaison < 0) return 'retard';
  if (comparaison === 0 && jourDuJour > bail.jourEcheance) return 'retard';

  return 'attente';
}

/** Solde restant à percevoir pour un mois. Jamais négatif. */
export function soldeRestant(montantDu: MontantDu, cumul: CumulPaiements): Centimes {
  return Math.max(0, montantDu.total - cumul.encaisse);
}

/**
 * Reste à payer pour atteindre le montant dû, en tenant compte d'un éventuel
 * trop-perçu. Sert à proposer le montant par défaut du prochain encaissement.
 */
export function montantPropose(montantDu: MontantDu, cumul: CumulPaiements): Centimes {
  return soldeRestant(montantDu, cumul);
}

/** Y a-t-il un trop-perçu à signaler au bailleur ? */
export function tropPercu(montantDu: MontantDu, cumul: CumulPaiements): Centimes {
  return Math.max(0, cumul.encaisse - montantDu.total);
}

// ---------------------------------------------------------------------------
// Contexte complet d'un mois, et action proposée sur la carte
// ---------------------------------------------------------------------------

/**
 * Tout ce qu'il faut savoir pour décider ce qu'affiche une carte de logement.
 */
export interface ContexteMois {
  periode: Periode;
  bail: Bail;
  montantDu: MontantDu;
  cumul: CumulPaiements;
  statut: StatutMois;
  solde: Centimes;
}

/**
 * Assemble le contexte d'un mois à partir des données brutes.
 *
 * Les écrans n'ont ainsi jamais à réordonner elles-mêmes les étapes
 * (montant dû, cumul, statut, solde), ce qui évite qu'un écran affiche un solde
 * calculé autrement que la carte voisine.
 *
 * `dateDuJour` et `jourDuJour` décrivent le jour réel : ils servent uniquement
 * à distinguer « en attente » de « en retard » pour le mois en cours.
 */
export function contexteDuMois(params: {
  bail: Bail;
  periodesLoyer: readonly PeriodeLoyer[];
  paiements: readonly Paiement[];
  periode: Periode;
  /** Date du jour, au format `AAAA-MM-JJ`. */
  dateDuJour: string;
}): ContexteMois {
  const { bail, periodesLoyer, paiements, periode, dateDuJour } = params;

  const cle = versCle(periode);
  const montantDu = montantDuPourMois(bail, periodesLoyer, periode);
  const cumul = cumulerPaiementsPourCle(paiements, cle);
  const jourDuJour = Number(dateDuJour.slice(8, 10));

  const statut = determinerStatut({
    montantDu,
    cumul,
    periode,
    bail,
    periodeDuJour: { annee: Number(dateDuJour.slice(0, 4)), mois: Number(dateDuJour.slice(5, 7)) },
    jourDuJour: Number.isFinite(jourDuJour) ? jourDuJour : 1,
  });

  return { periode, bail, montantDu, cumul, statut, solde: soldeRestant(montantDu, cumul) };
}

/**
 * Action principale proposée sur la carte du logement.
 *
 * C'est la promesse « un seul bouton » : l'utilisateur n'a jamais à se demander
 * quoi faire, le bouton porte toujours l'action utile du moment.
 */
export type ActionPrincipale =
  | { type: 'enregistrer_paiement'; libelle: string }
  | { type: 'completer_paiement'; libelle: string; montantSuggere: Centimes }
  | { type: 'generer_quittance'; libelle: string }
  | { type: 'voir_quittance'; libelle: string; documentId: string }
  | { type: 'voir_recu'; libelle: string; documentId: string }
  | { type: 'aucune'; libelle: string };

export function actionPrincipale(params: {
  contexte: ContexteMois;
  /** Document déjà émis pour ce mois, s'il existe. */
  documentExistant?: { id: string; type: TypeDocument } | null;
}): ActionPrincipale {
  const { contexte, documentExistant } = params;
  const { statut, solde } = contexte;

  if (statut === 'hors_bail') {
    return { type: 'aucune', libelle: 'Aucun loyer dû ce mois-ci' };
  }

  if (statut === 'paye') {
    // Une quittance existe déjà : on la consulte au lieu de la régénérer.
    if (documentExistant && documentExistant.type === 'quittance') {
      return {
        type: 'voir_quittance',
        libelle: 'Voir la quittance',
        documentId: documentExistant.id,
      };
    }
    return { type: 'generer_quittance', libelle: 'Générer la quittance' };
  }

  if (statut === 'partiel') {
    // Un reçu a été émis : on le consulte ; sinon on complète le paiement.
    if (documentExistant && documentExistant.type === 'recu') {
      return {
        type: 'voir_recu',
        libelle: 'Voir le reçu',
        documentId: documentExistant.id,
      };
    }
    return {
      type: 'completer_paiement',
      libelle: 'Compléter le paiement',
      montantSuggere: solde,
    };
  }

  return { type: 'enregistrer_paiement', libelle: 'Enregistrer le paiement' };
}

/**
 * Type de document que l'application a le droit d'émettre pour ce mois.
 *
 * C'est le garde-fou central : on ne produit une **quittance** que si le
 * règlement est intégral et enregistré. Un paiement partiel donne un **reçu**.
 * Un défaut de paiement donne un **avis d'échéance**.
 *
 * Le type de retour est `TypeDocument`, jamais l'union recopiée : recopier
 * l'union ferait une seconde vérité, qui ne suivrait pas l'ajout d'un type.
 */
export function documentAutorise(contexte: ContexteMois): TypeDocument {
  if (contexte.statut === 'paye') return 'quittance';
  if (contexte.statut === 'partiel') return 'recu';
  return 'avis_echeance';
}

/** Contrôle : ce mois peut-il donner lieu à une quittance ? */
export function peutEmettreQuittance(contexte: ContexteMois): boolean {
  return contexte.statut === 'paye';
}

/** Contrôle : ce mois peut-il donner lieu à un document en règle ? */
export function peutEmettreDocument(contexte: ContexteMois): boolean {
  return contexte.statut !== 'hors_bail';
}

// ---------------------------------------------------------------------------
// Aide à la décision pour la génération groupée
// ---------------------------------------------------------------------------

export interface LigneGeneration {
  logementId: string;
  logementNom: string;
  bailId: string;
  periode: Periode;
  montantDu: MontantDu;
  cumul: CumulPaiements;
  statut: StatutMois;
  /** Pré-sélectionné quand le mois est intégralement payé. */
  preselectionne: boolean;
  /** Motif expliquant une non-présélection, affiché à l'utilisateur. */
  motif: string | null;
}

/**
 * Prépare la liste des documents d'un mois pour la génération groupée.
 * Seuls les mois intégralement payés sont présélectionnés : on ne propose pas
 * d'émettre en masse des documents qui n'auraient pas de fondement.
 */
export function preparerGenerationGroupee(params: {
  logements: { id: string; nom: string; bail: Bail; periodesLoyer: PeriodeLoyer[] }[];
  paiements: readonly Paiement[];
  periode: Periode;
  periodeDuJour: Periode;
  jourDuJour: number;
}): LigneGeneration[] {
  const { logements, paiements, periode, periodeDuJour, jourDuJour } = params;

  return logements.map((logement) => {
    const montantDu = montantDuPourMois(logement.bail, logement.periodesLoyer, periode);
    const cumul = cumulerPaiements(paiements, periode);
    const statut = determinerStatut({
      montantDu,
      cumul,
      periode,
      bail: logement.bail,
      periodeDuJour,
      jourDuJour,
    });

    const preselectionne = statut === 'paye';

    let motif: string | null = null;
    if (statut === 'hors_bail') motif = 'Hors période de location';
    else if (statut === 'attente') motif = 'Paiement non enregistré';
    else if (statut === 'retard') motif = 'Impayé';
    else if (statut === 'partiel') motif = 'Paiement partiel — un reçu peut être émis';

    return {
      logementId: logement.id,
      logementNom: logement.nom,
      bailId: logement.bail.id,
      periode,
      montantDu,
      cumul,
      statut,
      preselectionne,
      motif,
    };
  });
}

/** Statistiques du tableau de bord pour un mois. */
export interface StatistiquesMois {
  attendu: Centimes;
  encaisse: Centimes;
  reste: Centimes;
  nombreLogements: number;
  nombrePayes: number;
  /** Pourcentage de logements ayant réglé, entre 0 et 100. */
  pourcentageRegle: number;
}

export function statistiquesDuMois(contextes: readonly ContexteMois[]): StatistiquesMois {
  const actifs = contextes.filter((c) => c.statut !== 'hors_bail');

  const attendu = actifs.reduce((total, c) => total + c.montantDu.total, ZERO);
  const encaisse = actifs.reduce((total, c) => total + c.cumul.encaisse, ZERO);
  const nombrePayes = actifs.filter((c) => c.statut === 'paye').length;

  return {
    attendu,
    encaisse,
    reste: Math.max(0, attendu - encaisse),
    nombreLogements: actifs.length,
    nombrePayes,
    pourcentageRegle:
      actifs.length === 0 ? 0 : Math.round((nombrePayes / actifs.length) * 100),
  };
}
