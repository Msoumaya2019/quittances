/**
 * Schéma de la base SQLite et migrations.
 *
 * Règles :
 *  - chaque migration est numérotée et **ne se réécrit jamais** une fois livrée ;
 *  - les identifiants sont des chaînes générées localement, pour pouvoir être
 *    réutilisées telles quelles par une future synchronisation ;
 *  - les dates civiles sont stockées en texte `AAAA-MM-JJ`, les mois en
 *    `AAAA-MM` ; ce format se trie et se compare correctement en SQL ;
 *  - les montants sont des **entiers de centimes**.
 */

/**
 * Version courante du schéma. À incrémenter en ajoutant une migration à
 * `MIGRATIONS`, jamais en modifiant une migration existante.
 */
export const VERSION_SCHEMA = 1;

export interface Migration {
  version: number;
  description: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Schéma initial : propriétaires, logements, baux, loyers, paiements, documents, réglages',
    statements: [
      // ---------------------------------------------------------------------
      // Propriétaires
      // ---------------------------------------------------------------------
      `CREATE TABLE IF NOT EXISTS proprietaires (
        id            TEXT PRIMARY KEY NOT NULL,
        nom           TEXT NOT NULL,
        qualite       TEXT,
        adresse       TEXT NOT NULL,
        code_postal   TEXT NOT NULL,
        ville         TEXT NOT NULL,
        telephone     TEXT,
        email         TEXT,
        siret         TEXT,
        notes         TEXT,
        cree_le       TEXT NOT NULL,
        modifie_le    TEXT NOT NULL
      );`,

      // ---------------------------------------------------------------------
      // Logements
      // ---------------------------------------------------------------------
      `CREATE TABLE IF NOT EXISTS logements (
        id              TEXT PRIMARY KEY NOT NULL,
        proprietaire_id TEXT NOT NULL REFERENCES proprietaires(id) ON DELETE RESTRICT,
        nom             TEXT NOT NULL,
        type            TEXT NOT NULL DEFAULT 'appartement',
        complement      TEXT,
        adresse         TEXT NOT NULL,
        code_postal     TEXT NOT NULL,
        ville           TEXT NOT NULL,
        reference       TEXT,
        surface         REAL,
        notes           TEXT,
        cree_le         TEXT NOT NULL,
        modifie_le      TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_logements_proprietaire ON logements(proprietaire_id);`,

      // ---------------------------------------------------------------------
      // Baux
      // ---------------------------------------------------------------------
      `CREATE TABLE IF NOT EXISTS baux (
        id              TEXT PRIMARY KEY NOT NULL,
        logement_id     TEXT NOT NULL REFERENCES logements(id) ON DELETE CASCADE,
        date_entree     TEXT NOT NULL,
        date_sortie     TEXT,
        depot_garantie  INTEGER,
        jour_echeance   INTEGER NOT NULL DEFAULT 5,
        notes           TEXT,
        cree_le         TEXT NOT NULL,
        modifie_le      TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_baux_logement ON baux(logement_id);`,

      // Un seul bail en cours par logement : la sortie nulle est exclusive.
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_baux_en_cours
         ON baux(logement_id) WHERE date_sortie IS NULL;`,

      // ---------------------------------------------------------------------
      // Titulaires du bail
      // ---------------------------------------------------------------------
      `CREATE TABLE IF NOT EXISTS titulaires (
        id              TEXT PRIMARY KEY NOT NULL,
        bail_id         TEXT NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
        ordre           INTEGER NOT NULL DEFAULT 1,
        nom             TEXT NOT NULL,
        prenom          TEXT NOT NULL,
        telephone       TEXT,
        email           TEXT,
        date_naissance  TEXT,
        lieu_naissance  TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_titulaires_bail ON titulaires(bail_id);`,

      // ---------------------------------------------------------------------
      // Périodes de loyer, avec date d'effet
      // ---------------------------------------------------------------------
      `CREATE TABLE IF NOT EXISTS periodes_loyer (
        id           TEXT PRIMARY KEY NOT NULL,
        bail_id      TEXT NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
        debut        TEXT NOT NULL,
        fin          TEXT,
        loyer        INTEGER NOT NULL,
        charges      INTEGER NOT NULL DEFAULT 0,
        commentaire  TEXT,
        cree_le      TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_periodes_loyer_bail ON periodes_loyer(bail_id, debut);`,

      // ---------------------------------------------------------------------
      // Paiements
      // ---------------------------------------------------------------------
      `CREATE TABLE IF NOT EXISTS paiements (
        id             TEXT PRIMARY KEY NOT NULL,
        bail_id        TEXT NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
        periode        TEXT NOT NULL,
        montant        INTEGER NOT NULL,
        date_paiement  TEXT NOT NULL,
        mode           TEXT NOT NULL DEFAULT 'virement',
        note           TEXT,
        cree_le        TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_paiements_bail_periode ON paiements(bail_id, periode);`,

      // ---------------------------------------------------------------------
      // Documents émis
      // ---------------------------------------------------------------------
      `CREATE TABLE IF NOT EXISTS documents (
        id                    TEXT PRIMARY KEY NOT NULL,
        numero                TEXT NOT NULL UNIQUE,
        type                  TEXT NOT NULL,
        logement_id           TEXT NOT NULL REFERENCES logements(id) ON DELETE CASCADE,
        bail_id               TEXT NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
        periode               TEXT NOT NULL,
        logement_nom          TEXT NOT NULL,
        proprietaire_nom      TEXT NOT NULL,
        proprietaire_adresse  TEXT NOT NULL,
        logement_adresse      TEXT NOT NULL,
        titulaires            TEXT NOT NULL,
        loyer                 INTEGER NOT NULL,
        charges               INTEGER NOT NULL,
        total                 INTEGER NOT NULL,
        dates_paiement        TEXT NOT NULL DEFAULT '[]',
        date_emission         TEXT NOT NULL,
        modele                TEXT NOT NULL DEFAULT 'classique',
        chemin_fichier        TEXT NOT NULL,
        signature_incluse     INTEGER NOT NULL DEFAULT 0,
        cree_le               TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_documents_bail_periode ON documents(bail_id, periode);`,
      `CREATE INDEX IF NOT EXISTS idx_documents_type_annee ON documents(type, date_emission);`,

      // ---------------------------------------------------------------------
      // Réglages
      // ---------------------------------------------------------------------
      `CREATE TABLE IF NOT EXISTS reglages (
        cle     TEXT PRIMARY KEY NOT NULL,
        valeur  TEXT NOT NULL
      );`,
    ],
  },
];

/** Ensemble des tables attendues, utilisé par les contrôles de cohérence. */
export const TABLES = [
  'proprietaires',
  'logements',
  'baux',
  'titulaires',
  'periodes_loyer',
  'paiements',
  'documents',
  'reglages',
] as const;

export type NomTable = (typeof TABLES)[number];
