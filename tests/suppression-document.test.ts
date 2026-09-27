/**
 * La suppression d'un document : ce qu'elle emporte, et ce qu'elle épargne.
 *
 * Le geste lui-même — retirer la ligne, puis le fichier — ne s'éprouve pas hors
 * d'un téléphone : il parle à SQLite et au système de fichiers. Ce qui reste
 * vérifiable ici, et qui est précisément ce qui casse en silence, tient en trois
 * points.
 *
 *  1. **Ce que l'application affirme avant d'effacer est vrai.** Supprimer une
 *     quittance ne supprime aucun paiement ; supprimer un bail ne supprime aucune
 *     location. Ces phrases sont ce que le bailleur lit au moment de décider, et
 *     une phrase fausse se paierait au moment où il croit avoir effacé une
 *     dette. Elles sont donc exigées, mot pour mot, par section.
 *
 *  2. **Le geste n'existe qu'une fois.** Trois écrans suppriment — l'onglet
 *     DOCUMENTS, le dossier d'un logement, l'aperçu d'une quittance. Un geste
 *     recopié trois fois finit par diverger, et la divergence serait ici un
 *     effacement dans le mauvais ordre : le fichier avant la ligne, donc un
 *     document listé que l'application ne sait plus ouvrir.
 *
 *  3. **Supprimer ne touche à aucun paiement.** C'est la promesse centrale du
 *     projet — jamais de quittance attestant un paiement intégral qui n'a pas
 *     été enregistré — vue de l'autre bout : la preuve peut disparaître, le
 *     règlement reste. Le module qui efface ne doit donc nommer aucun dépôt de
 *     paiement, et cela se lit dans son source.
 *
 * Où ce banc s'arrête : il lit des sources et des fonctions pures. Il ne prouve
 * pas qu'une suppression réussit sur un téléphone.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SECTIONS_DU_DOSSIER, elementDeDocument, elementDePiece } from '../src/domain/dossier.ts';
import type { CleSection, ElementDossier } from '../src/domain/dossier.ts';
import {
  SANS_RETOUR,
  messageDeSuppression,
  suppressionDe,
} from '../src/domain/suppression.ts';
import { LIBELLE_PIECE, type Document, type PieceDossier, type TypePiece } from '../src/domain/types.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const DEPOT = join(ICI, '..');
const lire = (chemin: string): string => readFileSync(join(DEPOT, chemin), 'utf8');

/** Les écrans qui suppriment un document, et le module partagé qu'ils emploient. */
const ECRANS_QUI_SUPPRIMENT = [
  'app/(tabs)/documents.tsx',
  'app/logement/[id]/dossier.tsx',
  'app/quittance/apercu.tsx',
];
const GESTE_PARTAGE = 'src/documents/suppression.ts';

/** Une quittance émise, telle que la base la rend. */
function quittance(champs: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    numero: 'QUI-2026-0007',
    type: 'quittance',
    logementId: 'log-1',
    bailId: 'bail-1',
    periode: '2026-09',
    logementNom: 'Appartement 1',
    proprietaireNom: 'SCI LES TILLEULS',
    proprietaireAdresse: '12 rue des Tilleuls, 69003 Lyon',
    logementAdresse: '4 avenue de la République, 69003 Lyon',
    titulaires: ['M. Hery Ny Ony RAJAONAH'],
    loyer: 70000,
    charges: 5000,
    total: 75000,
    datesPaiement: ['2026-09-05'],
    dateEmission: '2026-09-30',
    modele: 'colore',
    cheminFichier: 'documents/QUI-2026-0007.pdf',
    signatureIncluse: false,
    creeLe: '2026-09-30T10:00:00.000Z',
    ...champs,
  };
}

/** Une pièce du dossier, telle que la base la rend. */
function piece(type: TypePiece, champs: Partial<PieceDossier> = {}): PieceDossier {
  return {
    id: `pie-${type}`,
    logementId: 'log-1',
    bailId: 'bail-1',
    type,
    titre: LIBELLE_PIECE[type],
    dateDocument: '2026-01-01',
    cheminFichier: `documents/${type}.pdf`,
    donnees: '{}',
    creeLe: '2026-01-01T10:00:00.000Z',
    modifieLe: '2026-01-01T10:00:00.000Z',
    ...champs,
  };
}

/**
 * Le type de pièce qui remplit chaque section.
 *
 * Écrit à la main, et non par un transtypage : la section s'appelle `autres`
 * quand le type s'appelle `autre`, et un `cle as TypePiece` aurait produit un
 * type inexistant — le titre serait devenu `undefined`, et le banc aurait
 * échoué sur une erreur d'exécution au lieu de mesurer ce qu'il annonce.
 */
const TYPE_POUR_SECTION: Record<Exclude<CleSection, 'quittances'>, TypePiece> = {
  bail: 'bail',
  edl_entree: 'edl_entree',
  edl_sortie: 'edl_sortie',
  inventaire: 'inventaire',
  autres: 'autre',
};

/** Un élément par section du dossier. */
function unElementParSection(): Map<CleSection, ElementDossier> {
  const parSection = new Map<CleSection, ElementDossier>();

  for (const { cle } of SECTIONS_DU_DOSSIER) {
    if (cle === 'quittances') {
      parSection.set(cle, elementDeDocument(quittance()));
      continue;
    }
    parSection.set(cle, elementDePiece(piece(TYPE_POUR_SECTION[cle])));
  }

  return parSection;
}

// ---------------------------------------------------------------------------
// 1. Ce que l'application affirme avant d'effacer
// ---------------------------------------------------------------------------

test('Suppression : le texte d’une quittance nomme le paiement, jamais son effacement', () => {
  const element = elementDeDocument(quittance());
  const message = messageDeSuppression(element);

  assert.match(
    message,
    /paiements enregistrés[^.]*ne sont pas touchés/i,
    'le texte d’une quittance ne dit pas que les paiements restent : le bailleur '
      + 'peut croire qu’en supprimant la quittance il efface la dette',
  );
  assert.match(
    message,
    /à rattraper/i,
    'le texte ne dit pas que le mois redevient à rattraper : le bailleur ne peut '
      + 'pas savoir qu’une nouvelle quittance reste possible',
  );
  assert.match(
    message,
    /numéros déjà attribués restent consommés/i,
    'le texte ne dit pas que le numéro reste consommé : le bailleur ne peut pas '
      + 'comprendre un saut dans la numérotation',
  );
  assert.match(
    message,
    /QUI-2026-0007/,
    'le texte ne nomme pas le numéro du document supprimé : dans une liste où '
      + 'trois quittances se ressemblent, rien ne dit laquelle disparaît',
  );
});

test('Suppression : le texte d’un bail nomme la location, jamais son effacement', () => {
  const message = messageDeSuppression(elementDePiece(piece('bail')));

  assert.match(
    message,
    /location n’est pas touchée/i,
    'le texte d’un bail ne dit pas que la location reste : le bailleur peut '
      + 'croire qu’en supprimant le PDF il efface la location, ses locataires et '
      + 'ses quittances',
  );
  for (const mot of ['locataires', 'loyer', 'quittances']) {
    assert.ok(
      message.includes(mot),
      `le texte d’un bail ne nomme pas « ${mot} » : la phrase reste vague là où `
        + 'elle doit rassurer précisément',
    );
  }
});

test('Suppression : chaque section du dossier a son texte, et aucun n’est vide', () => {
  const parSection = unElementParSection();

  // La liste vient de `SECTIONS_DU_DOSSIER`, jamais d'une liste recopiée : une
  // section ajoutée demain sans texte fait tomber ce contrôle, au lieu de
  // produire une confirmation muette au moment d'effacer.
  for (const { cle, libelle } of SECTIONS_DU_DOSSIER) {
    const element = parSection.get(cle);
    assert.ok(element, `aucun élément d’essai pour la section ${cle}`);

    const { emporte, epargne } = suppressionDe(element);
    assert.ok(
      emporte.trim().length > 0,
      `la section « ${libelle} » n’a pas de texte : la confirmation serait muette`,
    );
    assert.ok(
      epargne.trim().length > 0,
      `la section « ${libelle} » n’a pas de texte d’épargne : toute suppression `
        + 'épargne quelque chose, et le taire ferait croire le contraire',
    );
  }
});

test('Suppression : le texte d’un état des lieux d’entrée annonce la comparaison perdue', () => {
  const message = messageDeSuppression(elementDePiece(piece('edl_entree')));

  assert.match(
    message,
    /ne pourra plus être comparé/i,
    'le texte ne dit pas qu’une sortie ne pourra plus être comparée à cette '
      + 'entrée : l’application promet ailleurs qu’une sortie retrouve son entrée '
      + 'toute seule, et cette promesse devient fausse sans que rien ne le dise',
  );
});

test('Suppression : tout message finit par la phrase sans retour', () => {
  for (const element of unElementParSection().values()) {
    const message = messageDeSuppression(element);
    assert.ok(
      message.endsWith(SANS_RETOUR),
      'un message ne rappelle pas que le geste est sans retour : le bailleur '
        + 'découvrirait l’irréversibilité après coup',
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Le geste n'existe qu'une fois
// ---------------------------------------------------------------------------

test('Suppression : le geste est partagé, et les écrans ne le réécrivent pas', () => {
  const geste = lire(GESTE_PARTAGE);

  // L'ordre est la règle : la ligne d'abord, le fichier ensuite. L'inverse
  // laisserait un document listé que l'application ne sait plus ouvrir.
  //
  // On cherche les **appels** — la parenthèse les distingue — et non les
  // identifiants. La première version cherchait `supprimerDocument` nu, et
  // trouvait la ligne d'`import`, qui précède toujours le corps : la mutation
  // qui inversait les deux opérations restait invisible, et le banc restait
  // vert sur un geste fautif. C'est le falsificateur qui l'a montré.
  const ligne = geste.indexOf('supprimerDocument(');
  const fichier = geste.indexOf('supprimerFichier(');
  assert.ok(ligne >= 0 && fichier >= 0, 'le geste partagé ne fait pas les deux opérations');
  assert.ok(
    ligne < fichier,
    'le geste efface le fichier avant la ligne : le document resterait listé mais '
      + 'illisible, et l’application prétendrait encore pouvoir l’ouvrir',
  );

  for (const ecran of ECRANS_QUI_SUPPRIMENT) {
    const source = lire(ecran);

    assert.match(
      source,
      /from '@\/documents\/suppression'/,
      `${ecran} n’emploie pas le geste partagé : la suppression y est réécrite, et `
        + 'deux copies d’un effacement finissent par diverger',
    );

    // L'écran ne doit pas appeler les dépôts directement : ce serait refaire le
    // geste, avec l'ordre et les oublis que cela suppose.
    for (const interdit of ['supprimerDocument(', 'supprimerPiece(']) {
      assert.ok(
        !source.includes(interdit),
        `${ecran} appelle ${interdit} directement au lieu du geste partagé`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Supprimer ne touche à aucun paiement
// ---------------------------------------------------------------------------

test('Suppression : le geste ne nomme aucun dépôt de paiement', () => {
  const geste = lire(GESTE_PARTAGE);

  assert.ok(
    !/repositories\/payments/.test(geste),
    'le geste partagé importe le dépôt des paiements : supprimer une quittance '
      + 'pourrait alors emporter le règlement qu’elle atteste, et le mois ne '
      + 'serait plus payé — la promesse centrale du projet serait rompue',
  );

  // Et il n'efface que les deux tables de documents. Une écriture sur une autre
  // table — `paiements`, `periodes_loyer`, `baux` — serait un effacement de
  // faits, pas de documents.
  const imports = [...geste.matchAll(/from '(@\/db\/repositories\/[a-z]+)'/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    imports.sort(),
    ['@/db/repositories/documents', '@/db/repositories/pieces'],
    'le geste partagé touche à d’autres dépôts que ceux des documents : une '
      + 'suppression doit retirer un document, jamais un fait qui l’a produit',
  );
});
