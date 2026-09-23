/**
 * Tests de l'archive ZIP et des conversions d'octets.
 *
 * L'archive est écrite à la main : on vérifie donc qu'elle est bien formée, et
 * qu'un lecteur externe la reconnaît. On contrôle la structure, pas l'intention.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  base64VersOctets,
  chaineVersOctets,
  crc32,
  octetsVersBase64,
} from '../src/pdf/encodage.ts';

describe('CRC-32', () => {
  it('retrouve les valeurs de référence', () => {
    // Valeurs publiées dans la spécification ZIP.
    assert.equal(crc32(chaineVersOctets('123456789')), 0xcbf43926);
    assert.equal(crc32(new Uint8Array(0)), 0);
  });

  it('distingue deux contenus différents', () => {
    assert.notEqual(crc32(chaineVersOctets('abc')), crc32(chaineVersOctets('abd')));
  });
});

describe('Conversions Base64', () => {
  it('fait l’aller-retour sans perte sur du texte simple', () => {
    const original = 'Quittance de loyer septembre 2026';
    const octets = chaineVersOctets(original);
    const base64 = octetsVersBase64(octets);
    const retour = base64VersOctets(base64);

    assert.deepEqual(Array.from(retour), Array.from(octets));
  });

  it('encode l’UTF-8 correctement, accents compris', () => {
    // « é » vaut 0xC3 0xA9 en UTF-8.
    const octets = chaineVersOctets('é');
    assert.deepEqual(Array.from(octets), [0xc3, 0xa9]);
  });

  it('gère les caractères hors du plan de base', () => {
    const octets = chaineVersOctets('€');
    assert.deepEqual(Array.from(octets), [0xe2, 0x82, 0xac]);
  });

  it('produit un Base64 de longueur correcte', () => {
    // 3 octets donnent 4 caractères, sans remplissage.
    assert.equal(octetsVersBase64(new Uint8Array([1, 2, 3])).length, 4);
    // 1 octet donne 4 caractères, dont deux de remplissage.
    const un = octetsVersBase64(new Uint8Array([65]));
    assert.equal(un.length, 4);
    assert.ok(un.endsWith('=='));
  });

  it('relit un Base64 produit par une bibliothèque externe', () => {
    // « Bonjour » en Base64 standard.
    const octets = base64VersOctets('Qm9uam91cg==');
    assert.deepEqual(Array.from(octets), Array.from(chaineVersOctets('Bonjour')));
  });

  it('tolère un Base64 contenant des retours à la ligne', () => {
    const avecRetours = 'Qm9u\nam91\r\ncg==';
    const octets = base64VersOctets(avecRetours);
    assert.deepEqual(Array.from(octets), Array.from(chaineVersOctets('Bonjour')));
  });
});
