/**
 * Paiements, soldes et statuts.
 *
 * Règle fondatrice : **le statut « payé » n'est jamais saisi**. Il se déduit de
 * la somme des encaissements enregistrés pour le mois. On ne peut donc pas
 * produire une quittance attestant d'un paiement qui n'a pas eu lieu.
 */

import { ZERO, type Centimes } from './money.ts';
import {
  decaler,
  depuisCle,
  estAvant,
  formaterDateFr,
  versCle,
  type ClePeriode,
  type Periode,
} from './period.ts';
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
 *
 * L'application ne produit que des quittances. Un mois partiellement payé ne
 * mène donc pas à un document mais au geste qui débloque la quittance :
 * compléter le règlement.
 */
export type ActionPrincipale =
  | { type: 'enregistrer_paiement'; libelle: string }
  | { type: 'completer_paiement'; libelle: string; montantSuggere: Centimes }
  | { type: 'generer_quittance'; libelle: string }
  | { type: 'voir_quittance'; libelle: string; documentId: string }
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
    // Un mois partiellement payé ne donne **aucun** document : la seule action
    // utile est de compléter le règlement, et c'est elle qui ouvrira le droit à
    // une quittance. Un reçu émis par une version antérieure reste lisible
    // depuis la liste des documents, mais il ne s'en crée plus.
    return {
      type: 'completer_paiement',
      libelle: 'Compléter le paiement',
      montantSuggere: solde,
    };
  }

  return { type: 'enregistrer_paiement', libelle: 'Enregistrer le paiement' };
}

/**
 * Les documents que l'application a le droit de **créer**.
 *
 * Ce n'est pas `TypeDocument`, et l'écart est voulu. `TypeDocument` reste
 * l'union **complète** des types lisibles : des reçus et des avis d'échéance
 * ont été émis par le passé, dorment dans des sauvegardes chez l'utilisateur,
 * et doivent rester affichables — restreindre la lecture rendrait illisibles
 * des documents qu'il a déjà. Seule la **création** est retirée.
 *
 * `Extract<…, 'quittance'>` plutôt qu'une chaîne recopiée : si `'quittance'`
 * quittait un jour `TypeDocument`, ce type deviendrait `never` et chaque
 * `return 'quittance'` cesserait de compiler. L'accord entre les deux sources
 * se tient donc tout seul, sans test à maintenir.
 */
export type DocumentEmissible = Extract<TypeDocument, 'quittance'>;

/**
 * Document que l'application a le droit d'émettre pour ce mois, ou `null` si
 * aucun ne l'est.
 *
 * C'est le garde-fou central : on ne produit une **quittance** que si le
 * règlement est intégral et enregistré. Un mois partiellement payé, impayé, en
 * attente, ou hors bail ne donne **aucun document**. L'application explique
 * alors pourquoi et propose d'enregistrer le paiement manquant — c'est la seule
 * façon d'ouvrir le droit à une quittance.
 */
export function documentAutorise(contexte: ContexteMois): DocumentEmissible | null {
  return contexte.statut === 'paye' ? 'quittance' : null;
}

/**
 * Contrôle : ce mois peut-il donner lieu à une quittance ?
 *
 * Dérivé de `documentAutorise`, jamais réécrit : deux fonctions qui décident
 * séparément de la même chose finissent par diverger, et c'est celle qu'on ne
 * regarde pas qui ment.
 */
export function peutEmettreQuittance(contexte: ContexteMois): boolean {
  return documentAutorise(contexte) === 'quittance';
}

// ---------------------------------------------------------------------------
// Rattrapage : les mois réglés qui attendent encore leur quittance
// ---------------------------------------------------------------------------

/** Un mois intégralement réglé pour lequel aucune quittance n'existe. */
export interface MoisARattraper {
  periode: Periode;
  montantDu: MontantDu;
  cumul: CumulPaiements;
  /** Nombre de mois écoulés depuis ce mois : 0 pour le mois courant. */
  ancienneteMois: number;
}

/**
 * Les mois que le bailleur peut encore quittancer, du plus récent au plus ancien.
 *
 * C'est ce qui rend une quittance oubliée récupérable. Faire défiler les mois un
 * par un demandait sept appuis pour remonter sept mois — et rien ne disait
 * lesquels manquaient. On parcourt donc le bail entier et on nomme ce qui
 * manque.
 *
 * Trois bornes, chacune pour une raison différente :
 *  - on ne remonte pas avant l'entrée dans les lieux : il n'y avait rien à louer ;
 *  - on ne descend pas sous le mois courant : un mois futur n'a rien à rattraper ;
 *  - `profondeurMois` arrête le parcours même sur un bail très ancien, pour que
 *    l'écran reste rapide.
 *
 * Un mois n'est retenu que si le domaine autorise une quittance **et** qu'aucune
 * n'a déjà été émise. C'est `documentAutorise` qui tranche, la même fonction
 * qu'à l'émission : la liste ne peut donc pas proposer un document que
 * `emettreDocument` refuserait ensuite.
 */
export function quittancesARattraper(params: {
  bail: Bail;
  periodesLoyer: readonly PeriodeLoyer[];
  paiements: readonly Paiement[];
  /** Documents déjà émis, toutes natures confondues. */
  documents: readonly { periode: ClePeriode; type: TypeDocument }[];
  /** Date du jour, au format `AAAA-MM-JJ`. */
  dateDuJour: string;
  /** Nombre de mois examinés vers le passé, mois courant compris. */
  profondeurMois?: number;
}): MoisARattraper[] {
  const { bail, periodesLoyer, paiements, documents, dateDuJour } = params;
  const profondeur = params.profondeurMois ?? 60;

  const moisDuJour = depuisCle(dateDuJour.slice(0, 7));
  if (!moisDuJour) return [];

  const jourLu = Number(dateDuJour.slice(8, 10));
  const entree = depuisCle(bail.dateEntree.slice(0, 7));

  // Seules les quittances comptent : un reçu ou un avis d'échéance émis pour ce
  // mois ne tient pas lieu de la quittance qui manque.
  const dejaQuittance = new Set(
    documents.filter((d) => d.type === 'quittance').map((d) => d.periode),
  );

  const trouves: MoisARattraper[] = [];

  for (let recul = 0; recul < profondeur; recul += 1) {
    const mois = decaler(moisDuJour, -recul);

    if (entree && estAvant(mois, entree)) break;

    const cle = versCle(mois);
    if (dejaQuittance.has(cle)) continue;

    const montantDu = montantDuPourMois(bail, periodesLoyer, mois);
    const cumul = cumulerPaiementsPourCle(paiements, cle);
    const statut = determinerStatut({
      montantDu,
      cumul,
      periode: mois,
      bail,
      periodeDuJour: moisDuJour,
      jourDuJour: Number.isFinite(jourLu) ? jourLu : 1,
    });

    if (statut !== 'paye') continue;

    trouves.push({ periode: mois, montantDu, cumul, ancienneteMois: recul });
  }

  return trouves;
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
    else if (statut === 'partiel') motif = 'Paiement partiel — quittance impossible';

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
