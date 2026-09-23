/**
 * Restauration d'une sauvegarde.
 *
 * Règle de prudence : une restauration ne s'applique **jamais** en écrasant
 * silencieusement les données en place. L'écran prévient, l'utilisateur
 * confirme, et l'opération entière se déroule dans une seule transaction. Si
 * quoi que ce soit échoue, la base reste exactement dans l'état d'avant.
 *
 * On restaure aussi les réglages, signature comprise : sans elle, les documents
 * suivants ne ressembleraient plus aux précédents.
 */

import { transaction } from '@/db/database';
import { ecrireReglages, type Reglages } from '@/db/repositories/settings';
import type {
  Bail,
  Document,
  Logement,
  Paiement,
  PeriodeLoyer,
  Proprietaire,
  TitulaireBail,
} from '@/domain/types';

import { dechiffrer, ErreurSauvegarde, verifierEnveloppe, type EnveloppeSauvegarde } from './crypto';
import { VERSION_CONTENU, type ContenuSauvegarde } from './export';

/** Ce que la restauration a effectivement réinséré. */
export interface BilanRestauration {
  proprietaires: number;
  logements: number;
  baux: number;
  titulaires: number;
  periodesLoyer: number;
  paiements: number;
  documents: number;
  reglages: boolean;
}

/**
 * Déchiffre et valide une sauvegarde, sans rien écrire.
 *
 * Appelée avant toute modification : c'est ce qui permet d'annoncer
 * « voici ce que contient ce fichier » et de vérifier le mot de passe sans
 * risquer d'abîmer les données en place.
 */
export async function lireSauvegarde(
  enveloppe: EnveloppeSauvegarde,
  motDePasse: string,
): Promise<ContenuSauvegarde> {
  verifierEnveloppe(enveloppe);

  const contenu = await dechiffrer(enveloppe, motDePasse);

  let objet: ContenuSauvegarde;
  try {
    objet = JSON.parse(contenu) as ContenuSauvegarde;
  } catch {
    throw new ErreurSauvegarde(
      'Le contenu de cette sauvegarde est illisible. Elle est peut-être incomplète.',
    );
  }

  validerContenu(objet);
  return objet;
}

/**
 * Vérifie la forme du contenu avant de le restaurer.
 *
 * On refuse une sauvegarde dont une section manque plutôt que de restaurer à
 * moitié : une base partiellement remplie serait plus dangereuse que rien du
 * tout, parce que l'utilisateur la croirait complète.
 */
export function validerContenu(objet: ContenuSauvegarde): void {
  if (!objet || typeof objet !== 'object' || !objet.donnees) {
    throw new ErreurSauvegarde('Cette sauvegarde ne contient pas de données exploitables.');
  }

  if (!Number.isFinite(objet.version) || objet.version > VERSION_CONTENU) {
    throw new ErreurSauvegarde(
      'Cette sauvegarde a été créée par une version plus récente de l’application.',
    );
  }

  const sections = [
    'proprietaires',
    'logements',
    'baux',
    'titulaires',
    'periodesLoyer',
    'paiements',
    'documents',
  ] as const;

  for (const section of sections) {
    if (!Array.isArray(objet.donnees[section])) {
      throw new ErreurSauvegarde(
        'Cette sauvegarde est incomplète : une partie des données manque. Elle ne peut pas être restaurée.',
      );
    }
  }

  if (!objet.donnees.reglages || typeof objet.donnees.reglages !== 'object') {
    throw new ErreurSauvegarde(
      'Cette sauvegarde est incomplète : une partie des données manque. Elle ne peut pas être restaurée.',
    );
  }
}

/**
 * Écrit le contenu sauvegardé dans la base, en remplaçant l'existant.
 *
 * Tout se fait dans une seule transaction : soit la restauration aboutit
 * entièrement, soit rien ne change. L'ordre d'insertion suit les dépendances
 * entre tables, sans quoi les clés étrangères seraient violées.
 */
export async function appliquerSauvegarde(
  contenu: ContenuSauvegarde,
): Promise<BilanRestauration> {
  validerContenu(contenu);

  const d = contenu.donnees;

  await transaction(async (db) => {
    // On vide d'abord, dans l'ordre inverse des dépendances.
    await db.execAsync('DELETE FROM documents');
    await db.execAsync('DELETE FROM paiements');
    await db.execAsync('DELETE FROM periodes_loyer');
    await db.execAsync('DELETE FROM titulaires');
    await db.execAsync('DELETE FROM baux');
    await db.execAsync('DELETE FROM logements');
    await db.execAsync('DELETE FROM proprietaires');

    for (const p of d.proprietaires) {
      await db.runAsync(
        `INSERT INTO proprietaires
           (id, nom, qualite, adresse, code_postal, ville, telephone, email, notes, cree_le, modifie_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.nom,
          p.qualite ?? null,
          p.adresse,
          p.codePostal,
          p.ville,
          p.telephone ?? null,
          p.email ?? null,
          p.notes ?? null,
          p.creeLe,
          p.modifieLe,
        ],
      );
    }

    for (const l of d.logements) {
      await db.runAsync(
        `INSERT INTO logements
           (id, proprietaire_id, nom, adresse, code_postal, ville, type, reference, notes, cree_le, modifie_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          l.id,
          l.proprietaireId,
          l.nom,
          l.adresse,
          l.codePostal,
          l.ville,
          l.type,
          l.reference ?? null,
          l.notes ?? null,
          l.creeLe,
          l.modifieLe,
        ],
      );
    }

    for (const b of d.baux) {
      await db.runAsync(
        `INSERT INTO baux
           (id, logement_id, date_entree, date_sortie, depot_garantie, jour_echeance, notes, cree_le, modifie_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          b.id,
          b.logementId,
          b.dateEntree,
          b.dateSortie ?? null,
          b.depotGarantie ?? null,
          b.jourEcheance,
          b.notes ?? null,
          b.creeLe,
          b.modifieLe,
        ],
      );
    }

    for (const t of d.titulaires) {
      await db.runAsync(
        `INSERT INTO titulaires
           (id, bail_id, ordre, nom, prenom, telephone, email, date_naissance, lieu_naissance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          t.bailId,
          t.ordre,
          t.nom,
          t.prenom,
          t.telephone ?? null,
          t.email ?? null,
          t.dateNaissance ?? null,
          t.lieuNaissance ?? null,
        ],
      );
    }

    for (const pl of d.periodesLoyer) {
      await db.runAsync(
        `INSERT INTO periodes_loyer
           (id, bail_id, debut, fin, loyer, charges, cree_le)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pl.id, pl.bailId, pl.debut, pl.fin ?? null, pl.loyer, pl.charges, pl.creeLe],
      );
    }

    for (const p of d.paiements) {
      await db.runAsync(
        `INSERT INTO paiements
           (id, bail_id, periode, montant, date_paiement, mode, note, cree_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.bailId,
          p.periode,
          p.montant,
          p.datePaiement,
          p.mode,
          p.note ?? null,
          p.creeLe,
        ],
      );
    }

    for (const doc of d.documents) {
      await db.runAsync(
        `INSERT INTO documents
           (id, numero, type, logement_id, bail_id, periode, logement_nom, proprietaire_nom,
            proprietaire_adresse, logement_adresse, titulaires, loyer, charges, total,
            dates_paiement, date_emission, modele, chemin_fichier, signature_incluse, cree_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          doc.id,
          doc.numero,
          doc.type,
          doc.logementId,
          doc.bailId,
          doc.periode,
          doc.logementNom,
          doc.proprietaireNom,
          doc.proprietaireAdresse,
          doc.logementAdresse,
          JSON.stringify(doc.titulaires),
          doc.loyer,
          doc.charges,
          doc.total,
          JSON.stringify(doc.datesPaiement),
          doc.dateEmission,
          doc.modele,
          doc.cheminFichier,
          doc.signatureIncluse ? 1 : 0,
          doc.creeLe,
        ],
      );
    }
  });

  // Les réglages sont écrits après la transaction : ce sont des préférences,
  // pas des données financières. Les perdre ne casse pas la comptabilité, et les
  // écrire à part évite d'alourdir la transaction principale.
  await ecrireReglages(d.reglages as Reglages);

  return {
    proprietaires: d.proprietaires.length,
    logements: d.logements.length,
    baux: d.baux.length,
    titulaires: d.titulaires.length,
    periodesLoyer: d.periodesLoyer.length,
    paiements: d.paiements.length,
    documents: d.documents.length,
    reglages: true,
  };
}

/**
 * Compte les documents dont le PDF n'est plus présent sur l'appareil.
 *
 * Une sauvegarde contient la trace des documents, pas les fichiers PDF
 * eux-mêmes : ils peuvent être régénérés. On le signale à l'utilisateur plutôt
 * que de le laisser découvrir plus tard qu'un document ne s'ouvre pas.
 */
export function documentsSansFichier(documents: Document[]): Document[] {
  return documents.filter((d) => !d.cheminFichier);
}

/** Types réexportés pour l'écran de restauration. */
export type { Bail, Document, Logement, Paiement, PeriodeLoyer, Proprietaire, TitulaireBail };
