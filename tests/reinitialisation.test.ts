/**
 * La remise à zéro : le mot qui la confirme, et l'ordre dans lequel elle vide.
 *
 * Deux choses, ici, ne peuvent pas être vérifiées en lançant le code : la
 * confirmation demandée à l'utilisateur, et l'ordre de suppression des tables.
 * Les deux se contrôlent pourtant, et pas par relecture.
 *
 * 1. **Le mot de confirmation.** `confirmationValide` est le seul juge : c'est
 *    lui qui décide si le bouton destructeur s'active. Il est donc éprouvé sur
 *    les saisies qu'un utilisateur produit réellement — espaces autour, mot
 *    approché, mot en minuscules — et pas seulement sur le cas heureux.
 *
 * 2. **L'ordre de suppression.** `PRAGMA foreign_keys = ON` est actif, et
 *    `logements.proprietaire_id` est déclaré `ON DELETE RESTRICT`. Supprimer un
 *    propriétaire avant ses logements fait échouer la transaction, et
 *    l'application resterait **à moitié effacée** : le pire des états, puisque
 *    l'utilisateur croirait avoir tout supprimé.
 *
 *    Ce contrôle ne recopie donc pas l'ordre attendu : il relit les
 *    `REFERENCES` des `MIGRATIONS` et exige que `TABLES_A_VIDER` en soit un
 *    **ordre topologique**. Une table ajoutée demain sans être mise dans la
 *    liste, ou mise au mauvais rang, tombe ici — et non sur le téléphone du
 *    bailleur, au moment où il appuie.
 *
 * Où ce contrôle s'arrête : il lit le schéma, pas la base. Il ne prouve pas que
 * la transaction aboutit sur un vrai SQLite — cela se mesure sur l'appareil.
 * Ce qu'il prouve est plus étroit et suffisant : la liste ne peut pas être en
 * désaccord avec le graphe de dépendances déclaré.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MIGRATIONS, TABLES, TABLES_A_VIDER, type NomTable } from '../src/db/schema.ts';
import { MOT_CONFIRMATION, confirmationValide } from '../src/domain/reinitialisation.ts';

const ICI = dirname(fileURLToPath(import.meta.url));

/** Planchers : un graphe vide rendrait le contrôle de forme vert sans rien dire. */
const MINIMUM_DE_TABLES = 8;
const MINIMUM_DE_DEPENDANCES = 6;

// ---------------------------------------------------------------------------
// Le graphe de dépendances, dérivé du schéma
// ---------------------------------------------------------------------------

interface Dependance {
  /** La table qui porte la clé étrangère — donc l'enfant. */
  enfant: NomTable;
  /** La table vers laquelle elle pointe — donc le parent. */
  parent: NomTable;
}

/**
 * Lit les `REFERENCES` déclarées dans les `MIGRATIONS`.
 *
 * Chaque `CREATE TABLE` se termine par `);` en début de fin de ligne. Les
 * parenthèses des `REFERENCES table(id)` ne sont donc jamais suivies d'un
 * point-virgule, et la première occurrence de `);` après le début d'un
 * `CREATE TABLE` est bien sa fin. On ne suppose rien de l'indentation : on
 * cherche le motif.
 */
function lireDependances(): Dependance[] {
  const sql = MIGRATIONS.flatMap((m) => m.statements).join('\n');
  const dependances: Dependance[] = [];
  const ouverture = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(/g;

  // `matchAll` travaille sur une copie de l'expression : `ouverture.lastIndex`
  // ne bouge pas. La position se lit donc sur la correspondance, pas sur
  // l'expression — sinon chaque table serait lue depuis le caractère zéro, et
  // le graphe entier serait faux.
  for (const correspondance of sql.matchAll(ouverture)) {
    const nom = correspondance[1];
    const debut = (correspondance.index ?? 0) + correspondance[0].length;
    const fin = sql.indexOf(');', debut);
    assert.notEqual(
      fin,
      -1,
      `le CREATE TABLE ${nom} ne se termine pas par « ); » — lecture impossible`,
    );
    const corps = sql.slice(debut, fin);

    for (const [, parent] of corps.matchAll(/REFERENCES\s+(\w+)/g)) {
      dependances.push({ enfant: nom as NomTable, parent: parent as NomTable });
    }
  }

  return dependances;
}

test('Réinitialisation : la liste des tables à vider suit le graphe des clés étrangères', () => {
  const dependances = lireDependances();

  assert.ok(
    dependances.length >= MINIMUM_DE_DEPENDANCES,
    `seulement ${dependances.length} dépendance(s) lue(s) dans MIGRATIONS — le motif ne mesure plus rien`,
  );

  // Un parent cité mais absent de `TABLES` signalerait que la lecture du schéma
  // est fausse : on le dit ici plutôt que de laisser un faux vert plus loin.
  const connues = new Set<string>(TABLES);
  for (const { enfant, parent } of dependances) {
    assert.ok(connues.has(enfant), `la table ${enfant} référence ${parent} mais n'est pas dans TABLES`);
    assert.ok(connues.has(parent), `la table ${enfant} référence ${parent}, absent de TABLES`);
  }

  const rang = new Map<string, number>();
  TABLES_A_VIDER.forEach((table, index) => rang.set(table, index));

  // Une table du schéma oubliée dans la liste survivrait à la remise à zéro :
  // c'est exactement le genre d'oubli silencieux que ce contrôle doit attraper.
  for (const table of TABLES) {
    assert.ok(
      rang.has(table),
      `la table ${table} n'est pas dans TABLES_A_VIDER : elle survivrait à la remise à zéro`,
    );
  }
  assert.equal(
    TABLES_A_VIDER.length,
    TABLES.length,
    'TABLES_A_VIDER ne fait pas exactement le tour des tables du schéma',
  );

  for (const { enfant, parent } of dependances) {
    if (enfant === parent) continue;
    const rangEnfant = rang.get(enfant) as number;
    const rangParent = rang.get(parent) as number;
    assert.ok(
      rangEnfant < rangParent,
      `TABLES_A_VIDER vide ${parent} avant ${enfant} : la transaction échouerait `
        + 'sur la contrainte de clé étrangère et laisserait l’application à moitié effacée',
    );
  }
});

// ---------------------------------------------------------------------------
// Le mot de confirmation
// ---------------------------------------------------------------------------

test('Réinitialisation : la confirmation accepte le mot exact, et rien d’approchant', () => {
  // Ce qui doit passer : le mot, tel qu'il est demandé.
  assert.equal(confirmationValide(MOT_CONFIRMATION), true, 'le mot exact doit être accepté');

  // Les espaces autour ne sont pas une erreur de l'utilisateur : un clavier de
  // téléphone en ajoute volontiers, et refuser pour cela serait gratuit.
  assert.equal(confirmationValide(' SUPPRIMER '), true, 'les espaces autour doivent être tolérés');
  assert.equal(confirmationValide('\tSUPPRIMER\n'), true, 'les blancs autour doivent être tolérés');

  // Tout le reste doit être refusé. En particulier le mot approché : c'est
  // précisément ce qu'un utilisateur tape quand il n'a pas lu, et l'accepter
  // viderait la confirmation de son sens.
  for (const saisie of ['', ' ', 'SUPPRIME', 'SUPPRIMER!', 'SUPPRIMER TOUT', 'supprimer', 'Supprimer']) {
    assert.equal(
      confirmationValide(saisie),
      false,
      `« ${saisie} » ne doit pas confirmer l’effacement`,
    );
  }
});

test('Réinitialisation : le mot demandé est celui que l’écran annonce', () => {
  // Un mot vide, ou portant des espaces, serait inutilisable : l'aide sous le
  // champ le recopie tel quel, et l'utilisateur le taperait sans y arriver.
  assert.ok(MOT_CONFIRMATION.length > 0, 'le mot de confirmation est vide');
  assert.equal(MOT_CONFIRMATION, MOT_CONFIRMATION.trim(), 'le mot de confirmation porte des blancs');
  assert.equal(MOT_CONFIRMATION, MOT_CONFIRMATION.toUpperCase(), 'le mot doit être en capitales');
  assert.match(MOT_CONFIRMATION, /^[A-Z]+$/, 'le mot doit être en capitales ASCII, sans accent');

  // L'écran ne doit pas recopier le mot ni réécrire la règle : il les prend au
  // domaine. C'est ce qui rend un changement du mot effectif partout, et c'est
  // pourquoi le contrôle vise la **ligne d'import** plutôt qu'une occurrence
  // perdue dans le fichier — un écran qui importerait la règle tout en
  // recopiant le mot ailleurs ne serait pas plus juste pour autant.
  const ecran = readFileSync(join(ICI, '..', 'app', 'reinitialiser.tsx'), 'utf8');
  const ligne = ecran
    .split('\n')
    .find((l) => l.includes("'@/domain/reinitialisation'"));
  assert.ok(
    ligne !== undefined,
    'l’écran n’importe rien du domaine de la réinitialisation : le mot et la règle y sont recopiés',
  );
  assert.match(
    ligne,
    /\bMOT_CONFIRMATION\b/,
    'l’écran n’importe pas le mot de confirmation du domaine',
  );
  assert.match(
    ligne,
    /\bconfirmationValide\b/,
    'l’écran n’importe pas la règle du domaine qui décide si le bouton est actif',
  );
});
