/**
 * Tests des paiements, des statuts et de l'action proposée sur la carte.
 *
 * C'est le contrôle qui établit qu'aucune quittance ne peut être émise sans
 * paiement intégral enregistré.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { periode } from '../src/domain/period.ts';
import { montantDuPourMois } from '../src/domain/rent.ts';
import {
  actionPrincipale,
  contexteDuMois,
  cumulerPaiements,
  determinerStatut,
  documentAutorise,
  montantPropose,
  peutEmettreQuittance,
  quittancesARattraper,
  soldeRestant,
  statistiquesDuMois,
  tropPercu,
  type ContexteMois,
} from '../src/domain/payments.ts';
import {
  LIBELLE_DOCUMENT,
  type Bail,
  type Paiement,
  type PeriodeLoyer,
} from '../src/domain/types.ts';

const BAIL: Bail = {
  id: 'bail-1',
  logementId: 'logement-1',
  dateEntree: '2024-01-01',
  dateSortie: null,
  jourEcheance: 5,
  creeLe: '2024-01-01T00:00:00.000Z',
  modifieLe: '2024-01-01T00:00:00.000Z',
};

const LOYER: PeriodeLoyer = {
  id: 'pl-1',
  bailId: 'bail-1',
  debut: '2024-01',
  fin: null,
  loyer: 80000,
  charges: 5000,
  creeLe: '2024-01-01T00:00:00.000Z',
};

function paiement(champs: Partial<Paiement> & { montant: number }): Paiement {
  return {
    id: `p-${champs.montant}-${champs.datePaiement ?? '2026-09-05'}`,
    bailId: 'bail-1',
    periode: '2026-09',
    datePaiement: '2026-09-05',
    mode: 'virement',
    note: null,
    creeLe: '2026-09-05T10:00:00.000Z',
    ...champs,
  };
}

/** Construit le contexte d'un mois, comme le ferait l'application. */
function contexte(params: {
  paiements: Paiement[];
  moisPeriode?: { annee: number; mois: number };
  jourDuJour?: number;
  moisDuJour?: { annee: number; mois: number };
  bail?: Bail;
  periodesLoyer?: PeriodeLoyer[];
}): ContexteMois {
  const p = params.moisPeriode ?? periode(2026, 9);
  const b = params.bail ?? BAIL;
  const periodes = params.periodesLoyer ?? [LOYER];

  const montantDu = montantDuPourMois(b, periodes, p);
  const cumul = cumulerPaiements(params.paiements, p);
  const statut = determinerStatut({
    montantDu,
    cumul,
    periode: p,
    bail: b,
    periodeDuJour: params.moisDuJour ?? periode(2026, 9),
    jourDuJour: params.jourDuJour ?? 10,
  });

  return {
    periode: p,
    bail: b,
    montantDu,
    cumul,
    statut,
    solde: soldeRestant(montantDu, cumul),
  };
}

describe('Cumul des paiements', () => {
  it('ne retient que les paiements du mois demandé', () => {
    const cumul = cumulerPaiements(
      [
        paiement({ montant: 85000, periode: '2026-09' }),
        paiement({ montant: 85000, periode: '2026-08' }),
        paiement({ montant: 85000, periode: '2026-10' }),
      ],
      periode(2026, 9),
    );
    assert.equal(cumul.encaisse, 85000);
    assert.equal(cumul.nombre, 1);
  });

  it('additionne deux règlements partiels sur le même mois', () => {
    const cumul = cumulerPaiements(
      [
        paiement({ montant: 50000, datePaiement: '2026-09-05' }),
        paiement({ montant: 35000, datePaiement: '2026-09-20' }),
      ],
      periode(2026, 9),
    );
    assert.equal(cumul.encaisse, 85000);
    assert.equal(cumul.nombre, 2);
    assert.deepEqual(cumul.dates, ['2026-09-05', '2026-09-20']);
  });

  it('renvoie un cumul vide si rien n’a été payé', () => {
    const cumul = cumulerPaiements([], periode(2026, 9));
    assert.equal(cumul.encaisse, 0);
    assert.equal(cumul.nombre, 0);
    assert.deepEqual(cumul.paiements, []);
  });

  it('range les paiements du plus ancien au plus récent', () => {
    const cumul = cumulerPaiements(
      [
        paiement({ montant: 35000, datePaiement: '2026-09-25' }),
        paiement({ montant: 50000, datePaiement: '2026-09-03' }),
      ],
      periode(2026, 9),
    );
    assert.deepEqual(
      cumul.paiements.map((p) => p.montant),
      [50000, 35000],
    );
  });
});

describe('Détermination du statut', () => {
  it('marque « payé » quand la somme couvre exactement le dû', () => {
    const c = contexte({ paiements: [paiement({ montant: 85000 })] });
    assert.equal(c.statut, 'paye');
  });

  it('marque « partiel » quand la somme ne couvre pas le dû', () => {
    const c = contexte({ paiements: [paiement({ montant: 50000 })] });
    assert.equal(c.statut, 'partiel');
  });

  it('marque « attente » si l’échéance du mois courant n’est pas dépassée', () => {
    const c = contexte({ paiements: [], jourDuJour: 3 });
    assert.equal(c.statut, 'attente');
  });

  it('marque « retard » si l’échéance du mois courant est dépassée', () => {
    const c = contexte({ paiements: [], jourDuJour: 12 });
    assert.equal(c.statut, 'retard');
  });

  it('marque « retard » pour un mois passé sans paiement', () => {
    const c = contexte({
      paiements: [],
      moisPeriode: periode(2026, 6),
      moisDuJour: periode(2026, 9),
    });
    assert.equal(c.statut, 'retard');
  });

  it('marque « hors bail » pour un mois situé avant l’entrée', () => {
    const c = contexte({
      paiements: [],
      moisPeriode: periode(2023, 5),
      moisDuJour: periode(2026, 9),
    });
    assert.equal(c.statut, 'hors_bail');
  });

  it('le jour d’échéance lui-même reste « en attente »', () => {
    const b = { ...BAIL, jourEcheance: 5 };
    const c = contexte({ paiements: [], bail: b, jourDuJour: 5 });
    assert.equal(c.statut, 'attente', 'au jour dit, il n’est pas encore en retard');
  });

  it('un trop-perçu compte comme payé', () => {
    const c = contexte({ paiements: [paiement({ montant: 90000 })] });
    assert.equal(c.statut, 'paye');
  });
});

describe('Solde et montant proposé', () => {
  it('calcule le reste à percevoir', () => {
    const c = contexte({ paiements: [paiement({ montant: 50000 })] });
    assert.equal(c.solde, 35000);
    assert.equal(montantPropose(c.montantDu, c.cumul), 35000);
  });

  it('ne rend jamais un solde négatif', () => {
    const c = contexte({ paiements: [paiement({ montant: 90000 })] });
    assert.equal(c.solde, 0);
    assert.equal(tropPercu(c.montantDu, c.cumul), 5000);
  });

  it('propose le montant total quand rien n’a été payé', () => {
    const c = contexte({ paiements: [] });
    assert.equal(c.solde, 85000);
  });
});

describe('Document autorisé — garde-fou central', () => {
  it('une quittance est autorisée seulement si le mois est intégralement payé', () => {
    const paye = contexte({ paiements: [paiement({ montant: 85000 })] });
    assert.equal(peutEmettreQuittance(paye), true);
    assert.equal(documentAutorise(paye), 'quittance');
  });

  it('un paiement partiel ne donne droit à aucun document', () => {
    const partiel = contexte({ paiements: [paiement({ montant: 50000 })] });
    assert.equal(peutEmettreQuittance(partiel), false);
    assert.equal(documentAutorise(partiel), null);
  });

  it('un mois impayé ne donne droit à aucun document', () => {
    const impaye = contexte({ paiements: [], moisPeriode: periode(2026, 6) });
    assert.equal(peutEmettreQuittance(impaye), false);
    assert.equal(documentAutorise(impaye), null);
  });

  it('les types déjà émis restent lisibles, même s’ils ne se créent plus', () => {
    // `TypeDocument` est l'union des types **lisibles**. L'amputer ferait
    // disparaître des documents que l'utilisateur a déjà chez lui : une mise à
    // jour rendrait ses sauvegardes illisibles. Seule la création est close.
    assert.deepEqual(Object.keys(LIBELLE_DOCUMENT).sort(), [
      'avis_echeance',
      'quittance',
      'recu',
    ]);
  });

  it('deux paiements partiels valant le total ouvrent droit à la quittance', () => {
    const c = contexte({
      paiements: [
        paiement({ montant: 50000, datePaiement: '2026-09-03' }),
        paiement({ montant: 35000, datePaiement: '2026-09-18' }),
      ],
    });
    assert.equal(documentAutorise(c), 'quittance');
  });
});

describe('Action proposée sur la carte du logement', () => {
  it('propose d’enregistrer le paiement quand rien n’a été reçu', () => {
    const c = contexte({ paiements: [] });
    const action = actionPrincipale({ contexte: c });
    assert.equal(action.type, 'enregistrer_paiement');
  });

  it('propose de compléter le paiement, en indiquant le montant restant', () => {
    const c = contexte({ paiements: [paiement({ montant: 50000 })] });
    const action = actionPrincipale({ contexte: c });
    assert.equal(action.type, 'completer_paiement');
    if (action.type === 'completer_paiement') {
      assert.equal(action.montantSuggere, 35000);
      assert.match(action.libelle, /Compléter/);
    }
  });

  it('propose de générer la quittance quand tout est réglé', () => {
    const c = contexte({ paiements: [paiement({ montant: 85000 })] });
    const action = actionPrincipale({ contexte: c });
    assert.equal(action.type, 'generer_quittance');
    assert.equal(action.libelle, 'Générer la quittance');
  });

  it('propose de consulter la quittance si elle existe déjà', () => {
    const c = contexte({ paiements: [paiement({ montant: 85000 })] });
    const action = actionPrincipale({
      contexte: c,
      documentExistant: { id: 'doc-1', type: 'quittance' },
    });
    assert.equal(action.type, 'voir_quittance');
    if (action.type === 'voir_quittance') assert.equal(action.documentId, 'doc-1');
  });

  it('un reçu déjà émis ne détourne plus l’action : il faut compléter le paiement', () => {
    const c = contexte({ paiements: [paiement({ montant: 50000 })] });
    const action = actionPrincipale({
      contexte: c,
      documentExistant: { id: 'recu-1', type: 'recu' },
    });
    assert.equal(action.type, 'completer_paiement');
  });

  it('n’annonce aucune action pour un mois hors bail', () => {
    const c = contexte({
      paiements: [],
      moisPeriode: periode(2023, 5),
      moisDuJour: periode(2026, 9),
    });
    const action = actionPrincipale({ contexte: c });
    assert.equal(action.type, 'aucune');
  });
});

describe('Statistiques du tableau de bord', () => {
  it('additionne attendu, encaissé et reste', () => {
    const contextes = [
      contexte({ paiements: [paiement({ montant: 85000 })] }), // payé
      contexte({ paiements: [paiement({ montant: 50000 })] }), // partiel
      contexte({ paiements: [] }), // rien
    ];

    const stats = statistiquesDuMois(contextes);
    assert.equal(stats.attendu, 255000, '3 × 850 €');
    assert.equal(stats.encaisse, 135000, '850 € + 500 €');
    assert.equal(stats.reste, 120000);
    assert.equal(stats.nombreLogements, 3);
    assert.equal(stats.nombrePayes, 1);
    assert.equal(stats.pourcentageRegle, 33);
  });

  it('exclut les mois hors bail du calcul', () => {
    const contextes = [
      contexte({ paiements: [paiement({ montant: 85000 })] }),
      contexte({
        paiements: [],
        moisPeriode: periode(2023, 5),
        moisDuJour: periode(2026, 9),
      }),
    ];

    const stats = statistiquesDuMois(contextes);
    assert.equal(stats.nombreLogements, 1, 'le mois hors bail ne compte pas');
    assert.equal(stats.attendu, 85000);
    assert.equal(stats.pourcentageRegle, 100);
  });

  it('annonce 0 % plutôt qu’une division par zéro', () => {
    const stats = statistiquesDuMois([]);
    assert.equal(stats.pourcentageRegle, 0);
    assert.equal(stats.attendu, 0);
    assert.equal(stats.reste, 0);
  });

  it('un logement en retard mais partiellement payé ne compte pas comme réglé', () => {
    const contextes = [
      contexte({
        paiements: [paiement({ montant: 50000, periode: '2026-06' })],
        moisPeriode: periode(2026, 6),
        moisDuJour: periode(2026, 9),
      }),
    ];
    const stats = statistiquesDuMois(contextes);
    assert.equal(stats.nombrePayes, 0);
    assert.equal(stats.encaisse, 50000);
    assert.equal(stats.reste, 35000);
  });

  it('le paiement du mois de juin ne règle pas le mois de septembre', () => {
    const c = contexte({
      paiements: [paiement({ montant: 50000, periode: '2026-06' })],
      moisPeriode: periode(2026, 9),
      moisDuJour: periode(2026, 9),
    });
    assert.equal(c.cumul.encaisse, 0, 'un mois se règle avec ses propres paiements');
    assert.equal(c.statut, 'retard');
  });
});

/**
 * `contexteDuMois` est ce que tous les écrans appellent désormais. S'il se
 * trompe, toutes les cartes, tous les détails et tous les diagnostics se
 * trompent ensemble : on vérifie donc qu'il rend exactement ce que la fabrique
 * de test — écrite indépendamment, et qui a servi à établir les règles —
 * produisait à la main.
 */
describe('Contexte d’un mois assemble par le domaine', () => {
  it('donne le même résultat que l’assemblage manuel, mois intégralement payé', () => {
    const paiements = [paiement({ montant: 85000 })];

    const attendu = contexte({ paiements });
    const obtenu = contexteDuMois({
      bail: BAIL,
      periodesLoyer: [LOYER],
      paiements,
      periode: periode(2026, 9),
      dateDuJour: '2026-09-10',
    });

    assert.deepEqual(obtenu, attendu);
    assert.equal(obtenu.statut, 'paye');
    assert.equal(obtenu.solde, 0);
  });

  it('donne le même résultat que l’assemblage manuel, paiement partiel', () => {
    const paiements = [paiement({ montant: 50000 })];

    const attendu = contexte({ paiements });
    const obtenu = contexteDuMois({
      bail: BAIL,
      periodesLoyer: [LOYER],
      paiements,
      periode: periode(2026, 9),
      dateDuJour: '2026-09-10',
    });

    assert.deepEqual(obtenu, attendu);
    assert.equal(obtenu.statut, 'partiel');
    assert.equal(obtenu.solde, 35000);
  });

  it('ne réclame rien pour un mois antérieur à l’entrée dans les lieux', () => {
    const obtenu = contexteDuMois({
      bail: BAIL,
      periodesLoyer: [LOYER],
      paiements: [],
      periode: periode(2023, 12),
      dateDuJour: '2026-09-10',
    });

    assert.equal(obtenu.montantDu.total, 0);
    assert.equal(obtenu.statut, 'hors_bail');
    assert.equal(obtenu.solde, 0);
  });

  it('tient compte du jour du mois pour distinguer attente et retard', () => {
    const avantEcheance = contexteDuMois({
      bail: BAIL,
      periodesLoyer: [LOYER],
      paiements: [],
      periode: periode(2026, 9),
      dateDuJour: '2026-09-03',
    });
    const apresEcheance = contexteDuMois({
      bail: BAIL,
      periodesLoyer: [LOYER],
      paiements: [],
      periode: periode(2026, 9),
      dateDuJour: '2026-09-20',
    });

    assert.equal(avantEcheance.statut, 'attente', 'avant le 5, rien n’est encore dû');
    assert.equal(apresEcheance.statut, 'retard', 'après le 5, le loyer est en retard');
  });
});

describe('Rattrapage — les mois réglés qui attendent leur quittance', () => {
  /** Sept mois avant septembre 2026, comme la demande initiale. */
  const SEPT_MOIS = paiement({
    montant: 85000,
    periode: '2026-02',
    datePaiement: '2026-02-05',
  });

  function rattraper(params: {
    paiements?: Paiement[];
    documents?: { periode: string; type: 'quittance' | 'recu' | 'avis_echeance' }[];
    dateDuJour?: string;
    bail?: Bail;
  } = {}) {
    return quittancesARattraper({
      bail: params.bail ?? BAIL,
      periodesLoyer: [LOYER],
      paiements: params.paiements ?? [],
      documents: params.documents ?? [],
      dateDuJour: params.dateDuJour ?? '2026-09-20',
    });
  }

  it('retrouve une quittance oubliée il y a sept mois', () => {
    const trouvees = rattraper({ paiements: [SEPT_MOIS] });

    assert.equal(trouvees.length, 1, 'un seul mois est en attente');
    assert.equal(trouvees[0].periode.annee, 2026);
    assert.equal(trouvees[0].periode.mois, 2);
    assert.equal(trouvees[0].ancienneteMois, 7, 'sept mois d’ancienneté');
    assert.equal(trouvees[0].cumul.encaisse, 85000);
  });

  it('ne propose pas un mois dont la quittance existe déjà', () => {
    const trouvees = rattraper({
      paiements: [SEPT_MOIS],
      documents: [{ periode: '2026-02', type: 'quittance' }],
    });

    assert.deepEqual(trouvees, [], 'la quittance existe, il n’y a rien à rattraper');
  });

  it('un reçu déjà émis ne tient pas lieu de quittance', () => {
    const trouvees = rattraper({
      paiements: [SEPT_MOIS],
      documents: [{ periode: '2026-02', type: 'recu' }],
    });

    assert.equal(trouvees.length, 1, 'le mois reste à quittancer');
  });

  it('ne propose jamais un mois partiellement réglé', () => {
    const trouvees = rattraper({
      paiements: [paiement({ montant: 50000, periode: '2026-07', datePaiement: '2026-07-05' })],
    });

    assert.deepEqual(trouvees, [], 'un règlement partiel ne donne pas de quittance');
  });

  it('range les mois du plus récent au plus ancien', () => {
    const trouvees = rattraper({
      paiements: [
        paiement({ montant: 85000, periode: '2026-02', datePaiement: '2026-02-05' }),
        paiement({ montant: 85000, periode: '2026-08', datePaiement: '2026-08-05' }),
        paiement({ montant: 85000, periode: '2026-05', datePaiement: '2026-05-05' }),
      ],
    });

    assert.deepEqual(
      trouvees.map((t) => t.periode.mois),
      [8, 5, 2],
      'août, puis mai, puis février',
    );
  });

  it('ne remonte pas avant l’entrée dans les lieux', () => {
    // Le bail commence en janvier 2024 : un versement antérieur ne doit pas
    // faire apparaître un mois qui n'a jamais été loué.
    const trouvees = rattraper({
      paiements: [
        paiement({ montant: 85000, periode: '2023-11', datePaiement: '2023-11-05' }),
        SEPT_MOIS,
      ],
    });

    assert.equal(trouvees.length, 1);
    assert.equal(trouvees[0].periode.annee, 2026, 'aucun mois de 2023 n’est proposé');
  });

  it('ne propose pas un mois futur, même réglé d’avance', () => {
    const trouvees = rattraper({
      paiements: [
        paiement({ montant: 85000, periode: '2026-11', datePaiement: '2026-11-05' }),
        SEPT_MOIS,
      ],
    });

    assert.equal(trouvees.length, 1);
    assert.equal(trouvees[0].periode.mois, 2, 'novembre est dans l’avenir');
  });

  it('s’arrête à la profondeur demandée', () => {
    const trouvees = rattraper({ paiements: [SEPT_MOIS] });

    const borne = quittancesARattraper({
      bail: BAIL,
      periodesLoyer: [LOYER],
      paiements: [SEPT_MOIS],
      documents: [],
      dateDuJour: '2026-09-20',
      profondeurMois: 6,
    });

    assert.equal(trouvees.length, 1, 'sans borne, février est atteint');
    assert.deepEqual(borne, [], 'avec une borne de six mois, il ne l’est plus');
  });
});
