/**
 * La mention libre tient sur la feuille.
 *
 * Un défaut mesuré le 23 septembre 2026, et **pas** un défaut vivant : la
 * feuille a une hauteur fixe, et son volet ne se poursuit pas sur une page
 * suivante — un contenu trop long n'est ni renvoyé ni signalé, il est **rogné en
 * silence**. Mesuré par `.verif/eprouver-rognage.py`, qui imprime la même
 * quittance avec une mention de plus en plus longue et cherche dans le texte du
 * PDF une sentinelle placée en fin de mention :
 *
 *   - jusqu'à 2 000 caractères, la sentinelle survit, sur une seule page ;
 *   - à 3 000, elle a disparu — et le document reste sur une seule page.
 *
 * Le défaut n'est pas atteignable aujourd'hui : l'écran borne la saisie à 300
 * caractères, soit sept fois moins. Ce contrôle ne protège donc pas d'un défaut
 * présent, il protège d'une **réintroduction** — quelqu'un relevant la borne, ou
 * la retirant, sans savoir ce qu'elle tient.
 *
 * Où ce contrôle s'arrête : il lit des sources et des constantes, il ne rend
 * rien. C'est le banc cité ci-dessus qui **compte** et qui cherche la sentinelle.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LONGUEUR_MENTION_LIBRE_MAX,
  MARQUE_ABREVIATION,
  mentionPourDocument,
} from '../src/domain/mentions.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const ECRAN = join(ICI, '..', 'app', 'mentions.tsx');

/** En dessous, un fichier lu ne prouve rien. */
const MINIMUM_DE_CARACTERES = 500;

/**
 * Le plus long texte de mention imprimé intact sur une seule page, mesuré.
 * Au-delà — à 3 000 — la fin disparaît sans un mot.
 */
const PLAFOND_MESURE = 2000;

function lire(chemin: string): string {
  const source = readFileSync(chemin, 'utf8');
  assert.ok(
    source.length > MINIMUM_DE_CARACTERES,
    `${chemin} : ${source.length} caractère(s) — le contrôle ne mesure rien`,
  );
  return source;
}

test('Mentions : une mention courte part telle quelle', () => {
  const texte = 'Quittance établie pour servir et valoir ce que de droit.';
  assert.equal(mentionPourDocument(texte), texte);
});

test('Mentions : les blancs de bord sont retirés', () => {
  assert.equal(mentionPourDocument('  \n  Bon pour quittance  \n\n '), 'Bon pour quittance');
  assert.equal(mentionPourDocument('   '), '');
});

test('Mentions : une mention trop longue est bornée, et le dit', () => {
  const longue = 'a'.repeat(LONGUEUR_MENTION_LIBRE_MAX + 500);
  const rendue = mentionPourDocument(longue);

  assert.ok(
    rendue.length <= LONGUEUR_MENTION_LIBRE_MAX,
    `${rendue.length} caractères, au-delà de la borne de ${LONGUEUR_MENTION_LIBRE_MAX}`,
  );
  assert.ok(
    rendue.endsWith(MARQUE_ABREVIATION),
    "le texte abrégé doit porter la marque d'abréviation : une coupe muette "
      + 'reproduirait le défaut que la borne évite',
  );
  assert.ok(
    longue.startsWith(rendue.slice(0, -1).trimEnd()),
    'le texte gardé doit être le début de la mention, sans réécriture',
  );
});

test('Mentions : la borne de saisie est celle du domaine, et elle tient', () => {
  const ecran = lire(ECRAN);

  assert.match(
    ecran,
    /maxLength=\{LONGUEUR_MENTION_LIBRE_MAX\}/,
    'la mention libre n’est plus bornée par la constante du domaine : la borne '
      + 'peut alors être relevée ou retirée sans que rien ne le signale',
  );

  assert.ok(
    LONGUEUR_MENTION_LIBRE_MAX <= PLAFOND_MESURE,
    `${LONGUEUR_MENTION_LIBRE_MAX} caractères autorisés, alors que la mesure `
      + `donne ${PLAFOND_MESURE} comme plus long texte imprimé intact`,
  );
});
