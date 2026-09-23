/**
 * Ouverture de la base SQLite, application des migrations, aide aux requêtes.
 *
 * Le module expose une base unique, ouverte paresseusement au premier accès.
 * Les écrans n'ouvrent jamais la base eux-mêmes : ils passent par les dépôts.
 */

import * as SQLite from 'expo-sqlite';
import { MIGRATIONS, VERSION_SCHEMA } from './schema';

const NOM_BASE = 'quittances.db';

let instance: SQLite.SQLiteDatabase | null = null;
let ouvertureEnCours: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Ouvre la base et applique les migrations manquantes.
 * Les appels concurrents partagent la même ouverture : deux écrans qui montent
 * en même temps ne peuvent pas créer deux connexions.
 */
export function ouvrirBase(): Promise<SQLite.SQLiteDatabase> {
  if (instance) return Promise.resolve(instance);
  if (ouvertureEnCours) return ouvertureEnCours;

  ouvertureEnCours = (async () => {
    const db = await SQLite.openDatabaseAsync(NOM_BASE);

    // Les clés étrangères ne sont pas actives par défaut dans SQLite.
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');

    await appliquerMigrations(db);

    instance = db;
    ouvertureEnCours = null;
    return db;
  })();

  return ouvertureEnCours;
}

/** Version du schéma actuellement stockée dans la base (0 si neuve). */
export async function versionActuelle(db: SQLite.SQLiteDatabase): Promise<number> {
  const resultat = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  return resultat?.user_version ?? 0;
}

/**
 * Applique, dans l'ordre, les migrations dont la version dépasse celle de la
 * base. Chaque migration est atomique : en cas d'échec, la transaction est
 * annulée et la version n'est pas avancée.
 */
export async function appliquerMigrations(db: SQLite.SQLiteDatabase): Promise<number> {
  const depart = await versionActuelle(db);
  let courante = depart;

  const aAppliquer = MIGRATIONS.filter((m) => m.version > depart).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of aAppliquer) {
    if (migration.version !== courante + 1) {
      throw new Error(
        `Migration ${migration.version} attendue après ${courante} : ` +
          'la chaîne de migrations est incomplète.',
      );
    }

    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
    });

    // `PRAGMA user_version` n'accepte pas de paramètre lié : le numéro vient
    // d'une constante du code, jamais d'une saisie.
    await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    courante = migration.version;
  }

  if (courante !== VERSION_SCHEMA) {
    throw new Error(
      `Base en version ${courante}, code en version ${VERSION_SCHEMA} : ` +
        'une migration manque.',
    );
  }

  return courante;
}

/** Ferme la base. Utilisé par la restauration d'une sauvegarde. */
export async function fermerBase(): Promise<void> {
  if (instance) {
    await instance.closeAsync();
    instance = null;
  }
  ouvertureEnCours = null;
}

// ---------------------------------------------------------------------------
// Aides typées
// ---------------------------------------------------------------------------

/** Exécute une requête d'écriture. */
export async function executer(
  sql: string,
  parametres: SQLite.SQLiteBindValue[] = [],
): Promise<SQLite.SQLiteRunResult> {
  const db = await ouvrirBase();
  return db.runAsync(sql, parametres);
}

/** Lit une ligne, ou `null`. */
export async function lireUne<T>(
  sql: string,
  parametres: SQLite.SQLiteBindValue[] = [],
): Promise<T | null> {
  const db = await ouvrirBase();
  return db.getFirstAsync<T>(sql, parametres);
}

/** Lit plusieurs lignes. */
export async function lireToutes<T>(
  sql: string,
  parametres: SQLite.SQLiteBindValue[] = [],
): Promise<T[]> {
  const db = await ouvrirBase();
  return db.getAllAsync<T>(sql, parametres);
}

/**
 * Exécute plusieurs écritures dans une transaction.
 * Indispensable pour créer un logement complet (logement + bail + titulaires +
 * loyer) : soit tout est écrit, soit rien.
 */
export async function transaction<T>(
  travail: (db: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const db = await ouvrirBase();
  let resultat: T | undefined;

  await db.withTransactionAsync(async () => {
    resultat = await travail(db);
  });

  return resultat as T;
}

/** Chemin du fichier de base, pour la sauvegarde. */
export async function cheminFichierBase(): Promise<string> {
  return `${SQLite.defaultDatabaseDirectory}${NOM_BASE}`;
}

export { NOM_BASE };
