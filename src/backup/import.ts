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
 *
 * Les **fichiers** sont réécrits après la transaction, et l'ordre est une
 * décision : les écrire avant poserait les fichiers de la sauvegarde dans le
 * dossier de l'installation actuelle, si bien qu'un échec de la transaction
 * laisserait les données d'aujourd'hui avec les fichiers d'hier. Dans cet
 * ordre-ci, un échec laisse des lignes sans fichier — ce que
 * `documentsSansFichier` et `piecesSansFichier` savent nommer, et que l'écran
 * de restauration affiche.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { transaction } from '@/db/database';
import { ecrireReglages, type Reglages } from '@/db/repositories/settings';
import type {
  Bail,
  Document,
  Logement,
  Paiement,
  PeriodeLoyer,
  PieceDossier,
  Proprietaire,
  TitulaireBail,
} from '@/domain/types';
import { documentExiste } from '@/pdf/partage';

import { dechiffrer, ErreurSauvegarde, verifierEnveloppe, type EnveloppeSauvegarde } from './crypto';
import { VERSION_CONTENU, type ContenuSauvegarde, type FichierSauvegarde } from './export';

/** Ce que la restauration a effectivement réinséré. */
export interface BilanRestauration {
  proprietaires: number;
  logements: number;
  baux: number;
  titulaires: number;
  periodesLoyer: number;
  paiements: number;
  documents: number;
  pieces: number;
  /** Nombre de fichiers réécrits dans le dossier documentaire. */
  fichiers: number;
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

  // Les pièces ne sont exigées que si la sauvegarde en annonce : une sauvegarde
  // écrite avant l'apparition du dossier documentaire n'en a pas, et la refuser
  // priverait l'utilisateur de ses propres sauvegardes. Le contrôle porte donc
  // sur la **forme quand le champ est là**, jamais sur sa présence.
  if (objet.donnees.pieces !== undefined && !Array.isArray(objet.donnees.pieces)) {
    throw new ErreurSauvegarde(
      'Cette sauvegarde est incomplète : une partie des données manque. Elle ne peut pas être restaurée.',
    );
  }

  // Même règle pour les fichiers : une sauvegarde de version 1 n'en porte pas.
  // Quand le champ est là, il doit être lisible — un tableau d'entrées sans
  // chemin ni contenu ferait écrire des fichiers vides, et l'utilisateur
  // croirait ses photos restaurées.
  if (objet.donnees.fichiers !== undefined) {
    if (!Array.isArray(objet.donnees.fichiers)) {
      throw new ErreurSauvegarde(
        'Cette sauvegarde est incomplète : une partie des données manque. Elle ne peut pas être restaurée.',
      );
    }
    for (const fichier of objet.donnees.fichiers) {
      if (!fichier || typeof fichier.chemin !== 'string' || typeof fichier.donnees !== 'string') {
        throw new ErreurSauvegarde(
          'Cette sauvegarde annonce des fichiers dont le contenu est illisible. ' +
            'Elle ne peut pas être restaurée.',
        );
      }
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
    // On vide d'abord, dans l'ordre inverse des dépendances. `pieces` référence
    // `baux` et `logements` : la vider après eux violerait la clé étrangère et
    // ferait échouer toute la restauration.
    await db.execAsync('DELETE FROM documents');
    await db.execAsync('DELETE FROM pieces');
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

    for (const piece of d.pieces ?? []) {
      await db.runAsync(
        `INSERT INTO pieces
           (id, logement_id, bail_id, type, titre, date_document, chemin_fichier, donnees,
            cree_le, modifie_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          piece.id,
          piece.logementId,
          piece.bailId ?? null,
          piece.type,
          piece.titre,
          piece.dateDocument,
          piece.cheminFichier,
          piece.donnees,
          piece.creeLe,
          piece.modifieLe,
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

  // Les fichiers viennent en dernier, et l'ordre est une décision. Les écrire
  // avant la transaction les poserait dans le dossier de l'installation
  // **actuelle** : si la transaction échouait ensuite, l'utilisateur garderait
  // ses données d'aujourd'hui avec les fichiers d'hier, et rien ne le dirait.
  // Dans cet ordre-ci, un échec laisse des lignes sans fichier — ce que
  // `documentsSansFichier` sait nommer, et que l'écran de restauration affiche.
  const fichiers = await restaurerFichiers(d.fichiers ?? []);

  return {
    proprietaires: d.proprietaires.length,
    logements: d.logements.length,
    baux: d.baux.length,
    titulaires: d.titulaires.length,
    periodesLoyer: d.periodesLoyer.length,
    paiements: d.paiements.length,
    documents: d.documents.length,
    pieces: (d.pieces ?? []).length,
    fichiers,
    reglages: true,
  };
}

/**
 * Réécrit les fichiers de la sauvegarde dans le dossier de l'application.
 *
 * Le chemin enregistré est **relatif** au dossier de l'application, et il est
 * reconstruit ici : c'est ce qui permet à une sauvegarde faite sur un téléphone
 * d'être restaurée sur un autre, où le dossier absolu est différent. Un chemin
 * absolu restauré tel quel désignerait un dossier qui n'existe pas, et toutes
 * les photos seraient perdues sans que rien ne le dise.
 *
 * Rend le nombre de fichiers réellement écrits. Un fichier qui échoue
 * n'interrompt pas la restauration : les autres sont écrits, et le décompte
 * annoncé est celui des succès — jamais celui des intentions.
 */
export async function restaurerFichiers(fichiers: FichierSauvegarde[]): Promise<number> {
  const racine = FileSystem.documentDirectory;
  if (!racine) return 0;

  let ecrits = 0;
  for (const fichier of fichiers) {
    const chemin = `${racine}${fichier.chemin}`;
    const dossier = chemin.slice(0, chemin.lastIndexOf('/') + 1);
    try {
      const info = await FileSystem.getInfoAsync(dossier);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
      }
      await FileSystem.writeAsStringAsync(chemin, fichier.donnees, {
        encoding: FileSystem.EncodingType.Base64,
      });
      ecrits += 1;
    } catch {
      // On continue : un fichier refusé ne doit pas priver l'utilisateur des
      // autres. Son absence sera nommée par `documentsSansFichier`.
    }
  }
  return ecrits;
}

/**
 * Les documents dont le PDF n'est pas présent sur l'appareil.
 *
 * Depuis la version 2 du contenu, une sauvegarde **contient les fichiers
 * eux-mêmes** : elle les réécrit, et un document restauré retrouve son PDF. Ce
 * contrôle reste nécessaire, et pour deux raisons qui n'ont pas disparu :
 *
 *  - une sauvegarde **de version 1** ne portait que la trace des documents. Elle
 *    se restaure — la refuser priverait l'utilisateur de ses propres
 *    sauvegardes — et ses PDF, eux, ne reviendront pas ;
 *  - un fichier déjà absent de l'appareil au moment de la sauvegarde n'a pas pu
 *    être joint, et le restaurer ne le fera pas réapparaître.
 *
 * Le contrôle porte donc sur le **fichier**, et non sur la présence d'un
 * chemin : un chemin restauré n'est pas un fichier. Tester `!cheminFichier` ne
 * verrait rien, puisque la restauration récrit justement un chemin.
 *
 * L'application ne régénère jamais un document émis : un PDF manquant le reste.
 * D'où l'intérêt de le dire tout de suite à l'utilisateur.
 */
export async function documentsSansFichier(documents: Document[]): Promise<Document[]> {
  const verdicts = await Promise.all(
    documents.map(async (document) =>
      (await documentExiste(document.cheminFichier)) ? null : document,
    ),
  );
  return verdicts.filter((document): document is Document => document !== null);
}

/**
 * Les pièces du dossier dont le fichier n'est pas présent sur l'appareil.
 *
 * Le même contrôle que pour les quittances, et il manquait : un bail signé, un
 * état des lieux ou un inventaire porte lui aussi un `cheminFichier`, et un
 * écran qui n'aurait compté que les quittances aurait annoncé une restauration
 * complète en laissant des constats sans PDF.
 */
export async function piecesSansFichier(pieces: PieceDossier[]): Promise<PieceDossier[]> {
  const verdicts = await Promise.all(
    pieces.map(async (piece) =>
      (await documentExiste(piece.cheminFichier)) ? null : piece,
    ),
  );
  return verdicts.filter((piece): piece is PieceDossier => piece !== null);
}

/** Types réexportés pour l'écran de restauration. */
export type {
  Bail,
  Document,
  Logement,
  Paiement,
  PeriodeLoyer,
  PieceDossier,
  Proprietaire,
  TitulaireBail,
};
