/**
 * Les souches : un numéro attribué n'est jamais réattribué.
 *
 * C'est une promesse de comptabilité, pas de confort. Une quittance porte un
 * numéro parce qu'elle peut être remise au locataire, et deux quittances
 * différentes qui porteraient le même numéro rendraient le contrôle impossible —
 * au moment précis où il compte, c'est-à-dire quand quelqu'un conteste.
 *
 * La promesse tenait tant que supprimer un document ne retirait que son fichier.
 * La demande « pouvoir supprimer n'importe quel document » a changé cela : en
 * retirant la ligne, elle fait **retomber le rang maximal**, et le numéro de la
 * dernière quittance de l'année redevient le prochain attribué. Ce banc
 * commence donc par établir ce défaut, avant de vérifier que les souches le
 * ferment.
 *
 * Trois choses sont contrôlées, à trois niveaux :
 *
 *  1. **la règle pure** — `rangSuivant` prend le maximum des numéros présents
 *     **et** des rangs consommés ;
 *  2. **le calcul en base** — `prochainNumero` réserve le numéro, c'est-à-dire
 *     qu'il l'écrit. La réservation est une écriture, et c'est ce qui rend le
 *     numéro consommé même si l'enregistrement du document échoue ensuite ;
 *  3. **la forme de la souche** — la table ne porte **aucune clé étrangère**.
 *     Ce n'est pas un détail de schéma : `documents.logement_id` est
 *     `ON DELETE CASCADE`, donc une souche qui pendrait au logement disparaîtrait
 *     avec lui, et le numéro redeviendrait libre. C'est exactement le défaut que
 *     la table existe pour empêcher.
 *
 * Où ce banc s'arrête : il lit des sources et exerce des fonctions pures. Il
 * n'ouvre pas `expo-sqlite` ; que les ordres SQL s'exécutent sur l'appareil est
 * le rôle de `tests/migration-civilite.test.ts`, qui les rejoue sur un SQLite
 * du système, et des mesures sur un binaire livré.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { numeroDocument, rangDeNumero, rangSuivant } from '../src/domain/numbering.ts';
import { MIGRATIONS, TABLES, TABLES_A_VIDER, VERSION_SCHEMA } from '../src/db/schema.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const DEPOT = join(ICI, '..');
const lire = (chemin: string): string => readFileSync(join(DEPOT, chemin), 'utf8');

/** Les numéros d'une année, comme s'ils étaient encore tous présents. */
function numeros(jusquA: number, type: 'quittance' = 'quittance'): string[] {
  return Array.from({ length: jusquA }, (_, i) => numeroDocument(type, 2026, i + 1));
}

// ---------------------------------------------------------------------------
// 1. Le défaut, établi
// ---------------------------------------------------------------------------

test('Souches : sans souche, supprimer la dernière quittance rend son numéro', () => {
  // Cinq quittances émises. La sixième est la prochaine.
  assert.equal(rangSuivant(numeros(5), 'quittance', 2026), 6);

  // La cinquième est supprimée : sa ligne disparaît, donc le maximum retombe.
  // C'est le défaut que la demande de suppression a introduit, et il est
  // mesuré ici pour que le correctif ait une raison plutôt qu'une intuition.
  assert.equal(
    rangSuivant(numeros(4), 'quittance', 2026),
    5,
    'le rang 5 devrait revenir sans souche : si ce n’est plus le cas, le défaut '
      + 'a changé de forme et le correctif ci-dessous ne mesure plus ce qu’il croit',
  );
});

test('Souches : un rang consommé ne revient pas', () => {
  // La souche de la quittance supprimée porte le rang 5.
  assert.equal(
    rangSuivant(numeros(4), 'quittance', 2026, [5]),
    6,
    'le rang d’une quittance supprimée a été réattribué : deux quittances '
      + 'différentes porteraient le même numéro',
  );
});

test('Souches : le maximum se prend sur les deux ensembles, jamais sur les survivants', () => {
  // Une souche plus ancienne que le maximum présent ne change rien.
  assert.equal(rangSuivant(numeros(5), 'quittance', 2026, [2]), 6);

  // Une souche plus récente que tout ce qui reste décide, seule.
  assert.equal(rangSuivant([], 'quittance', 2026, [9]), 10);

  // Plusieurs souches : c'est la plus haute qui compte.
  assert.equal(rangSuivant(numeros(2), 'quittance', 2026, [3, 7, 5]), 8);

  // Une souche illisible — une sauvegarde abîmée — est ignorée plutôt que de
  // faire échouer une émission. La conséquence est un rang peut-être repris,
  // jamais une quittance impossible à produire.
  assert.equal(rangSuivant(numeros(4), 'quittance', 2026, [Number.NaN, 2.5]), 5);
});

test('Souches : le rang d’un numéro se relit, et un numéro étranger ne dit rien', () => {
  assert.equal(rangDeNumero('QUI-2026-0007', 'quittance', 2026), 7);

  // Un numéro d'une autre année, d'un autre type, ou d'une autre forme : la
  // souche ne doit pas compter pour cette année-là.
  assert.equal(rangDeNumero('QUI-2025-0007', 'quittance', 2026), null);
  assert.equal(rangDeNumero('REC-2026-0007', 'quittance', 2026), null);
  assert.equal(rangDeNumero('QUI-2026-7', 'quittance', 2026), null);
  assert.equal(rangDeNumero('', 'quittance', 2026), null);
});

// ---------------------------------------------------------------------------
// 2. Le calcul en base : réserver est une écriture
// ---------------------------------------------------------------------------

test('Souches : prochainNumero réserve le numéro, il ne se contente pas de le lire', () => {
  const source = lire('src/db/repositories/documents.ts');

  assert.match(
    source,
    /await\s+consommerNumero\s*\(/,
    'la réservation n’écrit pas la souche : un numéro attribué ne serait consommé '
      + 'qu’à l’enregistrement du document, et une émission qui échoue après avoir '
      + 'pris le numéro le laisserait réattribuable',
  );

  assert.match(
    source,
    /rangsConsommes\s*\(/,
    'le calcul du prochain numéro ne relit pas les souches : supprimer la dernière '
      + 'quittance d’une année ferait retomber le maximum',
  );
});

test('Souches : la souche est écrite dans la table, jamais déduite d’un compteur en mémoire', () => {
  const source = lire('src/db/repositories/numeros.ts');

  assert.match(
    source,
    /INSERT\s+INTO\s+numeros_consommes/,
    'la souche n’est pas écrite en base : elle ne survivrait pas au redémarrage',
  );

  // Le rang ne doit pas être stocké : deux représentations du même fait
  // finiraient par diverger, et une souche dont le numéro dit 7 quand la
  // colonne dit 5 rendrait la numérotation imprévisible.
  const creation = MIGRATIONS.flatMap((m) => m.statements).find((s) =>
    /CREATE TABLE IF NOT EXISTS numeros_consommes/.test(s),
  );
  assert.ok(creation, 'aucune migration ne crée la table des souches');
  assert.doesNotMatch(
    creation,
    /\brang\b/i,
    'la table des souches porte une colonne de rang : le rang doit se relire du '
      + 'numéro, sinon les deux peuvent diverger sans que rien ne le signale',
  );
});

// ---------------------------------------------------------------------------
// 3. La forme de la souche : aucune dépendance
// ---------------------------------------------------------------------------

test('Souches : la table ne pend à rien, sans quoi un logement supprimé libérerait ses numéros', () => {
  const creation = MIGRATIONS.flatMap((m) => m.statements).find((s) =>
    /CREATE TABLE IF NOT EXISTS numeros_consommes/.test(s),
  );
  assert.ok(creation, 'aucune migration ne crée la table des souches');

  assert.doesNotMatch(
    creation,
    /REFERENCES/i,
    'la table des souches porte une clé étrangère : `documents.logement_id` est '
      + 'ON DELETE CASCADE, donc supprimer un logement emporterait ses souches et '
      + 'libérerait les numéros de ses quittances — le défaut même que la table '
      + 'existe pour empêcher',
  );

  assert.ok(
    TABLES.includes('numeros_consommes'),
    'la table des souches n’est pas dans TABLES : le schéma et le code ne '
      + 'décrivent plus le même ensemble de tables',
  );
  assert.ok(
    TABLES_A_VIDER.includes('numeros_consommes'),
    'la table des souches n’est pas vidée par la remise à zéro : une remise à zéro '
      + 'laisserait des numéros réservés d’un carnet que l’utilisateur croyait neuf',
  );

  const migration = MIGRATIONS.find((m) =>
    m.statements.some((s) => /CREATE TABLE IF NOT EXISTS numeros_consommes/.test(s)),
  );
  assert.equal(
    migration?.version,
    VERSION_SCHEMA,
    'la dernière migration n’est pas celle du schéma courant : VERSION_SCHEMA a '
      + 'été oublié, et l’application refuserait de s’ouvrir sur une base neuve',
  );
});

// ---------------------------------------------------------------------------
// 4. La sauvegarde : une souche ne se rend pas
// ---------------------------------------------------------------------------

test('Souches : restaurer une sauvegarde n’en retire aucune', () => {
  const exportSource = lire('src/backup/export.ts');
  const importSource = lire('src/backup/import.ts');

  assert.match(
    exportSource,
    /toutesLesSouches\s*\(/,
    'la sauvegarde n’emporte pas les souches : restaurée, elle rendrait '
      + 'réattribuables les numéros des quittances supprimées avant sa création',
  );

  assert.match(
    importSource,
    /INSERT\s+INTO\s+numeros_consommes/,
    'la restauration n’écrit pas les souches de la sauvegarde',
  );

  // Le point décisif : la restauration ne **vide** pas les souches. Une
  // sauvegarde plus ancienne n'a jamais connu les documents supprimés depuis, et
  // les effacer rendrait leurs numéros réattribuables — un geste de sauvegarde
  // ne doit pas pouvoir annuler une garantie comptable.
  assert.doesNotMatch(
    importSource,
    /DELETE\s+FROM\s+numeros_consommes/i,
    'la restauration efface les souches : une sauvegarde plus ancienne libérerait '
      + 'les numéros consommés depuis, et une quittance déjà remise au locataire '
      + 'pourrait se voir réattribuer son numéro',
  );
});
