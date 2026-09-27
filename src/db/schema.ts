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
 *
 * 5 : les souches des documents supprimés (`numeros_consommes`).
 */
export const VERSION_SCHEMA = 5;

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

  // -------------------------------------------------------------------------
  // Migration 2 — le dossier documentaire
  // -------------------------------------------------------------------------
  {
    version: 2,
    description:
      'Dossier documentaire : baux, états des lieux, inventaires et autres pièces, rattachés au logement et au bail',
    statements: [
      /**
       * Une pièce du dossier, hors quittance.
       *
       * Elle est **rattachée au logement** (`ON DELETE CASCADE` : supprimer un
       * logement efface ses pièces, comme pour `documents`) et **au bail** quand
       * elle concerne une location. Le lien au bail est facultatif et non
       * destructeur : clôturer une location ne doit pas faire disparaître son
       * état des lieux. `SET NULL` plutôt que `CASCADE` parce que le bail n'est
       * jamais supprimé dans cette application — il est clôturé par une date de
       * sortie — mais qu'une suppression manuelle ne doit pas emporter des
       * documents signés.
       *
       * `donnees` porte le contenu structuré (pièces d'un état des lieux,
       * relevés de compteurs, signatures) en JSON. Il est séparé du PDF parce
       * que comparer une sortie à une entrée demande de lire des valeurs, pas
       * un document.
       */
      `CREATE TABLE IF NOT EXISTS pieces (
        id              TEXT PRIMARY KEY NOT NULL,
        logement_id     TEXT NOT NULL REFERENCES logements(id) ON DELETE CASCADE,
        bail_id         TEXT REFERENCES baux(id) ON DELETE SET NULL,
        type            TEXT NOT NULL,
        titre           TEXT NOT NULL,
        date_document   TEXT NOT NULL,
        chemin_fichier  TEXT NOT NULL DEFAULT '',
        donnees         TEXT NOT NULL DEFAULT '{}',
        cree_le         TEXT NOT NULL,
        modifie_le      TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_pieces_logement ON pieces(logement_id, date_document);`,
      `CREATE INDEX IF NOT EXISTS idx_pieces_bail ON pieces(bail_id);`,
      `CREATE INDEX IF NOT EXISTS idx_pieces_type ON pieces(type, date_document);`,
    ],
  },

  // -------------------------------------------------------------------------
  // Migration 3 — les brouillons
  // -------------------------------------------------------------------------
  {
    version: 3,
    description: 'Brouillons en cours : un formulaire guidé interrompu se reprend où il en était',
    statements: [
      /**
       * Un formulaire commencé et non terminé.
       *
       * Un bail se remplit en neuf étapes, un état des lieux en six, avec des
       * photos. Perdre cette saisie parce qu'on a reçu un appel, ou parce
       * qu'Android a déchargé l'application, est le genre de défaut qui fait
       * renoncer à se servir de l'outil. Le brouillon est donc enregistré à
       * chaque étape franchie.
       *
       * Ce n'est **pas** une pièce : une pièce est un document établi, et une
       * ligne de `pieces` sans fichier ferait apparaître dans le dossier un
       * document qui n'existe pas. Deux choses différentes, deux tables — le
       * même raisonnement que pour `documents` et `pieces`.
       *
       * `logement_id` est `ON DELETE CASCADE` : un brouillon qui parle d'un
       * logement supprimé n'a plus d'objet. La clé primaire est le couple
       * (logement, type) : il n'y a jamais deux brouillons de bail pour le même
       * logement, le second remplaçant le premier.
       */
      `CREATE TABLE IF NOT EXISTS brouillons (
        logement_id  TEXT NOT NULL REFERENCES logements(id) ON DELETE CASCADE,
        type         TEXT NOT NULL,
        etape        TEXT NOT NULL,
        donnees      TEXT NOT NULL DEFAULT '{}',
        maj_le       TEXT NOT NULL,
        PRIMARY KEY (logement_id, type)
      );`,
    ],
  },

  // -------------------------------------------------------------------------
  // Migration 4 — la civilité des locataires
  // -------------------------------------------------------------------------
  {
    version: 4,
    description: 'Civilité des locataires : « M. », « Mme » ou « Mlle », devant le nom sur les documents',
    statements: [
      /**
       * La civilité d'un titulaire.
       *
       * Elle est **stockée** et non déduite : `nomPourDocument` refusait
       * auparavant de l'inventer, et le document n'imprimait donc que
       * « Prénom NOM ». Le bailleur peut désormais la choisir, et elle se place
       * devant le nom — « M. Hery Ny Ony RAJAONAH ».
       *
       * `NOT NULL DEFAULT ''` plutôt qu'une colonne nullable : une colonne nulle
       * finit par être lue comme une valeur, et « pas de civilité » est ici une
       * information légitime, pas une absence. Les locataires enregistrés avant
       * cette migration reçoivent donc `''`, et leurs documents restent
       * exactement ceux d'avant — c'est la promesse d'une migration additive.
       *
       * `ALTER TABLE ADD COLUMN` est **additif** : aucune ligne n'est réécrite,
       * aucune donnée ne peut être perdue. La contrainte `NOT NULL` est acceptée
       * parce qu'une valeur par défaut est fournie.
       */
      `ALTER TABLE titulaires ADD COLUMN civilite TEXT NOT NULL DEFAULT '';`,
    ],
  },

  // -------------------------------------------------------------------------
  // Migration 5 — les souches
  // -------------------------------------------------------------------------
  {
    version: 5,
    description:
      'Souches des documents supprimés : un numéro attribué n’est jamais réattribué',
    statements: [
      /**
       * La souche d'un document : son numéro, et rien d'autre.
       *
       * Supprimer une quittance retire sa ligne de `documents`. Or le rang
       * suivant se calcule sur le rang maximal **des lignes présentes** : la
       * suppression de la dernière quittance de l'année fait donc retomber le
       * maximum, et la quittance suivante reprend le numéro de celle qu'on vient
       * de retirer. Une quittance a pu être remise au locataire avant d'être
       * supprimée de l'application — deux quittances différentes porteraient
       * alors le même numéro, et rien ne le signalerait.
       *
       * Cette table est la **souche** du carnet : elle garde les numéros partis,
       * pour qu'ils ne reviennent pas.
       *
       * Elle ne peut pas vivre dans `documents`, et c'est structurel :
       * `documents.logement_id` est `ON DELETE CASCADE`. Supprimer un logement
       * effacerait ses souches, et les numéros de ses quittances redeviendraient
       * libres — exactement le défaut qu'on veut rendre impossible. Aucune clé
       * étrangère ici, donc : une souche ne dépend de rien.
       *
       * `numero` est la clé primaire : consommer deux fois le même numéro est
       * refusé par la base, et non par une précaution d'appelant.
       *
       * Le **rang n'est pas une colonne**. Il se relit du numéro
       * (`rangDeNumero`, `src/domain/numbering.ts`). Stocker les deux, c'est
       * accepter qu'ils divergent un jour, et une souche dont le numéro dit 7
       * quand la colonne dit 5 rendrait la numérotation imprévisible. `type` et
       * `annee` restent, eux : ils ne sont qu'un index de lecture, et le calcul
       * ne s'y fie pas.
       */
      `CREATE TABLE IF NOT EXISTS numeros_consommes (
        numero       TEXT PRIMARY KEY NOT NULL,
        type         TEXT NOT NULL,
        annee        INTEGER NOT NULL,
        consomme_le  TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_numeros_consommes_type_annee
         ON numeros_consommes(type, annee);`,
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
  'pieces',
  'brouillons',
  'numeros_consommes',
  'reglages',
] as const;

export type NomTable = (typeof TABLES)[number];

/**
 * Les tables à vider pour remettre l'application à zéro, **dans l'ordre**.
 *
 * L'ordre est une contrainte, pas une commodité : `PRAGMA foreign_keys = ON` est
 * actif (`database.ts`), et `logements.proprietaire_id` est déclaré
 * `ON DELETE RESTRICT`. Supprimer un propriétaire avant ses logements fait donc
 * échouer la transaction, et l'application resterait à moitié effacée — le pire
 * des états, puisque l'utilisateur croirait avoir tout supprimé.
 *
 * Les dépendances lues dans `MIGRATIONS` :
 *
 *   documents      -> logements, baux
 *   pieces         -> logements, baux
 *   paiements      -> baux
 *   periodes_loyer -> baux
 *   titulaires     -> baux
 *   brouillons     -> logements
 *   baux           -> logements
 *   logements      -> proprietaires   (RESTRICT)
 *   reglages       -> aucune
 *   numeros_consommes -> aucune
 *
 * Une table enfant se vide donc **avant** sa table parente. `tests/reinitialisation.test.ts`
 * ne recopie pas cet ordre : il relit les `REFERENCES` de `MIGRATIONS` et exige
 * que la liste soit un ordre topologique de ce graphe. Une table ajoutée demain
 * sans être mise ici, ou mise au mauvais rang, fait donc tomber le contrôle.
 *
 * `numeros_consommes` est vidée comme les autres : une remise à zéro rend
 * l'application à l'état d'installation, donc le carnet neuf repart à `0001`.
 * C'est le choix explicite du bailleur, pas un oubli — il n'y a plus aucune
 * quittance dont un numéro doive rester pris.
 */
export const TABLES_A_VIDER: readonly NomTable[] = [
  'documents',
  'pieces',
  'paiements',
  'periodes_loyer',
  'titulaires',
  'brouillons',
  'baux',
  'logements',
  'proprietaires',
  'numeros_consommes',
  'reglages',
];
