/**
 * Tests des périodes : mois, années, décalages, jours d'échéance.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  comparer,
  dateDansPeriode,
  decaler,
  dernierJour,
  depuisCle,
  formaterDateFr,
  libelleLong,
  nombreDeJours,
  periode,
  periodeActuelle,
  periodesDeLAnnee,
  premierJour,
  versCle,
} from '../src/domain/period.ts';

describe('Périodes', () => {
  it('refuse une année ou un mois invalide', () => {
    assert.throws(() => periode(2026, 0));
    assert.throws(() => periode(2026, 13));
    assert.throws(() => periode(1800, 5));
  });

  it('convertit dans les deux sens entre période et clé', () => {
    const p = periode(2026, 9);
    assert.equal(versCle(p), '2026-09');
    assert.deepEqual(depuisCle('2026-09'), { annee: 2026, mois: 9 });
    assert.equal(depuisCle('2026-13'), null, 'mois 13 doit être refusé');
    assert.equal(depuisCle('26-09'), null);
    assert.equal(depuisCle('n’importe quoi'), null);
  });

  it('une clé se trie correctement comme du texte', () => {
    const cles = ['2026-10', '2026-02', '2025-12'];
    assert.deepEqual(cles.slice().sort(), ['2025-12', '2026-02', '2026-10']);
  });

  it('décale un mois en avant et en arrière, y compris au changement d’année', () => {
    assert.deepEqual(decaler(periode(2026, 9), 1), { annee: 2026, mois: 10 });
    assert.deepEqual(decaler(periode(2026, 12), 1), { annee: 2027, mois: 1 });
    assert.deepEqual(decaler(periode(2026, 1), -1), { annee: 2025, mois: 12 });
    assert.deepEqual(decaler(periode(2026, 9), -12), { annee: 2025, mois: 9 });
    assert.deepEqual(decaler(periode(2026, 9), 0), { annee: 2026, mois: 9 });
  });

  it('compare deux périodes', () => {
    assert.ok(comparer(periode(2026, 2), periode(2026, 10)) < 0);
    assert.ok(comparer(periode(2027, 1), periode(2026, 12)) > 0);
    assert.equal(comparer(periode(2026, 5), periode(2026, 5)), 0);
  });

  it('met en forme les libellés en français', () => {
    assert.equal(libelleLong(periode(2026, 9)), 'septembre 2026');
    assert.equal(libelleLong(periode(2026, 1)), 'janvier 2026');
    assert.equal(libelleLong(periode(2026, 8)), 'août 2026');
  });

  it('calcule les bornes d’un mois, y compris en février', () => {
    assert.equal(premierJour(periode(2026, 9)), '2026-09-01');
    assert.equal(dernierJour(periode(2026, 9)), '2026-09-30');
    assert.equal(dernierJour(periode(2026, 2)), '2026-02-28');
    assert.equal(dernierJour(periode(2028, 2)), '2028-02-29', '2028 est bissextile');
    assert.equal(nombreDeJours(periode(2026, 7)), 31);
  });

  it('détermine si une date appartient à un mois', () => {
    assert.ok(dateDansPeriode('2026-09-15', periode(2026, 9)));
    assert.ok(!dateDansPeriode('2026-10-01', periode(2026, 9)));
    assert.ok(!dateDansPeriode('2026-08-31', periode(2026, 9)));
  });

  it('rend les douze mois d’une année, dans l’ordre', () => {
    const mois = periodesDeLAnnee(2026);
    assert.equal(mois.length, 12);
    assert.equal(versCle(mois[0]), '2026-01');
    assert.equal(versCle(mois[11]), '2026-12');
  });

  it('déduit la période du jour', () => {
    assert.deepEqual(periodeActuelle(new Date(2026, 8, 23)), { annee: 2026, mois: 9 });
    assert.deepEqual(periodeActuelle(new Date(2026, 11, 31)), { annee: 2026, mois: 12 });
  });

  it('met une date en forme à la française', () => {
    assert.equal(formaterDateFr('2026-09-15'), '15 septembre 2026');
    assert.equal(formaterDateFr('2026-01-01'), '1 janvier 2026');
  });
});
