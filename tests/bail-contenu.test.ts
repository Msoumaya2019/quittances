/**
 * L'assemblage d'un bail : des fiches du logement au contenu imprimé.
 *
 * Ces tests portent sur le **domaine pur** — `node --test`, sans émulateur.
 *
 * Deux promesses y sont tenues, et ce sont les seules qui comptent ici :
 *
 *  - **ce qui s'imprime est ce qui a été saisi.** Aucune valeur absente n'est
 *    remplacée par un défaut plausible : un bail signé portant un loyer que
 *    personne n'a décidé serait la faute la plus grave de cette application ;
 *  - **les fiches de l'application satisfont les formes du document.** Elles
 *    sont passées telles quelles, sans recopie de champ : une fonction de
 *    conversion laisserait un champ ajouté d'un côté disparaître en silence du
 *    document.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { contenuDepuis, rendreBail, type SourcesBail } from '../src/pdf/bail.ts';
import { manquesDuBail } from '../src/domain/bail.ts';
import type { BrouillonBail } from '../src/domain/bail.ts';
import type { Logement, Proprietaire, TitulaireBail } from '../src/domain/types.ts';

const PROPRIETAIRE: Proprietaire = {
  id: 'prop-1',
  nom: 'Mme Dupont',
  qualite: 'Gérante de la SCI Les Tilleuls',
  adresse: '12 rue des Lilas',
  codePostal: '69003',
  ville: 'Lyon',
  telephone: '06 12 34 56 78',
  email: 'contact@exemple.fr',
  siret: '12345678900011',
  notes: null,
  creeLe: '2026-01-01T00:00:00.000Z',
  modifieLe: '2026-01-01T00:00:00.000Z',
};

const LOGEMENT: Logement = {
  id: 'log-1',
  proprietaireId: 'prop-1',
  nom: 'Appartement 1',
  type: 'appartement',
  complement: 'Bâtiment B, 3e étage',
  adresse: '8 avenue Jean Jaurès',
  codePostal: '69007',
  ville: 'Lyon',
  reference: 'LOT-42',
  surface: 48,
  notes: null,
  creeLe: '2026-01-01T00:00:00.000Z',
  modifieLe: '2026-01-01T00:00:00.000Z',
};

const TITULAIRES: TitulaireBail[] = [
  {
    id: 'tit-1',
    bailId: 'bail-1',
    ordre: 1,
    nom: 'Benali',
    prenom: 'Mohamed',
    telephone: '06 00 00 00 00',
    email: 'm.benali@exemple.fr',
    dateNaissance: '1988-04-17',
    lieuNaissance: 'Oran',
  },
  {
    id: 'tit-2',
    bailId: 'bail-1',
    ordre: 2,
    nom: 'Benali',
    prenom: 'Yasmine',
    telephone: null,
    email: null,
    dateNaissance: null,
    lieuNaissance: null,
  },
];

/**
 * Les fiches passent **telles quelles** dans le document.
 *
 * L'accord de forme est vérifié par le compilateur : `verifier:tests` type ce
 * fichier, et une fiche qui cesserait de satisfaire `PartieBailleur` ferait
 * échouer la vérification des types. C'est le contrôle qui manquerait si l'on
 * écrivait une fonction de conversion recopiant les champs un à un.
 */
function sources(p: Proprietaire, l: Logement, t: TitulaireBail[]): SourcesBail {
  return { bailleur: p, logement: l, locataires: t };
}

function brouillon(extra: Partial<BrouillonBail> = {}): BrouillonBail {
  return {
    logementId: LOGEMENT.id,
    bailId: 'bail-1',
    categorie: 'vide',
    dateDebut: '2026-10-01',
    dureeMois: 36,
    loyer: 70000,
    charges: 5000,
    depotGarantie: 70000,
    jourEcheance: 5,
    ...extra,
  };
}

test('les fiches de l’application passent telles quelles dans le document', () => {
  const contenu = contenuDepuis({
    sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
    brouillon: brouillon(),
    etabliLe: '2026-09-24',
  });

  // Le bailleur : la qualité et le SIRET d'une SCI ne doivent pas se perdre.
  assert.equal(contenu.bailleur.nom, 'Mme Dupont');
  assert.equal(contenu.bailleur.qualite, 'Gérante de la SCI Les Tilleuls');
  assert.equal(contenu.bailleur.siret, '12345678900011');

  // Le logement : le complément d'adresse situe l'appartement dans l'immeuble.
  assert.equal(contenu.logement.nom, 'Appartement 1');
  assert.equal(contenu.logement.complement, 'Bâtiment B, 3e étage');
  assert.equal(contenu.logement.surface, 48);
  assert.equal(contenu.logement.reference, 'LOT-42');

  // Les locataires : deux titulaires, dans l'ordre de la base.
  assert.equal(contenu.locataires.length, 2);
  assert.equal(contenu.locataires[0].prenom, 'Mohamed');
  assert.equal(contenu.locataires[1].prenom, 'Yasmine');
});

test('le contenu imprimé reprend exactement ce qui a été saisi', () => {
  const contenu = contenuDepuis({
    sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
    brouillon: brouillon({ categorie: 'meuble', dureeMois: 12, depotGarantie: 140000 }),
    etabliLe: '2026-09-24',
  });

  assert.equal(contenu.categorie, 'meuble');
  assert.equal(contenu.dateDebut, '2026-10-01');
  assert.equal(contenu.dureeMois, 12);
  assert.equal(contenu.loyer, 70000);
  assert.equal(contenu.charges, 5000);
  assert.equal(contenu.depotGarantie, 140000);
  assert.equal(contenu.jourEcheance, 5);
  assert.equal(contenu.etabliLe, '2026-09-24');
});

test('une valeur absente n’est pas remplacée par un défaut plausible', () => {
  // Un brouillon réduit à sa catégorie : tout le reste est absent. La fonction
  // ne doit rien inventer — pas de loyer à un montant vraisemblable, pas de
  // date du jour à la place de la prise d'effet.
  const contenu = contenuDepuis({
    sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
    brouillon: { logementId: LOGEMENT.id, bailId: 'bail-1', categorie: 'vide' },
    etabliLe: '2026-09-24',
  });

  assert.equal(contenu.dateDebut, '');
  assert.equal(contenu.dureeMois, 0);
  assert.equal(contenu.loyer, 0);
  assert.equal(contenu.charges, 0);
  assert.equal(contenu.depotGarantie, 0);
  assert.equal(contenu.clausesParticulieres, null);
  assert.deepEqual(contenu.annexes, []);
  assert.deepEqual(contenu.signatures, []);

  // Et le contrôle final refuse bien ce brouillon : c'est lui qui garde la
  // porte, puisque l'assemblage, lui, ne lève pas.
  assert.ok(manquesDuBail({ logementId: LOGEMENT.id, bailId: 'bail-1', categorie: 'vide' }).length > 0);
});

test('une catégorie absente ne fait pas lever l’assemblage', () => {
  const contenu = contenuDepuis({
    sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
    brouillon: { logementId: LOGEMENT.id, bailId: 'bail-1' },
    etabliLe: '2026-09-24',
  });
  assert.equal(contenu.categorie, 'vide');
});

test('le diagnostic « à renouveler » est celui du bailleur, pas un jugement de l’application', () => {
  const contenu = contenuDepuis({
    sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
    brouillon: brouillon({
      diagnostics: [
        { libelle: 'Performance énergétique (DPE)', date: '2025-03-01' },
        { libelle: 'Gaz', date: '2019-06-15', aRenouveler: true },
      ],
    }),
    etabliLe: '2026-09-24',
  });

  assert.equal(contenu.diagnostics?.length, 2);
  assert.equal(contenu.diagnostics?.[0].perime, false);
  assert.equal(contenu.diagnostics?.[1].perime, true);

  // L'application ne décide de rien : le diagnostic ancien dont le bailleur
  // n'a rien dit n'est pas signalé, et celui qu'il a marqué l'est.
  // Le mot imprimé sur le papier est « à renouveler » : le test l'exige tel
  // qu'il est écrit, et non tel qu'on se le rappelle.
  const html = rendreBail(contenu);
  assert.match(html, /à renouveler/);
});

test('le lieu d’établissement est celui des réglages, à défaut la ville du bailleur', () => {
  const sansReglage = contenuDepuis({
    sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
    brouillon: brouillon(),
    etabliLe: '2026-09-24',
  });
  assert.equal(sansReglage.lieu, 'Lyon');

  const avecReglage = contenuDepuis({
    sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
    brouillon: brouillon(),
    reglages: { lieuEmission: 'Villeurbanne' },
    etabliLe: '2026-09-24',
  });
  assert.equal(avecReglage.lieu, 'Villeurbanne');

  // Un lieu fait d'espaces n'est pas un lieu : on retombe sur la ville.
  const espaces = contenuDepuis({
    sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
    brouillon: brouillon(),
    reglages: { lieuEmission: '   ' },
    etabliLe: '2026-09-24',
  });
  assert.equal(espaces.lieu, 'Lyon');
});

test('la résidence principale est mentionnée par défaut, et se retire', () => {
  const parDefaut = contenuDepuis({
    sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
    brouillon: brouillon(),
    etabliLe: '2026-09-24',
  });
  assert.equal(parDefaut.residencePrincipale, true);
  assert.match(rendreBail(parDefaut), /résidence principale/i);

  const retiree = contenuDepuis({
    sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
    brouillon: brouillon({ residencePrincipale: false }),
    etabliLe: '2026-09-24',
  });
  assert.equal(retiree.residencePrincipale, false);
});

test('un bail assemblé depuis les fiches s’imprime sans balisage de rédaction', () => {
  // Le contrôle de forme du rendu porte sur des contenus fabriqués à la main.
  // Celui-ci vient du chemin réel : les fiches, le brouillon, l'assemblage.
  for (const categorie of ['vide', 'meuble', 'etudiant', 'mobilite', 'colocation', 'stationnement'] as const) {
    const contenu = contenuDepuis({
      sources: sources(PROPRIETAIRE, LOGEMENT, TITULAIRES),
      brouillon: brouillon({
        categorie,
        dureeMois: categorie === 'etudiant' ? 9 : categorie === 'mobilite' ? 6 : 36,
        motifMobilite: categorie === 'mobilite' ? 'Mutation professionnelle' : undefined,
        depotGarantie: categorie === 'mobilite' ? 0 : 70000,
      }),
      etabliLe: '2026-09-24',
    });
    const visible = rendreBail(contenu).replace(/<style>[\s\S]*?<\/style>/g, '');
    assert.equal(visible.match(/\*\*/g)?.length ?? 0, 0, `balisage pour ${categorie}`);
  }
});
