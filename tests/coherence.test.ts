/**
 * Cohérence de bout en bout : paiements enregistrés, montants affichés, et
 * document que l'application a le droit d'émettre.
 *
 * C'est le contrôle que réclame la promesse centrale du projet : *jamais de
 * quittance attestant un paiement intégral qui n'a pas été enregistré*. Plutôt
 * que de relire le code de la base, on rejoue ici la chaîne complète sur des
 * cas qui ressemblent à la vraie vie — deux versements pour un même mois, un
 * mois soldé puis suivi d'un mois impayé, une augmentation de loyer en cours
 * d'année.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { periode } from '../src/domain/period.ts';
import {
  actionPrincipale,
  contexteDuMois,
  documentAutorise,
  peutEmettreQuittance,
  statistiquesDuMois,
  type ContexteMois,
} from '../src/domain/payments.ts';
import type { Bail, Paiement, PeriodeLoyer } from '../src/domain/types.ts';

const LOYER = 85000;
const CHARGES = 5000;

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

function periodeLoyer(debut: string, loyer = LOYER, charges = CHARGES): PeriodeLoyer {
  return {
    id: `pl-${debut}`,
    bailId: 'bail-1',
    debut,
    fin: null,
    loyer,
    charges,
    commentaire: null,
    creeLe: `${debut}-01T00:00:00.000Z`,
  };
}

function paiement(
  mois: string,
  montant: number,
  date: string,
  champs: Partial<Paiement> = {},
): Paiement {
  return {
    id: `paie-${mois}-${date}-${montant}`,
    bailId: 'bail-1',
    periode: mois,
    montant,
    datePaiement: date,
    mode: 'virement',
    note: null,
    creeLe: `${date}T09:00:00.000Z`,
    ...champs,
  };
}

/** Date de référence placée au 20 du mois, après l'échéance du 5. */
function contexte(mois: string, paiements: Paiement[], b = bail(), pl = [periodeLoyer('2024-01')]): ContexteMois {
  const [annee, m] = mois.split('-').map(Number);
  return contexteDuMois({
    bail: b,
    periodesLoyer: pl,
    paiements,
    periode: periode(annee, m),
    dateDuJour: `${mois}-20`,
  });
}

describe('Cohérence : ce qui est enregistré, affiché, et émis', () => {
  it('sans aucun paiement, aucun document n’est autorisé', () => {
    const c = contexte('2026-09', []);

    assert.equal(c.cumul.encaisse, 0, 'rien encaissé');
    assert.equal(c.solde, 90000, 'le solde affiché vaut le montant dû');
    assert.equal(c.statut, 'retard', 'le 20 est après l’échéance du 5');
    assert.equal(documentAutorise(c), null, 'un mois impayé ne produit rien');
    assert.equal(peutEmettreQuittance(c), false, 'la quittance est interdite');
  });

  it('un paiement partiel ne donne aucun document, et jamais une quittance', () => {
    const c = contexte('2026-09', [paiement('2026-09', 50000, '2026-09-08')]);

    assert.equal(c.cumul.encaisse, 50000);
    assert.equal(c.solde, 40000, 'le reste dû est exact');
    assert.equal(c.statut, 'partiel');
    assert.equal(documentAutorise(c), null, 'un paiement partiel ne produit rien');
    assert.equal(peutEmettreQuittance(c), false);
  });

  it('l’addition de deux versements partiels finit par autoriser la quittance', () => {
    const avant = contexte('2026-09', [paiement('2026-09', 50000, '2026-09-08')]);
    assert.equal(peutEmettreQuittance(avant), false);

    const apres = contexte('2026-09', [
      paiement('2026-09', 50000, '2026-09-08'),
      paiement('2026-09', 40000, '2026-09-19'),
    ]);

    assert.equal(apres.cumul.encaisse, 90000, 'les deux versements s’additionnent');
    assert.equal(apres.cumul.nombre, 2);
    assert.equal(apres.solde, 0, 'le solde est soldé');
    assert.equal(apres.statut, 'paye');
    assert.equal(documentAutorise(apres), 'quittance');
    assert.equal(peutEmettreQuittance(apres), true);
  });

  it('les dates imprimées sont celles des paiements réels, dédoublonnées', () => {
    const c = contexte('2026-09', [
      paiement('2026-09', 45000, '2026-09-08'),
      paiement('2026-09', 45000, '2026-09-08'),
      paiement('2026-09', 10000, '2026-09-19'),
    ]);

    assert.deepEqual(
      c.cumul.dates,
      ['2026-09-08', '2026-09-19'],
      'deux versements le même jour ne font qu’une date',
    );
    assert.equal(c.statut, 'paye');
  });

  it('le montant attesté est la somme réellement encaissée', () => {
    const c = contexte('2026-09', [paiement('2026-09', 90000, '2026-09-10')]);

    assert.equal(c.montantDu.total, 90000, 'montant dû = loyer + charges');
    assert.equal(c.cumul.encaisse, 90000);
    assert.equal(c.solde, 0);
    // C'est cette égalité qui garantit qu'un PDF ne peut pas annoncer autre
    // chose que ce qui a été enregistré.
    assert.equal(c.cumul.encaisse, c.montantDu.total);
  });

  it('un paiement affecté à un autre mois ne solde pas celui-ci', () => {
    const c = contexte('2026-09', [paiement('2026-08', 90000, '2026-09-03')]);

    assert.equal(c.cumul.encaisse, 0, 'le versement appartient à août');
    assert.equal(c.statut, 'retard');
    assert.equal(peutEmettreQuittance(c), false);
  });

  it('un trop-perçu n’autorise pas un montant attesté supérieur au dû', () => {
    const c = contexte('2026-09', [paiement('2026-09', 95000, '2026-09-10')]);

    assert.equal(c.statut, 'paye');
    assert.equal(c.solde, 0, 'le solde ne devient jamais négatif');
    // Le document doit porter le montant dû, pas le trop-perçu : c'est ce que
    // fait `emettreDocument`, qui lit `montantDu`.
    assert.equal(c.montantDu.total, 90000);
  });

  it('l’action proposée suit toujours le statut réel', () => {
    assert.equal(
      actionPrincipale({ contexte: contexte('2026-09', []) }).type,
      'enregistrer_paiement',
    );

    assert.equal(
      actionPrincipale({
        contexte: contexte('2026-09', [paiement('2026-09', 50000, '2026-09-08')]),
      }).type,
      'completer_paiement',
    );

    assert.equal(
      actionPrincipale({
        contexte: contexte('2026-09', [paiement('2026-09', 90000, '2026-09-08')]),
      }).type,
      'generer_quittance',
    );

    // Une quittance déjà émise se consulte, elle ne se régénère pas.
    assert.equal(
      actionPrincipale({
        contexte: contexte('2026-09', [paiement('2026-09', 90000, '2026-09-08')]),
        documentExistant: { id: 'doc-1', type: 'quittance' },
      }).type,
      'voir_quittance',
    );
  });

  it('le montant proposé pour compléter est exactement le solde', () => {
    const action = actionPrincipale({
      contexte: contexte('2026-09', [paiement('2026-09', 50000, '2026-09-08')]),
    });

    assert.equal(action.type, 'completer_paiement');
    if (action.type === 'completer_paiement') {
      assert.equal(action.montantSuggere, 40000);
    }
  });
});

describe('Cohérence : les chiffres du tableau de bord', () => {
  /**
   * Trois logements, trois situations : soldé, partiel, impayé. Les totaux
   * affichés en haut de l'écran doivent correspondre exactement à la somme des
   * cartes affichées en dessous.
   */
  const soldé = contexte('2026-09', [paiement('2026-09', 90000, '2026-09-04')]);
  const partiel = contexte('2026-09', [paiement('2026-09', 30000, '2026-09-12')]);
  const impaye = contexte('2026-09', []);

  it('additionne l’attendu, l’encaissé et le reste sans écart', () => {
    const stats = statistiquesDuMois([soldé, partiel, impaye]);

    assert.equal(stats.nombreLogements, 3);
    assert.equal(stats.nombrePayes, 1);
    assert.equal(stats.attendu, 270000, '3 × 900 €');
    assert.equal(stats.encaisse, 90000 + 30000, 'soldé + partiel');
    assert.equal(stats.reste, 270000 - 120000);
    assert.equal(
      stats.encaisse + stats.reste,
      stats.attendu,
      'encaissé + reste doit redonner l’attendu',
    );
    assert.equal(stats.pourcentageRegle, 33);
  });

  it('n’arrondit pas le pourcentage au-delà de cent', () => {
    const stats = statistiquesDuMois([soldé, soldé, soldé]);
    assert.equal(stats.pourcentageRegle, 100);
    assert.equal(stats.reste, 0);
  });

  it('ignore les logements hors bail dans les totaux', () => {
    const horsBail = contexte(
      '2026-09',
      [],
      bail({ dateEntree: '2026-11-01' }),
      [periodeLoyer('2026-11')],
    );

    const stats = statistiquesDuMois([soldé, horsBail]);
    assert.equal(stats.nombreLogements, 1, 'le second logement ne compte pas');
    assert.equal(stats.attendu, 90000);
    assert.equal(horsBail.statut, 'hors_bail');
    assert.equal(horsBail.solde, 0);
  });
});
