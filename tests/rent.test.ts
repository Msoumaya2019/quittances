/**
 * Tests du montant dû : historique des loyers, bornes du bail, chevauchements.
 *
 * C'est le contrôle qui garantit qu'un changement de loyer ne remonte jamais
 * dans le passé, et qu'un mois hors bail ne réclame rien.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { periode } from '../src/domain/period.ts';
import {
  bailCouvreMois,
  chevauchements,
  montantDuPourCle,
  montantDuPourMois,
  periodeLoyerApplicable,
  planifierChangementLoyer,
} from '../src/domain/rent.ts';
import type { Bail, PeriodeLoyer } from '../src/domain/types.ts';

function bail(champs: Partial<Bail> = {}): Bail {
  return {
    id: 'bail-1',
    logementId: 'logement-1',
    dateEntree: '2024-01-01',
    dateSortie: null,
    jourEcheance: 5,
    creeLe: '2024-01-01T00:00:00.000Z',
    modifieLe: '2024-01-01T00:00:00.000Z',
    ...champs,
  };
}

function loyer(champs: Partial<PeriodeLoyer> & { debut: string }): PeriodeLoyer {
  return {
    id: `pl-${champs.debut}-${champs.loyer ?? 80000}`,
    bailId: 'bail-1',
    fin: null,
    loyer: 80000,
    charges: 5000,
    commentaire: null,
    creeLe: `${champs.debut}-01T00:00:00.000Z`,
    ...champs,
  };
}

describe('Bail et mois couverts', () => {
  it('couvre les mois à partir de la date d’entrée', () => {
    const b = bail({ dateEntree: '2026-03-15' });
    assert.ok(!bailCouvreMois(b, periode(2026, 2)), 'février précède l’entrée');
    assert.ok(bailCouvreMois(b, periode(2026, 3)), 'le mois d’entrée est dû en entier');
    assert.ok(bailCouvreMois(b, periode(2026, 4)));
  });

  it('s’arrête au mois de la date de sortie, inclus', () => {
    const b = bail({ dateEntree: '2024-01-01', dateSortie: '2026-09-14' });
    assert.ok(bailCouvreMois(b, periode(2026, 9)), 'le mois de sortie reste dû');
    assert.ok(!bailCouvreMois(b, periode(2026, 10)), 'le mois suivant n’est plus dû');
  });
});

describe('Montant dû', () => {
  it('additionne loyer et charges', () => {
    const b = bail();
    const montant = montantDuPourMois(b, [loyer({ debut: '2024-01' })], periode(2026, 9));
    assert.equal(montant.loyer, 80000);
    assert.equal(montant.charges, 5000);
    assert.equal(montant.total, 85000);
  });

  it('ne réclame rien hors bail', () => {
    const b = bail({ dateEntree: '2026-01-01' });
    const montant = montantDuPourMois(b, [loyer({ debut: '2026-01' })], periode(2025, 12));
    assert.equal(montant.total, 0);
  });

  it('ne réclame rien si aucun loyer n’est renseigné', () => {
    const montant = montantDuPourMois(bail(), [], periode(2026, 9));
    assert.equal(montant.total, 0);
  });

  it('applique la période dont la date d’effet couvre le mois', () => {
    const periodes = [
      loyer({ debut: '2024-01', fin: '2025-12', loyer: 80000, charges: 5000 }),
      loyer({ debut: '2026-01', fin: null, loyer: 82000, charges: 5000 }),
    ];
    const b = bail();

    const ancien = montantDuPourMois(b, periodes, periode(2025, 6));
    assert.equal(ancien.total, 85000, 'le loyer de 2025 reste 850 €');

    const nouveau = montantDuPourMois(b, periodes, periode(2026, 6));
    assert.equal(nouveau.total, 87000, 'le loyer de 2026 est 870 €');
  });

  it('une augmentation de loyer ne remonte pas dans le passé', () => {
    const periodes = [
      loyer({ debut: '2024-01', fin: '2026-08', loyer: 80000, charges: 5000 }),
      loyer({ debut: '2026-09', fin: null, loyer: 85000, charges: 5000 }),
    ];
    const b = bail();

    assert.equal(montantDuPourMois(b, periodes, periode(2026, 8)).total, 85000);
    assert.equal(montantDuPourMois(b, periodes, periode(2026, 9)).total, 90000);
    assert.equal(
      montantDuPourMois(b, periodes, periode(2025, 3)).total,
      85000,
      'un mois ancien garde son montant d’origine',
    );
  });

  it('lit le montant à partir d’une clé de mois', () => {
    const b = bail();
    const montant = montantDuPourCle(b, [loyer({ debut: '2024-01' })], '2026-09');
    assert.equal(montant.total, 85000);

    assert.equal(montantDuPourCle(b, [loyer({ debut: '2024-01' })], 'pas-un-mois').total, 0);
  });

  it('ignore une fin de période antérieure au début demandé', () => {
    const periodes = [loyer({ debut: '2024-01', fin: '2024-12' })];
    const applicable = periodeLoyerApplicable(periodes, periode(2025, 1));
    assert.equal(applicable, null);
  });
});

describe('Cohérence de l’historique des loyers', () => {
  it('détecte deux périodes qui se chevauchent', () => {
    const periodes = [
      loyer({ debut: '2024-01', fin: '2026-06' }),
      loyer({ debut: '2026-06', fin: null, loyer: 90000 }),
    ];
    const conflits = chevauchements(periodes);
    assert.equal(conflits.length, 1, 'juin 2026 est couvert deux fois');
  });

  it('accepte deux périodes qui se suivent sans se chevaucher', () => {
    const periodes = [
      loyer({ debut: '2024-01', fin: '2026-05' }),
      loyer({ debut: '2026-06', fin: null, loyer: 90000 }),
    ];
    assert.equal(chevauchements(periodes).length, 0);
  });

  it('accepte une seule période ouverte', () => {
    assert.equal(chevauchements([loyer({ debut: '2024-01' })]).length, 0);
    assert.equal(chevauchements([]).length, 0);
  });
});

describe('Changement de loyer : la règle anti-rétroactivité', () => {
  /**
   * Applique un plan à une liste de périodes, exactement comme le ferait la
   * base : c'est ce qui permet de vérifier l'effet réel, pas seulement
   * l'instruction.
   */
  function appliquer(periodes: PeriodeLoyer[], plan: ReturnType<typeof planifierChangementLoyer>) {
    let resultat = periodes.map((p) => ({ ...p }));
    for (const instruction of plan.instructions) {
      if (instruction.action === 'supprimer') {
        resultat = resultat.filter((p) => p.id !== instruction.id);
      } else {
        resultat = resultat.map((p) =>
          p.id === instruction.id ? { ...p, fin: instruction.fin } : p,
        );
      }
    }
    return resultat;
  }

  it('ne touche à aucune période quand le mois est déjà libre', () => {
    // La période précédente s'arrête en août : septembre est libre.
    const periodes = [loyer({ debut: '2024-01', fin: '2026-08' })];
    const plan = planifierChangementLoyer(periodes, '2026-09');
    assert.equal(plan.conflitMemeMois, null);
    assert.deepEqual(plan.instructions, [], 'rien à clore, la période est déjà finie');
  });

  it('ignore aussi une période close bien avant le changement', () => {
    const periodes = [
      loyer({ debut: '2024-01', fin: '2025-12', loyer: 70000 }),
      loyer({ debut: '2026-01', fin: '2026-06', loyer: 80000 }),
    ];
    const plan = planifierChangementLoyer(periodes, '2026-09');
    assert.deepEqual(plan.instructions, []);
  });

  it('clôt la période en cours le mois précédant le changement', () => {
    const periodes = [loyer({ debut: '2024-01', loyer: 80000 })];
    const plan = planifierChangementLoyer(periodes, '2026-09');
    assert.equal(plan.conflitMemeMois, null);
    assert.deepEqual(plan.instructions, [
      { action: 'clore', id: 'pl-2024-01-80000', fin: '2026-08' },
    ]);
  });

  it('refuse deux loyers pour le même mois plutôt que d’en écraser un', () => {
    const periodes = [loyer({ debut: '2024-01' })];
    const plan = planifierChangementLoyer(periodes, '2024-01');
    assert.notEqual(plan.conflitMemeMois, null);
    assert.deepEqual(plan.instructions, [], 'rien n’est écrit quand on refuse');
  });

  it('supprime une période qui ne couvrait que le mois précédant le changement', () => {
    // La période court d'août à août ; la clore au mois précédent la viderait.
    const periodes = [loyer({ debut: '2026-08', fin: '2026-08' })];
    const plan = planifierChangementLoyer(periodes, '2026-08');
    assert.equal(plan.conflitMemeMois?.debut, '2026-08', 'le même mois est refusé');

    const periodes2 = [loyer({ debut: '2026-08' })];
    const plan2 = planifierChangementLoyer(periodes2, '2026-08');
    assert.equal(plan2.conflitMemeMois?.debut, '2026-08');

    // Août est couvert et non clos : on le ferme, on ne le supprime pas.
    const plan3 = planifierChangementLoyer(periodes, '2026-09');
    assert.deepEqual(plan3.instructions, [], 'août est déjà clos');
  });

  it('supprime plutôt que de clore quand la période ne porte qu’un seul mois', () => {
    // Une période qui commence en septembre et n'est pas close, prolongée par un
    // changement en octobre : le mois précédent est septembre, donc on supprime.
    const periodes = [loyer({ debut: '2026-09', fin: null })];
    const plan = planifierChangementLoyer(periodes, '2026-10');
    assert.deepEqual(plan.instructions, [
      { action: 'supprimer', id: 'pl-2026-09-80000' },
    ]);
  });

  it('clôt le mois précédent plutôt que de le supprimer quand il porte un vrai historique', () => {
    // Septembre et octobre couverts, changement en novembre : on clôt en octobre.
    const periodes = [loyer({ debut: '2026-09' })];
    const plan = planifierChangementLoyer(periodes, '2026-11');
    assert.deepEqual(plan.instructions, [
      { action: 'clore', id: 'pl-2026-09-80000', fin: '2026-10' },
    ]);
  });

  it('gère un changement en janvier : la clôture tombe en décembre précédent', () => {
    const periodes = [loyer({ debut: '2024-03', loyer: 80000 })];
    const plan = planifierChangementLoyer(periodes, '2026-01');
    assert.deepEqual(plan.instructions, [
      { action: 'clore', id: 'pl-2024-03-80000', fin: '2025-12' },
    ]);
  });

  it('ne touche pas à une période déjà close avant le changement', () => {
    const periodes = [
      loyer({ debut: '2024-01', fin: '2025-12', loyer: 70000 }),
      loyer({ debut: '2026-01', fin: null, loyer: 80000 }),
    ];
    const plan = planifierChangementLoyer(periodes, '2026-09');
    assert.deepEqual(plan.instructions, [
      { action: 'clore', id: 'pl-2026-01-80000', fin: '2026-08' },
    ]);
  });

  it('ne rouvre ni ne modifie jamais un mois déjà passé', () => {
    const b = bail({ dateEntree: '2024-01-01' });
    const avant = [loyer({ debut: '2024-01', loyer: 80000, charges: 5000 })];
    const plan = planifierChangementLoyer(avant, '2026-09');
    const apres = appliquer(avant, plan);
    apres.push(loyer({ debut: '2026-09', loyer: 95000, charges: 5000 }));

    // Les mois couverts par l'ancienne période rendent exactement pareil.
    for (const mois of [periode(2024, 1), periode(2025, 6), periode(2026, 8)]) {
      assert.deepEqual(
        montantDuPourMois(b, apres, mois),
        montantDuPourMois(b, avant, mois),
        `le montant de ${mois.annee}-${mois.mois} doit être inchangé`,
      );
    }

    // Et le nouveau loyer ne s'applique qu'à partir du mois annoncé.
    assert.deepEqual(montantDuPourMois(b, apres, periode(2026, 9)), {
      loyer: 95000,
      charges: 5000,
      total: 100000,
    });
  });

  it('laisse l’historique sans chevauchement après application', () => {
    const periodes = [loyer({ debut: '2024-01', loyer: 80000 })];
    const plan = planifierChangementLoyer(periodes, '2026-09');
    const apres = appliquer(periodes, plan);
    apres.push(loyer({ debut: '2026-09', loyer: 95000 }));
    assert.deepEqual(chevauchements(apres), []);
  });

  it('enchaîne deux augmentations successives sans se gêner', () => {
    const b = bail({ dateEntree: '2024-01-01' });
    let periodes = [loyer({ debut: '2024-01', loyer: 80000 })];

    let plan = planifierChangementLoyer(periodes, '2025-09');
    periodes = appliquer(periodes, plan);
    periodes.push(loyer({ debut: '2025-09', loyer: 85000 }));

    plan = planifierChangementLoyer(periodes, '2026-09');
    periodes = appliquer(periodes, plan);
    periodes.push(loyer({ debut: '2026-09', loyer: 90000 }));

    assert.deepEqual(chevauchements(periodes), []);
    assert.equal(montantDuPourMois(b, periodes, periode(2024, 6)).loyer, 80000);
    assert.equal(montantDuPourMois(b, periodes, periode(2025, 9)).loyer, 85000);
    assert.equal(montantDuPourMois(b, periodes, periode(2026, 9)).loyer, 90000);
    assert.equal(periodes.length, 3, 'trois décisions, trois périodes');
  });
});
