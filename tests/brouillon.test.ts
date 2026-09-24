/**
 * Les brouillons : reprendre une saisie interrompue.
 *
 * Ces tests portent sur le **domaine pur** — `node --test`, sans émulateur.
 *
 * Ce qu'ils protègent : **une saisie en cours ne se perd pas à cause d'une
 * donnée illisible.** Le contenu d'un brouillon peut avoir été tronqué par une
 * écriture interrompue ; une étape peut avoir été renommée par une version
 * ultérieure. Dans les deux cas, l'écran doit s'ouvrir — imparfaitement, mais
 * s'ouvrir.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  JOURS_BROUILLON_RECENT,
  analyserDonnees,
  brouillonRecent,
  etapeReprise,
  joursEntre,
  serialiserDonnees,
} from '../src/domain/brouillon.ts';

const ETAPES = [
  { valeur: 'logement' },
  { valeur: 'locataires' },
  { valeur: 'categorie' },
];

// ---------------------------------------------------------------------------
// Lecture tolérante
// ---------------------------------------------------------------------------

test('un contenu illisible rend un objet vide, sans lever', () => {
  // Une écriture interrompue peut laisser un JSON tronqué. L'écran doit
  // s'ouvrir sur un formulaire vierge, pas sur une exception.
  assert.deepEqual(analyserDonnees('{"a": 1'), {});
  assert.deepEqual(analyserDonnees(''), {});
  assert.deepEqual(analyserDonnees(null), {});
  assert.deepEqual(analyserDonnees(undefined), {});
  assert.deepEqual(analyserDonnees('nawak'), {});
});

test('une forme inattendue est traitée comme un contenu vide', () => {
  // Un tableau, un nombre, une chaîne ou `null` sont des formes qu'une
  // sauvegarde d'une autre version peut produire. Les laisser passer
  // propagerait un non-objet jusqu'à un écran qui le lirait comme un objet.
  assert.deepEqual(analyserDonnees('[]'), {});
  assert.deepEqual(analyserDonnees('42'), {});
  assert.deepEqual(analyserDonnees('"texte"'), {});
  assert.deepEqual(analyserDonnees('null'), {});
});

test('un contenu lisible est rendu tel quel', () => {
  assert.deepEqual(analyserDonnees('{"etape": 2, "pieces": ["salon"]}'), {
    etape: 2,
    pieces: ['salon'],
  });
});

test('la sérialisation ne lève jamais, même sur une valeur circulaire', () => {
  assert.equal(serialiserDonnees({ a: 1 }), '{"a":1}');
  assert.equal(serialiserDonnees(null), '{}');
  assert.equal(serialiserDonnees(undefined), '{}');

  // Une référence circulaire ferait lever `JSON.stringify` et perdrait la
  // saisie entière : on rend un objet vide, et l'écran reste debout.
  const circulaire: Record<string, unknown> = {};
  circulaire.lui = circulaire;
  assert.equal(serialiserDonnees(circulaire), '{}');
});

test('ce qui est écrit se relit', () => {
  const contenu = { etape: 'loyer', loyer: 70000, diagnostics: [{ libelle: 'Gaz' }] };
  assert.deepEqual(analyserDonnees(serialiserDonnees(contenu)), contenu);
});

// ---------------------------------------------------------------------------
// Reprise
// ---------------------------------------------------------------------------

test('on reprend à l’étape enregistrée quand elle existe encore', () => {
  assert.equal(etapeReprise('categorie', ETAPES), 'categorie');
  assert.equal(etapeReprise('locataires', ETAPES), 'locataires');
});

test('une étape disparue ne bloque pas la reprise', () => {
  // Une version ultérieure peut renommer ou retirer une étape. Rendre son nom
  // tel quel laisserait l'écran sur une étape que plus rien ne reconnaît.
  assert.equal(etapeReprise('ancienne_etape', ETAPES), null);
  assert.equal(etapeReprise('', ETAPES), null);
  assert.equal(etapeReprise(null, ETAPES), null);
  assert.equal(etapeReprise(undefined, ETAPES), null);
});

// ---------------------------------------------------------------------------
// Ancienneté
// ---------------------------------------------------------------------------

test('les jours entre deux dates civiles sont comptés, pas estimés', () => {
  assert.equal(joursEntre('2026-09-01', '2026-09-24'), 23);
  assert.equal(joursEntre('2026-09-24', '2026-09-24'), 0);
  // Un changement de mois, puis d'année, puis d'heure d'été : trois pièges
  // qu'un calcul en mois ou en heures approximerait.
  assert.equal(joursEntre('2026-08-31', '2026-09-01'), 1);
  assert.equal(joursEntre('2025-12-31', '2026-01-01'), 1);
  assert.equal(joursEntre('2026-03-28', '2026-03-30'), 2);
  assert.equal(joursEntre('nawak', '2026-09-24'), null);
});

test('un brouillon récent est annoncé comme tel, un brouillon oublié non', () => {
  assert.equal(brouillonRecent('2026-09-20', '2026-09-24'), true);
  // 26 août → 24 septembre : 29 jours. Le 24 août en ferait 31, au-delà du seuil.
  assert.equal(brouillonRecent('2026-08-26', '2026-09-24'), true);
  assert.equal(brouillonRecent('2026-08-24', '2026-09-24'), false);
  assert.equal(brouillonRecent('2026-07-01', '2026-09-24'), false);
  assert.equal(JOURS_BROUILLON_RECENT, 30);
});

test('une date d’écriture illisible n’est pas annoncée comme récente', () => {
  // Dire « repris il y a deux jours » sur une date qu'on n'a pas su lire
  // serait une invention.
  assert.equal(brouillonRecent('', '2026-09-24'), false);
  assert.equal(brouillonRecent('nawak', '2026-09-24'), false);
});
