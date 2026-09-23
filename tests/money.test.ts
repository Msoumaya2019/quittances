/**
 * Tests du moteur métier.
 *
 * Exécution : `npm run test:domaine`
 *
 * Ces tests tournent avec le seul `node:test`, sans dépendance supplémentaire,
 * et sans téléphone : le domaine ne connaît ni Expo ni SQLite.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatMontant,
  parseMontant,
  rapportPourcent,
  somme,
} from '../src/domain/money.ts';

describe('Arithmétique monétaire', () => {
  it('convertit une saisie simple en centimes', () => {
    assert.equal(parseMontant('850'), 85000);
    assert.equal(parseMontant('850,50'), 85050);
    assert.equal(parseMontant('850.5'), 85050);
    assert.equal(parseMontant('1 200'), 120000);
    assert.equal(parseMontant('1 200,00 €'), 120000);
    assert.equal(parseMontant('0'), 0);
  });

  it('refuse une saisie qui n’est pas un montant', () => {
    assert.equal(parseMontant(''), null);
    assert.equal(parseMontant('abc'), null);
    assert.equal(parseMontant('12,345'), null, 'trois décimales ne sont pas un montant');
    assert.equal(parseMontant('8,5,0'), null);
    assert.equal(parseMontant('-'), null);
  });

  it('n’introduit aucune erreur d’arrondi flottant', () => {
    // Le piège classique : 0,1 + 0,2 en flottant.
    const dixieme = parseMontant('0,10');
    const vingtieme = parseMontant('0,20');
    assert.equal(dixieme, 10);
    assert.equal(vingtieme, 20);
    assert.equal(somme([dixieme!, vingtieme!]), 30);
    assert.equal(formatMontant(30), '0,30 €');
  });

  it('formate à la française, avec séparateur de milliers', () => {
    assert.equal(formatMontant(85000), '850,00 €');
    assert.equal(formatMontant(85000, { decimales: 'auto' }), '850 €');
    assert.equal(formatMontant(0), '0,00 €');
    assert.equal(formatMontant(120000), '1 200,00 €');
    assert.equal(formatMontant(123456), '1 234,56 €');
    assert.equal(formatMontant(-5000), '-50,00 €');
    assert.equal(formatMontant(85000, { symbole: false }), '850,00');
  });

  it('somme une liste, y compris vide', () => {
    assert.equal(somme([]), 0);
    assert.equal(somme([85000, 50000]), 135000);
  });

  it('borne le rapport de progression entre 0 et 100', () => {
    assert.equal(rapportPourcent(0, 0), 0);
    assert.equal(rapportPourcent(8, 10), 80);
    assert.equal(rapportPourcent(12, 10), 100);
    assert.equal(rapportPourcent(-3, 10), 0);
  });
});
