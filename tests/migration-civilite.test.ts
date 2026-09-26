/**
 * La migration qui ajoute la civilité : une base ancienne, remplie, migrée.
 *
 * Une colonne ajoutée à une table existante ne se prouve **pas** par relecture.
 * Sur une machine neuve, tout est reconstruit et les contrôles passent ; le
 * défaut ne se manifeste que sur les téléphones qui portaient déjà l'ancienne
 * version — c'est-à-dire partout sauf ici. Le seul contrôle qui vaille construit
 * donc une base **ancienne et remplie**, la migre pour de vrai, puis compare sa
 * forme à celle d'une base neuve.
 *
 * Trois choses sont exigées, dans cet ordre :
 *
 *  1. la base de départ est réellement dans l'état d'avant — sa table
 *     `titulaires` ne porte **pas** encore `civilite`. Sans cette garde, le banc
 *     pourrait migrer une base déjà à jour et rester vert sans rien mesurer ;
 *  2. après migration, la forme est identique à celle d'une base créée d'un seul
 *     coup par le code courant : mêmes colonnes, **dans le même ordre**, mêmes
 *     index. C'est le contrôle décisif — une colonne oubliée passerait le
 *     contrôle des données et tomberait ici ;
 *  3. les lignes écrites avant la migration sont **toutes** encore là, et leur
 *     `civilite` se lit `''`. Un locataire enregistré avant ne gagne pas une
 *     civilité que personne n'a saisie : c'est ce qui rend la migration
 *     additive, et les documents déjà remis inchangés.
 *
 * Ce que ce contrôle ne fait pas, et qui est dit ici pour qu'on ne le lui
 * demande pas : il n'ouvre pas `expo-sqlite`. Il rejoue les `MIGRATIONS` sur un
 * SQLite du système (`node:sqlite`), ce qui est la même mécanique et suffit à
 * prouver la forme. Que `expo-sqlite` exécute ces ordres sur l'appareil est le
 * comportement documenté de la bibliothèque.
 *
 * La base de départ n'est **pas** recopiée à la main : les migrations livrées ne
 * se réécrivent jamais (`src/db/schema.ts`), donc les versions antérieures sont
 * un fait historique figé, pas une dérivation du code d'aujourd'hui. La garde du
 * point 1 est là pour que cette confiance soit mesurée plutôt que supposée.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { MIGRATIONS, TABLES, VERSION_SCHEMA, type Migration } from '../src/db/schema.ts';

/**
 * La migration qui ajoute la civilité.
 *
 * Cherchée par son contenu, jamais supposée à un rang : une migration
 * intercalée demain ne doit pas rendre ce banc faux sans le dire. Quand elle
 * n'existe pas, c'est le contrôle qui le dit, **dans un test nommé** — et non
 * une exception au chargement du fichier, qui ne nomme aucune règle.
 */
const MIGRATION_CIVILITE = MIGRATIONS.find((m) =>
  m.statements.some((s) => /\bcivilite\b/.test(s)),
);

/** La version de la civilité ; celle du code si la migration a disparu. */
const VERSION_CIVILITE = MIGRATION_CIVILITE?.version ?? VERSION_SCHEMA;

/** L'état d'avant : la version qui précède celle de la civilité. */
const VERSION_AVANT = VERSION_CIVILITE - 1;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

function ouvrir(chemin: string): DatabaseSync {
  const db = new DatabaseSync(chemin);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

/** Applique des migrations, telles quelles, et avance la version. */
function appliquer(db: DatabaseSync, migrations: Migration[]): void {
  for (const migration of migrations) {
    for (const statement of migration.statements) db.exec(statement);
    db.exec(`PRAGMA user_version = ${migration.version};`);
  }
}

/** Une base neuve : toutes les migrations, dans l'ordre du code. */
function baseNeuve(chemin: string): DatabaseSync {
  const db = ouvrir(chemin);
  appliquer(db, [...MIGRATIONS].sort((a, b) => a.version - b.version));
  return db;
}

/** Une base dans l'état d'avant la civilité, et **seulement** cet état. */
function baseAncienne(chemin: string): DatabaseSync {
  const db = ouvrir(chemin);
  appliquer(
    db,
    MIGRATIONS.filter((m) => m.version <= VERSION_AVANT).sort((a, b) => a.version - b.version),
  );
  return db;
}

function version(db: DatabaseSync): number {
  const ligne = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  return ligne.user_version;
}

function colonnesDe(db: DatabaseSync, table: string): string[] {
  const info = db.prepare(`PRAGMA table_info(${table});`).all() as { name: string }[];
  return info.map((c) => c.name);
}

/**
 * La forme d'une base : ses tables avec leurs colonnes **dans l'ordre**, puis ses
 * index.
 *
 * `PRAGMA table_info` donne les colonnes et leur rang ; `sqlite_master` donne
 * les index. Les deux sont nécessaires : une colonne présente mais mal placée,
 * ou un index oublié, ne se voient pas dans les données.
 */
function nomsDesTables(db: DatabaseSync): string[] {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
    )
    .all() as { name: string }[];
  return tables.map((t) => t.name);
}

function structure(db: DatabaseSync): string[] {
  const lignes: string[] = [];

  for (const name of nomsDesTables(db)) {
    lignes.push(`${name}(${colonnesDe(db, name).join(', ')})`);
  }

  const index = db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name;",
    )
    .all() as { name: string; sql: string }[];

  for (const { name, sql } of index) {
    lignes.push(`index ${name}: ${sql.replace(/\s+/g, ' ').trim()}`);
  }

  return lignes;
}

function compter(db: DatabaseSync, table: string): number {
  const ligne = db.prepare(`SELECT COUNT(*) AS n FROM ${table};`).get() as { n: number };
  return ligne.n;
}

/**
 * Remplit la base ancienne.
 *
 * Migrer une base vide ne prouverait rien : `ALTER TABLE` réussirait aussi bien
 * sur une table sans lignes. Il faut des lignes, dans **toutes** les tables, pour
 * qu'une migration destructrice se voie.
 */
function remplir(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO proprietaires
      (id, nom, qualite, adresse, code_postal, ville, telephone, email, siret, notes, cree_le, modifie_le)
    VALUES
      ('prop-1', 'SCI LES TILLEULS', NULL, '12 rue des Tilleuls', '69003', 'Lyon',
       NULL, NULL, NULL, NULL, '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z');

    INSERT INTO logements
      (id, proprietaire_id, nom, type, complement, adresse, code_postal, ville, reference, surface, notes, cree_le, modifie_le)
    VALUES
      ('log-1', 'prop-1', 'Appartement 1', 'appartement', NULL, '4 avenue de la République',
       '69003', 'Lyon', 'LOT-1', 62, NULL, '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z');

    INSERT INTO baux
      (id, logement_id, date_entree, date_sortie, depot_garantie, jour_echeance, notes, cree_le, modifie_le)
    VALUES
      ('bail-1', 'log-1', '2026-01-01', NULL, 70000, 5, NULL,
       '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z');

    INSERT INTO titulaires
      (id, bail_id, ordre, nom, prenom, telephone, email, date_naissance, lieu_naissance)
    VALUES
      ('tit-1', 'bail-1', 1, 'RAJAONAH', 'Hery Ny Ony', NULL, NULL, NULL, NULL),
      ('tit-2', 'bail-1', 2, 'SONIZARA', 'Danie', NULL, NULL, NULL, NULL);

    INSERT INTO periodes_loyer (id, bail_id, debut, fin, loyer, charges, commentaire, cree_le)
    VALUES ('per-1', 'bail-1', '2026-01-01', NULL, 70000, 5000, NULL, '2026-01-01T10:00:00.000Z');

    INSERT INTO paiements (id, bail_id, periode, montant, date_paiement, mode, note, cree_le)
    VALUES ('pai-1', 'bail-1', '2026-01', 75000, '2026-01-05', 'virement', NULL,
            '2026-01-05T10:00:00.000Z');

    INSERT INTO documents
      (id, numero, type, logement_id, bail_id, periode, logement_nom, proprietaire_nom,
       proprietaire_adresse, logement_adresse, titulaires, loyer, charges, total,
       dates_paiement, date_emission, modele, chemin_fichier, signature_incluse, cree_le)
    VALUES
      ('doc-1', 'Q-2026-0001', 'quittance', 'log-1', 'bail-1', '2026-01', 'Appartement 1',
       'SCI LES TILLEULS', '12 rue des Tilleuls', '4 avenue de la République',
       '["Hery Ny Ony RAJAONAH","Danie SONIZARA"]', 70000, 5000, 75000,
       '["2026-01-05"]', '2026-01-31', 'colore', 'documents/Q-2026-0001.pdf', 0,
       '2026-01-31T10:00:00.000Z');

    INSERT INTO pieces
      (id, logement_id, bail_id, type, titre, date_document, chemin_fichier, donnees, cree_le, modifie_le)
    VALUES
      ('pie-1', 'log-1', 'bail-1', 'bail', 'Bail du 1er janvier 2026', '2026-01-01',
       'documents/bail-1.pdf', '{}', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z');

    INSERT INTO brouillons (logement_id, type, etape, donnees, maj_le)
    VALUES ('log-1', 'etat-des-lieux', 'pieces', '{}', '2026-01-02T10:00:00.000Z');

    INSERT INTO reglages (cle, valeur) VALUES ('modeleParDefaut', 'colore');
  `);
}

/** Les comptes attendus, table par table, après la migration. */
function comptes(db: DatabaseSync): Record<string, number> {
  return Object.fromEntries(TABLES.map((table) => [table, compter(db, table)]));
}

// ---------------------------------------------------------------------------
// Le contrôle
// ---------------------------------------------------------------------------

test(`Migration ${VERSION_CIVILITE} : une base ancienne remplie garde ses locataires`, () => {
  assert.ok(
    MIGRATION_CIVILITE !== undefined,
    'aucune migration ne touche à la civilité : ce banc ne mesure plus rien',
  );

  const dossier = mkdtempSync(join(tmpdir(), 'quittances-migration-'));
  const cheminAncien = join(dossier, 'ancienne.db');
  const cheminNeuf = join(dossier, 'neuve.db');

  const ancienne = baseAncienne(cheminAncien);
  const neuve = baseNeuve(cheminNeuf);

  try {
    // --- 1. La garde : la base de départ est bien dans l'état d'avant --------
    assert.equal(
      version(ancienne),
      VERSION_AVANT,
      'la base de départ n’est pas dans l’état d’avant : la migration ne serait pas exercée',
    );
    assert.ok(
      !colonnesDe(ancienne, 'titulaires').includes('civilite'),
      `la table « titulaires » porte déjà « civilite » avant la migration ${VERSION_CIVILITE} : `
        + 'ce banc migrerait une base à jour et resterait vert sans rien mesurer',
    );
    assert.equal(
      version(neuve),
      VERSION_SCHEMA,
      'la base neuve n’atteint pas la version du code : une migration manque',
    );

    // --- 2. On remplit AVANT de migrer --------------------------------------
    remplir(ancienne);
    const avant = comptes(ancienne);
    assert.ok(
      Object.values(avant).every((n) => n > 0),
      `une table est restée vide avant migration (${JSON.stringify(avant)}) : `
        + 'une migration destructrice ne s’y verrait pas',
    );

    // --- 3. On migre pour de vrai -------------------------------------------
    appliquer(ancienne, MIGRATIONS.filter((m) => m.version > VERSION_AVANT));

    // --- 4. La forme, comparée à une base neuve -----------------------------
    assert.equal(
      version(ancienne),
      VERSION_SCHEMA,
      'la base migrée n’atteint pas la version du code',
    );
    assert.deepEqual(
      structure(ancienne),
      structure(neuve),
      'la base migrée n’a pas la forme d’une base neuve : une colonne ou un index manque',
    );

    // Une table du schéma qui ne serait pas dans `TABLES` échapperait à la
    // remise à zéro ; on le dit ici plutôt que de le laisser passer.
    const noms = nomsDesTables(neuve);
    for (const table of TABLES) {
      assert.ok(noms.includes(table), `la table ${table} de TABLES n’existe pas dans le schéma`);
    }
    assert.equal(
      noms.length,
      TABLES.length,
      `le schéma porte ${noms.length} tables pour ${TABLES.length} dans TABLES : `
        + 'une table absente de TABLES survivrait à la remise à zéro',
    );

    // --- 5. Les données -----------------------------------------------------
    assert.deepEqual(
      comptes(ancienne),
      avant,
      'la migration a fait disparaître des lignes : elle n’est pas additive',
    );

    const titulaires = ancienne
      .prepare('SELECT id, nom, prenom, civilite FROM titulaires ORDER BY ordre;')
      .all() as { id: string; nom: string; prenom: string; civilite: string }[];

    assert.equal(titulaires.length, 2, 'les locataires enregistrés avant la migration ont disparu');
    assert.deepEqual(
      titulaires.map((t) => `${t.id}:${t.prenom} ${t.nom}`),
      ['tit-1:Hery Ny Ony RAJAONAH', 'tit-2:Danie SONIZARA'],
      'les locataires enregistrés avant la migration ne sont plus les mêmes',
    );
    for (const t of titulaires) {
      assert.equal(
        t.civilite,
        '',
        `${t.prenom} ${t.nom} a gagné une civilité que personne n’a saisie : `
          + 'ses documents déjà remis changeraient',
      );
    }

    // La colonne est bien interrogeable, et pas seulement présente : une
    // `DEFAULT ''` absente ferait échouer cette écriture.
    ancienne.exec("UPDATE titulaires SET civilite = 'Mme' WHERE id = 'tit-2';");
    const apres = ancienne
      .prepare("SELECT civilite FROM titulaires WHERE id = 'tit-2';")
      .get() as { civilite: string };
    assert.equal(apres.civilite, 'Mme', 'la colonne ajoutée n’accepte pas une civilité');
  } finally {
    ancienne.close();
    neuve.close();
    // Sous Windows, un fichier de base encore ouvert ne se supprime pas ; les
    // deux bases sont fermées avant, et l'effacement ne doit pas masquer un
    // échec du contrôle.
    try {
      rmSync(dossier, { recursive: true, force: true });
    } catch {
      /* le dossier temporaire sera repris par le système */
    }
  }
});
