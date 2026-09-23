/**
 * Dépôt des logements, avec leurs baux, titulaires et périodes de loyer.
 *
 * Un logement n'est pas une coquille vide : il porte au moins un bail, un
 * titulaire et une période de loyer. La création complète se fait donc dans une
 * seule transaction, sinon on laisserait des logements inutilisables.
 */

import { executer, lireToutes, lireUne, transaction } from '../database';
import { maintenantISO, nouvelId } from '../ids';
import { planifierChangementLoyer } from '../../domain/rent';
import type { Bail, Logement, PeriodeLoyer, TitulaireBail, TypeLogement } from '../../domain/types';

// ---------------------------------------------------------------------------
// Traduction des lignes
// ---------------------------------------------------------------------------

interface LigneLogement {
  id: string;
  proprietaire_id: string;
  nom: string;
  type: string;
  complement: string | null;
  adresse: string;
  code_postal: string;
  ville: string;
  reference: string | null;
  surface: number | null;
  notes: string | null;
  cree_le: string;
  modifie_le: string;
}

interface LigneBail {
  id: string;
  logement_id: string;
  date_entree: string;
  date_sortie: string | null;
  depot_garantie: number | null;
  jour_echeance: number;
  notes: string | null;
  cree_le: string;
  modifie_le: string;
}

interface LigneTitulaire {
  id: string;
  bail_id: string;
  ordre: number;
  nom: string;
  prenom: string;
  telephone: string | null;
  email: string | null;
  date_naissance: string | null;
  lieu_naissance: string | null;
}

interface LignePeriodeLoyer {
  id: string;
  bail_id: string;
  debut: string;
  fin: string | null;
  loyer: number;
  charges: number;
  commentaire: string | null;
  cree_le: string;
}

function versLogement(l: LigneLogement): Logement {
  return {
    id: l.id,
    proprietaireId: l.proprietaire_id,
    nom: l.nom,
    type: l.type as TypeLogement,
    complement: l.complement,
    adresse: l.adresse,
    codePostal: l.code_postal,
    ville: l.ville,
    reference: l.reference,
    surface: l.surface,
    notes: l.notes,
    creeLe: l.cree_le,
    modifieLe: l.modifie_le,
  };
}

function versBail(l: LigneBail): Bail {
  return {
    id: l.id,
    logementId: l.logement_id,
    dateEntree: l.date_entree,
    dateSortie: l.date_sortie,
    depotGarantie: l.depot_garantie,
    jourEcheance: l.jour_echeance,
    notes: l.notes,
    creeLe: l.cree_le,
    modifieLe: l.modifie_le,
  };
}

function versTitulaire(l: LigneTitulaire): TitulaireBail {
  return {
    id: l.id,
    bailId: l.bail_id,
    ordre: l.ordre,
    nom: l.nom,
    prenom: l.prenom,
    telephone: l.telephone,
    email: l.email,
    dateNaissance: l.date_naissance,
    lieuNaissance: l.lieu_naissance,
  };
}

function versPeriodeLoyer(l: LignePeriodeLoyer): PeriodeLoyer {
  return {
    id: l.id,
    bailId: l.bail_id,
    debut: l.debut,
    fin: l.fin,
    loyer: l.loyer,
    charges: l.charges,
    commentaire: l.commentaire,
    creeLe: l.cree_le,
  };
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

export async function listerLogements(): Promise<Logement[]> {
  const lignes = await lireToutes<LigneLogement>(
    'SELECT * FROM logements ORDER BY nom COLLATE NOCASE ASC',
  );
  return lignes.map(versLogement);
}

export async function logementsDuProprietaire(proprietaireId: string): Promise<Logement[]> {
  const lignes = await lireToutes<LigneLogement>(
    'SELECT * FROM logements WHERE proprietaire_id = ? ORDER BY nom COLLATE NOCASE ASC',
    [proprietaireId],
  );
  return lignes.map(versLogement);
}

export async function trouverLogement(id: string): Promise<Logement | null> {
  const ligne = await lireUne<LigneLogement>('SELECT * FROM logements WHERE id = ?', [id]);
  return ligne ? versLogement(ligne) : null;
}

export async function compterLogements(): Promise<number> {
  const ligne = await lireUne<{ total: number }>('SELECT COUNT(*) AS total FROM logements');
  return ligne?.total ?? 0;
}

/** Le bail en cours d'un logement, s'il y en a un. */
export async function bailEnCours(logementId: string): Promise<Bail | null> {
  const ligne = await lireUne<LigneBail>(
    'SELECT * FROM baux WHERE logement_id = ? AND date_sortie IS NULL LIMIT 1',
    [logementId],
  );
  return ligne ? versBail(ligne) : null;
}

/** Tous les baux d'un logement, du plus récent au plus ancien. */
export async function bauxDuLogement(logementId: string): Promise<Bail[]> {
  const lignes = await lireToutes<LigneBail>(
    'SELECT * FROM baux WHERE logement_id = ? ORDER BY date_entree DESC',
    [logementId],
  );
  return lignes.map(versBail);
}

export async function trouverBail(id: string): Promise<Bail | null> {
  const ligne = await lireUne<LigneBail>('SELECT * FROM baux WHERE id = ?', [id]);
  return ligne ? versBail(ligne) : null;
}

export async function titulairesDuBail(bailId: string): Promise<TitulaireBail[]> {
  const lignes = await lireToutes<LigneTitulaire>(
    'SELECT * FROM titulaires WHERE bail_id = ? ORDER BY ordre ASC',
    [bailId],
  );
  return lignes.map(versTitulaire);
}

/**
 * Tous les titulaires, rangés par bail.
 * Évite une requête par logement quand on affiche une liste.
 */
export async function titulairesParBail(): Promise<Map<string, TitulaireBail[]>> {
  const lignes = await lireToutes<LigneTitulaire>(
    'SELECT * FROM titulaires ORDER BY bail_id ASC, ordre ASC',
  );

  const parBail = new Map<string, TitulaireBail[]>();
  for (const ligne of lignes) {
    const titulaire = versTitulaire(ligne);
    const existants = parBail.get(titulaire.bailId);
    if (existants) existants.push(titulaire);
    else parBail.set(titulaire.bailId, [titulaire]);
  }
  return parBail;
}

export async function periodesLoyerDuBail(bailId: string): Promise<PeriodeLoyer[]> {
  const lignes = await lireToutes<LignePeriodeLoyer>(
    'SELECT * FROM periodes_loyer WHERE bail_id = ? ORDER BY debut ASC',
    [bailId],
  );
  return lignes.map(versPeriodeLoyer);
}

/**
 * Ajoute une nouvelle période de loyer à partir d'un mois donné.
 *
 * C'est ici que se joue la garantie « un changement de loyer ne modifie jamais
 * les quittances déjà générées ». On n'écrase **jamais** un montant existant :
 * on clôt la période en cours le mois précédant le changement, puis on ouvre une
 * nouvelle période. L'historique reste donc complet et lisible, et les mois
 * passés continuent de rendre le montant qui était le leur.
 *
 * La clôture s'écrit `fin = mois précédent`. Si la période précédente
 * commençait le mois même du changement, elle serait vide : on la retire plutôt
 * que de laisser une période sans aucun mois.
 */
export async function ajouterPeriodeLoyer(
  bailId: string,
  saisie: { debut: string; loyer: number; charges: number; commentaire?: string | null },
): Promise<PeriodeLoyer> {
  if (!/^\d{4}-\d{2}$/.test(saisie.debut)) {
    throw new Error('Le mois de début doit être au format AAAA-MM.');
  }
  if (!Number.isInteger(saisie.loyer) || saisie.loyer < 0) {
    throw new Error('Le loyer doit être un montant positif.');
  }
  if (!Number.isInteger(saisie.charges) || saisie.charges < 0) {
    throw new Error('Les charges doivent être un montant positif.');
  }

  await transaction(async (db) => {
    const existantes = await db.getAllAsync<LignePeriodeLoyer>(
      'SELECT * FROM periodes_loyer WHERE bail_id = ? ORDER BY debut ASC',
      [bailId],
    );

    // La règle de clôture vit dans le domaine, pour être éprouvée sans base :
    // c'est elle qui garantit qu'aucun mois passé ne change de montant.
    const plan = planifierChangementLoyer(existantes.map(versPeriodeLoyer), saisie.debut);

    if (plan.conflitMemeMois) {
      throw new Error(
        'Un loyer est déjà défini pour ce mois. Modifiez-le depuis l’historique plutôt que d’en ajouter un second.',
      );
    }

    for (const instruction of plan.instructions) {
      if (instruction.action === 'supprimer') {
        await db.runAsync('DELETE FROM periodes_loyer WHERE id = ?', [instruction.id]);
      } else {
        await db.runAsync('UPDATE periodes_loyer SET fin = ? WHERE id = ?', [
          instruction.fin,
          instruction.id,
        ]);
      }
    }

    await db.runAsync(
      `INSERT INTO periodes_loyer
         (id, bail_id, debut, fin, loyer, charges, commentaire, cree_le)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
      [
        nouvelId(),
        bailId,
        saisie.debut,
        saisie.loyer,
        saisie.charges,
        saisie.commentaire ?? null,
        maintenantISO(),
      ],
    );
  });

  const periodes = await periodesLoyerDuBail(bailId);
  const creee = periodes.find((p) => p.debut === saisie.debut);
  if (!creee) throw new Error("Le nouveau loyer n'a pas pu être relu après création.");
  return creee;
}

// ---------------------------------------------------------------------------
// Création complète d'un logement
// ---------------------------------------------------------------------------

export interface SaisieTitulaire {
  nom: string;
  prenom: string;
  telephone?: string | null;
  email?: string | null;
}

export interface SaisieLogementComplet {
  proprietaire: {
    /** Propriétaire existant à réutiliser. */
    id?: string;
    /** Sinon, propriétaire à créer. */
    nouveau?: {
      nom: string;
      qualite?: string | null;
      adresse: string;
      codePostal: string;
      ville: string;
      telephone?: string | null;
      email?: string | null;
    };
  };
  logement: {
    nom: string;
    type: TypeLogement;
    complement?: string | null;
    adresse: string;
    codePostal: string;
    ville: string;
    reference?: string | null;
    surface?: number | null;
  };
  bail: {
    dateEntree: string;
    dateSortie?: string | null;
    jourEcheance: number;
    depotGarantie?: number | null;
  };
  titulaires: SaisieTitulaire[];
  loyer: {
    /** Premier mois d'application, clé `AAAA-MM`. */
    debut: string;
    loyer: number;
    charges: number;
  };
}

/**
 * Crée un logement avec son propriétaire, son bail, ses titulaires et son loyer.
 *
 * Tout est écrit dans une seule transaction : un logement sans loyer ni
 * locataire serait inutilisable et invisible dans l'interface.
 */
export async function creerLogementComplet(
  saisie: SaisieLogementComplet,
): Promise<Logement> {
  const maintenant = maintenantISO();

  return transaction(async (db) => {
    // --- Propriétaire : réutilisé, ou créé sur place --------------------
    let proprietaireId = saisie.proprietaire.id;

    if (!proprietaireId) {
      const nouveau = saisie.proprietaire.nouveau;
      if (!nouveau) {
        throw new Error(
          'Indiquez un propriétaire existant ou les informations du nouveau propriétaire.',
        );
      }
      proprietaireId = nouvelId();
      await db.runAsync(
        `INSERT INTO proprietaires
           (id, nom, qualite, adresse, code_postal, ville, telephone, email, siret, notes, cree_le, modifie_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        [
          proprietaireId,
          nouveau.nom.trim(),
          nouveau.qualite?.trim() || null,
          nouveau.adresse.trim(),
          nouveau.codePostal.trim(),
          nouveau.ville.trim(),
          nouveau.telephone?.trim() || null,
          nouveau.email?.trim() || null,
          maintenant,
          maintenant,
        ],
      );
    }

    // --- Logement ------------------------------------------------------
    const logementId = nouvelId();
    await db.runAsync(
      `INSERT INTO logements
         (id, proprietaire_id, nom, type, complement, adresse, code_postal, ville,
          reference, surface, notes, cree_le, modifie_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        logementId,
        proprietaireId,
        saisie.logement.nom.trim(),
        saisie.logement.type,
        saisie.logement.complement?.trim() || null,
        saisie.logement.adresse.trim(),
        saisie.logement.codePostal.trim(),
        saisie.logement.ville.trim(),
        saisie.logement.reference?.trim() || null,
        saisie.logement.surface ?? null,
        maintenant,
        maintenant,
      ],
    );

    // --- Bail ----------------------------------------------------------
    const bailId = nouvelId();
    await db.runAsync(
      `INSERT INTO baux
         (id, logement_id, date_entree, date_sortie, depot_garantie, jour_echeance, notes, cree_le, modifie_le)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        bailId,
        logementId,
        saisie.bail.dateEntree,
        saisie.bail.dateSortie || null,
        saisie.bail.depotGarantie ?? null,
        saisie.bail.jourEcheance,
        maintenant,
        maintenant,
      ],
    );

    // --- Titulaires ----------------------------------------------------
    for (const [index, titulaire] of saisie.titulaires.entries()) {
      await db.runAsync(
        `INSERT INTO titulaires
           (id, bail_id, ordre, nom, prenom, telephone, email, date_naissance, lieu_naissance)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          nouvelId(),
          bailId,
          index + 1,
          titulaire.nom.trim(),
          titulaire.prenom.trim(),
          titulaire.telephone?.trim() || null,
          titulaire.email?.trim() || null,
        ],
      );
    }

    // --- Loyer, avec sa date d'effet -----------------------------------
    await db.runAsync(
      `INSERT INTO periodes_loyer
         (id, bail_id, debut, fin, loyer, charges, commentaire, cree_le)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, ?)`,
      [nouvelId(), bailId, saisie.loyer.debut, saisie.loyer.loyer, saisie.loyer.charges, maintenant],
    );

    const cree = await db.getFirstAsync<LigneLogement>(
      'SELECT * FROM logements WHERE id = ?',
      [logementId],
    );
    if (!cree) throw new Error("Le logement n'a pas pu être relu après création.");
    return versLogement(cree);
  });
}

// ---------------------------------------------------------------------------
// Mise à jour
// ---------------------------------------------------------------------------

export async function modifierLogement(
  id: string,
  champs: Partial<Omit<Logement, 'id' | 'proprietaireId' | 'creeLe' | 'modifieLe'>>,
): Promise<void> {
  const existant = await trouverLogement(id);
  if (!existant) throw new Error('Logement introuvable.');

  const fusion = { ...existant, ...champs };

  await executer(
    `UPDATE logements
        SET nom = ?, type = ?, complement = ?, adresse = ?, code_postal = ?, ville = ?,
            reference = ?, surface = ?, notes = ?, modifie_le = ?
      WHERE id = ?`,
    [
      fusion.nom.trim(),
      fusion.type,
      fusion.complement?.trim() || null,
      fusion.adresse.trim(),
      fusion.codePostal.trim(),
      fusion.ville.trim(),
      fusion.reference?.trim() || null,
      fusion.surface ?? null,
      fusion.notes?.trim() || null,
      maintenantISO(),
      id,
    ],
  );
}

export async function modifierBail(
  id: string,
  champs: Partial<Pick<Bail, 'dateEntree' | 'dateSortie' | 'depotGarantie' | 'jourEcheance' | 'notes'>>,
): Promise<void> {
  const existant = await trouverBail(id);
  if (!existant) throw new Error('Bail introuvable.');

  const fusion = { ...existant, ...champs };

  await executer(
    `UPDATE baux
        SET date_entree = ?, date_sortie = ?, depot_garantie = ?, jour_echeance = ?,
            notes = ?, modifie_le = ?
      WHERE id = ?`,
    [
      fusion.dateEntree,
      fusion.dateSortie || null,
      fusion.depotGarantie ?? null,
      fusion.jourEcheance,
      fusion.notes?.trim() || null,
      maintenantISO(),
      id,
    ],
  );
}

export async function remplacerTitulaires(
  bailId: string,
  titulaires: SaisieTitulaire[],
): Promise<void> {
  await transaction(async (db) => {
    await db.runAsync('DELETE FROM titulaires WHERE bail_id = ?', [bailId]);
    for (const [index, titulaire] of titulaires.entries()) {
      await db.runAsync(
        `INSERT INTO titulaires
           (id, bail_id, ordre, nom, prenom, telephone, email, date_naissance, lieu_naissance)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          nouvelId(),
          bailId,
          index + 1,
          titulaire.nom.trim(),
          titulaire.prenom.trim(),
          titulaire.telephone?.trim() || null,
          titulaire.email?.trim() || null,
        ],
      );
    }
  });
}

/**
 * Supprime un logement et tout ce qui s'y rattache.
 *
 * Les documents PDF restent sur le disque : la suppression de la base ne doit
 * pas faire disparaître des quittances déjà remises au locataire. Le nombre de
 * documents retirés de l'application est rendu à l'appelant, mais aucun écran
 * ne s'en sert encore, et les fichiers ne sont pas nettoyés : ils deviennent
 * orphelins, sans référence en base.
 */
export async function supprimerLogement(id: string): Promise<{ documentsSupprimes: number }> {
  const ligne = await lireUne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM documents WHERE logement_id = ?',
    [id],
  );
  const documentsSupprimes = ligne?.total ?? 0;

  await transaction(async (db) => {
    await db.runAsync('DELETE FROM documents WHERE logement_id = ?', [id]);
    await db.runAsync('DELETE FROM paiements WHERE bail_id IN (SELECT id FROM baux WHERE logement_id = ?)', [id]);
    await db.runAsync('DELETE FROM periodes_loyer WHERE bail_id IN (SELECT id FROM baux WHERE logement_id = ?)', [id]);
    await db.runAsync('DELETE FROM titulaires WHERE bail_id IN (SELECT id FROM baux WHERE logement_id = ?)', [id]);
    await db.runAsync('DELETE FROM baux WHERE logement_id = ?', [id]);
    await db.runAsync('DELETE FROM logements WHERE id = ?', [id]);
  });

  return { documentsSupprimes };
}

/**
 * Clôture le bail en cours d'un logement, sans rien effacer.
 *
 * C'est l'opération du départ d'un locataire : l'historique des paiements et
 * des quittances reste attaché au bail clos, et le logement peut recevoir un
 * nouveau bail.
 */
export async function cloturerBail(bailId: string, dateSortie: string): Promise<void> {
  const bail = await trouverBail(bailId);
  if (!bail) throw new Error('Bail introuvable.');
  if (dateSortie < bail.dateEntree) {
    throw new Error("La date de sortie ne peut pas précéder la date d'entrée.");
  }
  await modifierBail(bailId, { dateSortie });
}

/**
 * Ouvre un nouveau bail sur un logement libre, avec son locataire et son loyer.
 */
export async function ouvrirNouveauBail(saisie: {
  logementId: string;
  dateEntree: string;
  jourEcheance: number;
  depotGarantie?: number | null;
  titulaires: SaisieTitulaire[];
  loyer: { debut: string; loyer: number; charges: number };
}): Promise<Bail> {
  const maintenant = maintenantISO();
  const bailId = nouvelId();

  await transaction(async (db) => {
    const enCours = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM baux WHERE logement_id = ? AND date_sortie IS NULL',
      [saisie.logementId],
    );
    if (enCours) {
      throw new Error(
        'Ce logement a déjà un locataire en place. Clôturez d’abord la location actuelle.',
      );
    }

    await db.runAsync(
      `INSERT INTO baux
         (id, logement_id, date_entree, date_sortie, depot_garantie, jour_echeance, notes, cree_le, modifie_le)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?)`,
      [
        bailId,
        saisie.logementId,
        saisie.dateEntree,
        saisie.depotGarantie ?? null,
        saisie.jourEcheance,
        maintenant,
        maintenant,
      ],
    );

    for (const [index, titulaire] of saisie.titulaires.entries()) {
      await db.runAsync(
        `INSERT INTO titulaires
           (id, bail_id, ordre, nom, prenom, telephone, email, date_naissance, lieu_naissance)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          nouvelId(),
          bailId,
          index + 1,
          titulaire.nom.trim(),
          titulaire.prenom.trim(),
          titulaire.telephone?.trim() || null,
          titulaire.email?.trim() || null,
        ],
      );
    }

    await db.runAsync(
      `INSERT INTO periodes_loyer
         (id, bail_id, debut, fin, loyer, charges, commentaire, cree_le)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, ?)`,
      [nouvelId(), bailId, saisie.loyer.debut, saisie.loyer.loyer, saisie.loyer.charges, maintenant],
    );
  });

  const cree = await trouverBail(bailId);
  if (!cree) throw new Error("Le bail n'a pas pu être relu après création.");
  return cree;
}
