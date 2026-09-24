/**
 * Le dossier documentaire d'un logement.
 *
 * Ce qui est éprouvé ici n'est pas une mise en page : c'est **ce qui reste
 * attaché à qui**. Trois erreurs, dans ce domaine, ne se voient pas à l'écran et
 * ne se réparent pas après coup :
 *
 *  1. **un document rattaché au mauvais locataire.** Si l'état des lieux de
 *     sortie d'un locataire part chez le suivant, la comparaison entrée/sortie
 *     opposera deux personnes différentes ;
 *  2. **un document qui disparaît.** Une pièce dont le bail n'existe plus — ce
 *     qu'une restauration de sauvegarde peut produire — doit rester visible
 *     quelque part, pas être silencieusement écartée ;
 *  3. **une date impossible acceptée.** `2026-02-31` a la bonne forme et
 *     n'existe pas ; une pièce datée d'un jour qui n'a jamais eu lieu passerait
 *     tous les contrôles de forme.
 *
 * Le module est pur : il ne lit ni la base ni le disque, donc tout se vérifie
 * avec `node --test`, sans émulateur.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  categorieDePiece,
  compterParCategorie,
  construireDossier,
  elementDeDocument,
  elementDePiece,
  elementsParCategorie,
  etatDesLieuxEntreeApparie,
  manquesDuBrouillon,
  sectionDePiece,
  sectionsDepuis,
  SECTIONS_DU_DOSSIER,
  type ElementDossier,
} from '../src/domain/dossier.ts';
import { CATEGORIES_DOCUMENT } from '../src/domain/types.ts';
import type { Bail, Document, PieceDossier, TitulaireBail, TypePiece } from '../src/domain/types.ts';

// ---------------------------------------------------------------------------
// Fabriques
// ---------------------------------------------------------------------------

function bail(id: string, entree: string, sortie: string | null = null): Bail {
  return {
    id,
    logementId: 'log-1',
    dateEntree: entree,
    dateSortie: sortie,
    jourEcheance: 5,
    creeLe: `${entree}T00:00:00.000Z`,
    modifieLe: `${entree}T00:00:00.000Z`,
  };
}

function titulaire(id: string, bailId: string, prenom: string, nom: string, ordre = 1): TitulaireBail {
  return { id, bailId, ordre, nom, prenom };
}

function piece(
  id: string,
  type: TypePiece,
  bailId: string | null,
  date: string,
  titre = '',
): PieceDossier {
  return {
    id,
    logementId: 'log-1',
    bailId,
    type,
    titre: titre || `Pièce ${id}`,
    dateDocument: date,
    cheminFichier: `documents/${id}.pdf`,
    donnees: '{}',
    creeLe: `${date}T00:00:00.000Z`,
    modifieLe: `${date}T00:00:00.000Z`,
  };
}

function document(id: string, bailId: string, periode: string, emission: string): Document {
  return {
    id,
    numero: `QUI-${periode.slice(0, 4)}-0001`,
    type: 'quittance',
    logementId: 'log-1',
    bailId,
    periode,
    logementNom: 'Appartement 1',
    proprietaireNom: 'SCI Exemple',
    proprietaireAdresse: '1 rue du Bailleur, 75001 Paris',
    logementAdresse: '2 rue du Locataire, 75002 Paris',
    titulaires: ['Jean DUPONT'],
    loyer: 80000,
    charges: 5000,
    total: 85000,
    datesPaiement: [`${periode}-05`],
    dateEmission: emission,
    modele: 'colore',
    cheminFichier: `documents/${id}.pdf`,
    signatureIncluse: false,
    creeLe: `${emission}T00:00:00.000Z`,
  };
}

// ---------------------------------------------------------------------------
// Le classement
// ---------------------------------------------------------------------------

describe('Dossier : chaque pièce se range sous la bonne catégorie et la bonne section', () => {
  it('les deux états des lieux partagent une catégorie mais pas une section', () => {
    assert.equal(categorieDePiece('edl_entree'), 'etats_des_lieux');
    assert.equal(categorieDePiece('edl_sortie'), 'etats_des_lieux');

    assert.equal(sectionDePiece('edl_entree'), 'edl_entree');
    assert.equal(sectionDePiece('edl_sortie'), 'edl_sortie');
  });

  it('range le bail, l’inventaire et le reste sans les confondre', () => {
    assert.equal(categorieDePiece('bail'), 'baux');
    assert.equal(categorieDePiece('inventaire'), 'inventaires');
    assert.equal(categorieDePiece('autre'), 'autres');
  });

  it('l’ordre des sections est la vie de la location, et il est complet', () => {
    assert.deepEqual(
      SECTIONS_DU_DOSSIER.map((s) => s.cle),
      ['bail', 'edl_entree', 'edl_sortie', 'inventaire', 'quittances', 'autres'],
      'l’ordre raconte la location du début à la fin : le changer change ce que '
        + 'le bailleur lit en premier',
    );
  });

  it('les cinq catégories de l’onglet DOCUMENTS existent toutes', () => {
    assert.deepEqual(
      CATEGORIES_DOCUMENT.map((c) => c.valeur),
      ['quittances', 'baux', 'etats_des_lieux', 'inventaires', 'autres'],
    );
  });
});

// ---------------------------------------------------------------------------
// Le rattachement
// ---------------------------------------------------------------------------

describe('Dossier : un document reste attaché à son locataire', () => {
  const ancien = bail('bail-ancien', '2020-01-01', '2023-06-30');
  const enCours = bail('bail-en-cours', '2023-07-01');

  it('sépare les pièces de deux locations successives', () => {
    const dossier = construireDossier({
      bails: [ancien, enCours],
      titulaires: [
        titulaire('t1', ancien.id, 'Jean', 'DUPONT'),
        titulaire('t2', enCours.id, 'Amina', 'BENALI'),
      ],
      pieces: [
        piece('p1', 'edl_entree', ancien.id, '2020-01-01'),
        piece('p2', 'edl_sortie', ancien.id, '2023-06-30'),
        piece('p3', 'edl_entree', enCours.id, '2023-07-01'),
      ],
      documents: [document('d1', ancien.id, '2021-03', '2021-03-06')],
    });

    const parBail = new Map(dossier.occupations.map((o) => [o.bail.id, o]));

    const chezAncien = parBail.get(ancien.id)!;
    assert.equal(chezAncien.nombre, 3, 'deux états des lieux et une quittance');
    assert.equal(chezAncien.sections.find((s) => s.cle === 'edl_sortie')!.elements.length, 1);
    assert.equal(chezAncien.sections.find((s) => s.cle === 'quittances')!.elements.length, 1);

    const chezNouveau = parBail.get(enCours.id)!;
    assert.equal(chezNouveau.nombre, 1, 'seulement son état des lieux d’entrée');
    assert.equal(
      chezNouveau.sections.find((s) => s.cle === 'quittances')!.elements.length,
      0,
      'la quittance de l’ancien locataire ne doit pas apparaître chez le nouveau',
    );
  });

  it('présente la location en cours en premier, puis la plus récemment terminée', () => {
    const dossier = construireDossier({
      bails: [bail('vieux', '2010-01-01', '2015-12-31'), ancien, enCours],
      titulaires: [],
      pieces: [],
      documents: [],
    });

    assert.deepEqual(
      dossier.occupations.map((o) => o.bail.id),
      [enCours.id, ancien.id, 'vieux'],
      'le locataire en place se lit avant les locataires partis',
    );
    assert.equal(dossier.occupations[0].enCours, true);
  });

  it('les quittances d’un locataire parti restent dans son dossier', () => {
    const dossier = construireDossier({
      bails: [ancien, enCours],
      titulaires: [],
      pieces: [],
      documents: [
        document('d-2020', ancien.id, '2020-05', '2020-05-06'),
        document('d-2021', ancien.id, '2021-05', '2021-05-06'),
        document('d-2024', enCours.id, '2024-05', '2024-05-06'),
      ],
    });

    const chezAncien = dossier.occupations.find((o) => o.bail.id === ancien.id)!;
    const quittances = chezAncien.sections.find((s) => s.cle === 'quittances')!.elements;

    assert.equal(quittances.length, 2, 'aucune quittance de l’ancien locataire n’est perdue');
    assert.deepEqual(
      quittances.map((q) => q.periode),
      ['2021-05', '2020-05'],
      'de la plus récente à la plus ancienne',
    );
  });
});

// ---------------------------------------------------------------------------
// Ce qui ne se rattache à rien
// ---------------------------------------------------------------------------

describe('Dossier : un document qu’on ne sait plus rattacher reste visible', () => {
  it('range sous le bien une pièce sans bail', () => {
    const dossier = construireDossier({
      bails: [bail('b1', '2024-01-01')],
      titulaires: [],
      pieces: [piece('diagnostic', 'autre', null, '2024-02-01', 'Diagnostic gaz')],
      documents: [],
    });

    assert.equal(dossier.bien.length, 1);
    assert.equal(dossier.bien[0].libelle, 'Diagnostic gaz');
    assert.equal(dossier.occupations[0].nombre, 0);
  });

  it('range sous le bien une pièce dont le bail n’existe plus', () => {
    // Ce cas arrive réellement : une sauvegarde restaurée peut porter une pièce
    // dont le bail a été perdu. La disparaître serait un mensonge par omission.
    const dossier = construireDossier({
      bails: [bail('b1', '2024-01-01')],
      titulaires: [],
      pieces: [piece('orpheline', 'bail', 'bail-disparu', '2023-01-01', 'Ancien bail')],
      documents: [],
    });

    assert.equal(dossier.bien.length, 1, 'la pièce orpheline n’est pas perdue');
    assert.equal(dossier.bien[0].libelle, 'Ancien bail');
  });
});

// ---------------------------------------------------------------------------
// Les sections et la vue transversale
// ---------------------------------------------------------------------------

describe('Dossier : les sections sont toutes présentes, vides comprises', () => {
  it('rend six sections, même sans aucun élément', () => {
    const sections = sectionsDepuis([]);

    assert.equal(sections.length, 6);
    assert.deepEqual(sections.map((s) => s.cle), SECTIONS_DU_DOSSIER.map((s) => s.cle));
    assert.ok(sections.every((s) => s.elements.length === 0));
  });

  it('trie les éléments d’une section du plus récent au plus ancien', () => {
    const elements: ElementDossier[] = [
      piece('vieux', 'autre', 'b1', '2020-01-01'),
      piece('recent', 'autre', 'b1', '2026-01-01'),
      piece('milieu', 'autre', 'b1', '2023-01-01'),
    ].map(elementDePiece);

    const autres = sectionsDepuis(elements).find((s) => s.cle === 'autres')!;
    assert.deepEqual(
      autres.elements.map((e) => e.id),
      ['recent', 'milieu', 'vieux'],
    );
  });

  it('garde un ordre stable à date égale', () => {
    const elements = [
      piece('a', 'autre', 'b1', '2026-01-01'),
      piece('b', 'autre', 'b1', '2026-01-01'),
    ].map(elementDePiece);

    const premier = sectionsDepuis(elements).find((s) => s.cle === 'autres')!;
    const second = sectionsDepuis(elements.slice().reverse()).find((s) => s.cle === 'autres')!;

    assert.deepEqual(
      premier.elements.map((e) => e.id),
      second.elements.map((e) => e.id),
      'l’ordre ne doit pas dépendre de l’ordre d’arrivée',
    );
  });
});

describe('Dossier : la vue transversale de l’onglet DOCUMENTS', () => {
  it('rend les cinq catégories, même vides', () => {
    const parCategorie = elementsParCategorie({ pieces: [], documents: [] });

    assert.deepEqual(Object.keys(parCategorie).sort(), [
      'autres',
      'baux',
      'etats_des_lieux',
      'inventaires',
      'quittances',
    ]);
    assert.ok(Object.values(parCategorie).every((liste) => liste.length === 0));
  });

  it('compte chaque catégorie, et la somme égale le total rangé', () => {
    const pieces = [
      piece('b', 'bail', 'b1', '2024-01-01'),
      piece('e1', 'edl_entree', 'b1', '2024-01-01'),
      piece('e2', 'edl_sortie', 'b1', '2025-01-01'),
      piece('i', 'inventaire', 'b1', '2024-01-01'),
      piece('a', 'autre', null, '2024-03-01'),
    ];
    const documents = [document('q', 'b1', '2024-02', '2024-02-06')];

    const compteurs = compterParCategorie(elementsParCategorie({ pieces, documents }));

    assert.deepEqual(compteurs, {
      quittances: 1,
      baux: 1,
      etats_des_lieux: 2,
      inventaires: 1,
      autres: 1,
    });
    assert.equal(
      Object.values(compteurs).reduce((a, b) => a + b, 0),
      pieces.length + documents.length,
      'aucun document rangé n’échappe au comptage',
    );
  });

  it('nomme une quittance par son mois, et une pièce par son titre', () => {
    const quittance = elementDeDocument(document('q', 'b1', '2026-09', '2026-09-06'));
    assert.match(quittance.libelle, /Quittance de loyer · Septembre 2026/);
    assert.equal(quittance.numero, 'QUI-2026-0001');
    assert.equal(quittance.categorie, 'quittances');

    const baux = elementDePiece(piece('b', 'bail', 'b1', '2024-01-01', 'Bail signé'));
    assert.equal(baux.libelle, 'Bail signé');
    assert.equal(baux.categorie, 'baux');
  });
});

// ---------------------------------------------------------------------------
// L'appariement entrée / sortie
// ---------------------------------------------------------------------------

describe('Dossier : un état des lieux de sortie se compare à l’entrée de la même location', () => {
  it('ne retient que l’entrée du bail demandé', () => {
    const pieces = [
      piece('entree-ancienne', 'edl_entree', 'bail-A', '2020-01-01'),
      piece('entree-courante', 'edl_entree', 'bail-B', '2023-07-01'),
    ];

    assert.equal(etatDesLieuxEntreeApparie(pieces, 'bail-B')?.id, 'entree-courante');
    assert.equal(
      etatDesLieuxEntreeApparie(pieces, 'bail-A')?.id,
      'entree-ancienne',
      'l’entrée du locataire précédent ne doit jamais servir de référence au suivant',
    );
  });

  it('renvoie null quand la location n’a pas d’état des lieux d’entrée', () => {
    assert.equal(etatDesLieuxEntreeApparie([], 'bail-B'), null);
    assert.equal(
      etatDesLieuxEntreeApparie([piece('s', 'edl_sortie', 'bail-B', '2025-01-01')], 'bail-B'),
      null,
    );
  });
});

// ---------------------------------------------------------------------------
// La saisie
// ---------------------------------------------------------------------------

describe('Saisie d’une pièce : ce qui manque est dit, et une date impossible est refusée', () => {
  const complet = {
    logementId: 'log-1',
    type: 'bail' as TypePiece,
    fichier: 'file:///cache/bail.pdf',
    titre: 'Bail signé',
    date: '2026-09-01',
  };

  it('n’exige rien quand tout est renseigné', () => {
    assert.deepEqual(manquesDuBrouillon(complet), []);
  });

  it('dit tout ce qui manque, et pas seulement le premier', () => {
    const manques = manquesDuBrouillon({
      logementId: null,
      type: 'autre',
      fichier: null,
      titre: '   ',
      date: '',
    });

    assert.equal(manques.length, 4, 'les quatre manques sont annoncés d’un coup');
    assert.ok(manques.some((m) => /logement/i.test(m)));
    assert.ok(manques.some((m) => /fichier/i.test(m)));
    assert.ok(manques.some((m) => /titre/i.test(m)));
    assert.ok(manques.some((m) => /date/i.test(m)));
  });

  it('refuse une date de forme correcte qui n’existe pas', () => {
    const manques = manquesDuBrouillon({ ...complet, date: '2026-02-31' });

    assert.equal(manques.length, 1);
    assert.match(manques[0], /n’existe pas/);
  });

  it('accepte le 29 février d’une année bissextile et refuse celui d’une année commune', () => {
    assert.deepEqual(manquesDuBrouillon({ ...complet, date: '2024-02-29' }), []);
    assert.equal(manquesDuBrouillon({ ...complet, date: '2026-02-29' }).length, 1);
  });

  it('refuse une date mal écrite', () => {
    for (const date of ['01/09/2026', '2026-9-1', '20260901', 'hier']) {
      assert.equal(
        manquesDuBrouillon({ ...complet, date }).length,
        1,
        `« ${date} » ne doit pas être acceptée`,
      );
    }
  });
});
