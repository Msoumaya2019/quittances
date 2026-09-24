/**
 * Le domaine de l'inventaire du mobilier.
 *
 * Ces tests portent sur des **règles**, pas sur des écrans : ils tournent sous
 * `node --test`, sans émulateur. Chacun énonce ce qu'il protège, parce qu'un
 * test dont on ne sait plus ce qu'il défend finit par être ajusté au code au
 * lieu de l'inverse.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ELEMENTS_MEUBLE_OBLIGATOIRES,
  ETAPES_INVENTAIRE,
  MEUBLES_GENERIQUES,
  SECTIONS_INVENTAIRE,
  SOURCES_INVENTAIRE,
  ajouterMeuble,
  ajouterPhoto,
  avertissementsDeLInventaire,
  cleDeRappel,
  comparerInventaire,
  etapePrecedenteInventaire,
  etapeSuivanteInventaire,
  identifiantsDePhotos,
  manquesDeLInventaire,
  manquesDeLEtapeInventaire,
  meubleVide,
  meublesParDefaut,
  numeroEtapeInventaire,
  pieceInventaireVide,
  piecesInitialesInventaire,
  premierMeubleARenseigner,
  presenceDesElementsObligatoires,
  quantiteRappelee,
  reprendreBrouillonInventaire,
  reprendreLesQuantites,
  sectionsInventaire,
  signatairesAttendusDeLInventaire,
  sortieInventaireDepuisLEntree,
  syntheseInventaire,
  titreDeLInventaire,
  toutEnBonEtat,
  viderConstat,
} from '../src/domain/inventaire.ts';
import type {
  BrouillonInventaire,
  MeubleInventaire,
  PieceInventaire,
} from '../src/domain/inventaire.ts';
import type { EtatElement } from '../src/domain/etats.ts';
import { brouillonDeLEdl, brouillonDeLInventaire } from '../src/domain/brouillon.ts';
import type { Signature } from '../src/domain/signature.ts';

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

function meuble(
  nom: string,
  quantite?: number,
  etat?: EtatElement,
  id = 'm1',
): MeubleInventaire {
  return { id, nom, quantite, etat, commentaire: '', photos: [] };
}

function piece(nom: string, meubles: MeubleInventaire[], id = 'pi1'): PieceInventaire {
  return { id, nom, meubles };
}

/** Une photo dont seul l'identifiant compte pour ces tests. */
function photo(id: string, chemin = '/documents/photos/x.jpg') {
  return { id, chemin, legende: '', priseLe: '2026-09-01' };
}

const SIGNATURE_BAILLEUR: Signature = {
  signataire: 'bailleur',
  nom: 'M. Dupont',
  date: '2026-09-01',
  trace: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
};

const SIGNATURE_LOCATAIRE: Signature = {
  signataire: 't1',
  nom: 'Awa Ndiaye',
  date: '2026-09-01',
  trace: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
};

/** Un brouillon qui ne manque de rien, pour n'éprouver qu'une règle à la fois. */
function brouillonValide(over: Partial<BrouillonInventaire> = {}): BrouillonInventaire {
  return {
    logementId: 'l1',
    bailId: 'b1',
    type: 'entree',
    dateInventaire: '2026-09-01',
    pieces: [piece('Cuisine', [meuble('Four', 1, 'bon')])],
    signatures: [SIGNATURE_BAILLEUR, SIGNATURE_LOCATAIRE],
    ...over,
  };
}

const ATTENDUS = signatairesAttendusDeLInventaire({
  nomBailleur: 'M. Dupont',
  titulaires: [{ id: 't1', nom: 'Ndiaye', prenom: 'Awa' }],
});

// ---------------------------------------------------------------------------
// Le mobilier obligatoire : la source, et ce qu'elle dit
// ---------------------------------------------------------------------------

test('les onze éléments du décret n° 2015-981 sont reproduits, numérotés et dans l’ordre', () => {
  assert.equal(ELEMENTS_MEUBLE_OBLIGATOIRES.length, 11);
  assert.deepEqual(
    ELEMENTS_MEUBLE_OBLIGATOIRES.map((e) => e.rang),
    ['1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°', '10°', '11°'],
  );

  // Le premier et le dernier, tels que lus à Légifrance : si l'un des deux
  // s'éloigne du texte, c'est que la liste a été réécrite de mémoire.
  assert.equal(ELEMENTS_MEUBLE_OBLIGATOIRES[0].libelle, 'Literie comprenant couette ou couverture');
  assert.match(ELEMENTS_MEUBLE_OBLIGATOIRES[10].libelle, /^Matériel d'entretien ménager adapté/);
  assert.equal(ELEMENTS_MEUBLE_OBLIGATOIRES[7].libelle, 'Table et sièges');
  assert.equal(ELEMENTS_MEUBLE_OBLIGATOIRES[9].libelle, 'Luminaires');

  for (const element of ELEMENTS_MEUBLE_OBLIGATOIRES) {
    assert.ok(
      element.mots.length > 0,
      `« ${element.rang} ${element.libelle} » n’a aucun mot de rapprochement`,
    );
  }
});

test('la source du décret est citée, avec sa date de consultation', () => {
  const references = SOURCES_INVENTAIRE.map((s) => s.reference).join(' | ');
  assert.match(references, /Décret n° 2015-981 du 31 juillet 2015, article 2/);
  assert.match(references, /article 25-4/);
  for (const source of SOURCES_INVENTAIRE) {
    assert.match(source.consulteLe, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(source.etablit.trim().length > 20, `la source « ${source.reference} » n’énonce rien`);
  }
});

test('un élément obligatoire est trouvé par un mot de son nom', () => {
  const pieces = [
    piece('Cuisine', [
      meuble('Four ou four à micro-ondes', 1, 'bon', 'm1'),
      meuble('Réfrigérateur', 1, 'tres_bon', 'm2'),
    ]),
    piece('Séjour', [meuble('Table', 1, 'bon', 'm3'), meuble('Chaise', 4, 'usage', 'm4')], 'pi2'),
  ];
  const presences = presenceDesElementsObligatoires(pieces);

  const four = presences[3];
  assert.equal(four.rang, '4°');
  assert.equal(four.present, true);
  assert.equal(four.quantite, 1);

  // « Table et sièges » est trouvé dans une autre pièce, et la quantité
  // additionne la table et les quatre chaises.
  const tableEtSieges = presences[7];
  assert.equal(tableEtSieges.present, true);
  assert.equal(tableEtSieges.quantite, 5);
  assert.deepEqual(tableEtSieges.pieces, ['Séjour']);

  // Rien ne correspond aux ustensiles de cuisine : la ligne reste vide.
  assert.equal(presences[6].present, false);
  assert.equal(presences[6].quantite, 0);
  assert.deepEqual(presences[6].pieces, []);
});

test('un meuble sans quantité comptée ne compte pas comme présent', () => {
  // Le meuble existe dans la liste, mais rien ne dit combien il y en a.
  // L'annoncer « présent, 1 exemplaire » serait un compte que personne n'a fait.
  const presences = presenceDesElementsObligatoires([
    piece('Cuisine', [meuble('Réfrigérateur', undefined, 'bon', 'm1')]),
  ]);
  assert.equal(presences[4].present, false);
  assert.equal(presences[4].quantite, 0);
});

test('la liste proposée par défaut couvre les onze éléments obligatoires', () => {
  // Les meubles proposés n'ont ni nombre ni état : aucun n'est donc « présent »
  // au sens du rapprochement, et c'est voulu — un meuble qu'on n'a pas compté
  // n'est pas un meuble constaté. On compte donc chaque meuble proposé pour
  // éprouver ce que ce test veut éprouver : la **couverture** de la liste.
  const comptees = piecesInitialesInventaire('appartement').map((p) => ({
    ...p,
    meubles: p.meubles.map((m) => ({ ...m, quantite: 1, etat: 'bon' as EtatElement })),
  }));

  const manquants = presenceDesElementsObligatoires(comptees).filter((e) => !e.present);
  assert.deepEqual(
    manquants.map((m) => `${m.rang} ${m.libelle}`),
    [],
    'la liste proposée par défaut ne couvre pas tous les éléments du décret',
  );

  // Et sans comptage, rien n'est présent : la même liste, non comptée, ne
  // prétend rien.
  const brutes = presenceDesElementsObligatoires(piecesInitialesInventaire('appartement'));
  assert.equal(brutes.filter((e) => e.present).length, 0);
});

// ---------------------------------------------------------------------------
// Le mobilier proposé par défaut
// ---------------------------------------------------------------------------

test('le mobilier proposé pour une pièce suit son nom', () => {
  assert.ok(meublesParDefaut('Cuisine').includes('Plaques de cuisson'));
  assert.ok(meublesParDefaut('Cuisine').includes('Réfrigérateur'));
  assert.ok(meublesParDefaut('Chambre 1').includes('Lit'));
  assert.ok(meublesParDefaut('Salle de bain').includes('Meuble vasque'));
  assert.ok(meublesParDefaut('Séjour').includes('Canapé'));
  // Une pièce inconnue reçoit le jeu générique plutôt que rien : une pièce sans
  // meuble proposé ne se décrit pas.
  assert.deepEqual(meublesParDefaut('Pièce mystérieuse'), MEUBLES_GENERIQUES);
});

test('le mobilier proposé est recopié : le modifier ne touche pas la proposition suivante', () => {
  const premier = meublesParDefaut('Cuisine');
  premier.push('Meuble inventé');
  assert.ok(!meublesParDefaut('Cuisine').includes('Meuble inventé'));
});

test('les pièces proposées pour un logement portent chacune du mobilier', () => {
  const pieces = piecesInitialesInventaire('studio');
  assert.ok(pieces.length > 0);
  for (const p of pieces) {
    assert.ok(p.meubles.length > 0, `la pièce « ${p.nom} » n’a aucun meuble proposé`);
    assert.ok(p.id.startsWith('pi'));
    for (const m of p.meubles) {
      assert.ok(m.id.startsWith('m'));
      assert.equal(m.quantite, undefined);
      assert.equal(m.etat, undefined);
    }
  }
  // Deux pièces ne portent pas le même identifiant : c'est ce qui permet de les
  // apparier à la sortie sans deviner.
  const ids = pieces.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ajouter un meuble réserve les identifiants retirés', () => {
  // Le cas réel : on retire « Table » (m2) d'un inventaire de sortie, puis on
  // ajoute « Bureau ». Sans réserve, `premierLibre` rendrait m2, et la
  // comparaison apparierait le bureau avec la table de l'entrée.
  const base = piece('Séjour', [meuble('Canapé', 1, 'bon', 'm1'), meuble('Bureau', 1, 'bon', 'm2')]);
  const sansBureau = { ...base, meubles: base.meubles.filter((m) => m.id !== 'm2') };

  const naif = ajouterMeuble(sansBureau, 'Table basse');
  assert.equal(naif.meubles[1].id, 'm2', 'sans réserve, l’identifiant retiré est réattribué');

  const reserve = ajouterMeuble(sansBureau, 'Table basse', ['m2']);
  assert.equal(reserve.meubles[1].id, 'm3');
});

// ---------------------------------------------------------------------------
// Les photos : un identifiant unique dans tout le document
// ---------------------------------------------------------------------------

test('deux meubles qui reçoivent une photo reçoivent deux identifiants distincts', () => {
  // Le défaut mesuré sur les états des lieux : l'identifiant était cherché libre
  // dans le seul porteur, si bien que deux `ph1` s'écrasaient dans l'index de
  // l'impression et que la seconde image n'était pas dessinée.
  const pieces = [piece('Séjour', [meuble('Canapé', 1, 'bon', 'm1'), meuble('Table', 1, 'bon', 'm2')])];

  let apres = pieces;
  for (const id of ['m1', 'm2']) {
    const prises = identifiantsDePhotos(apres);
    apres = apres.map((p) => ({
      ...p,
      meubles: p.meubles.map((m) => (m.id === id ? ajouterPhoto(m, photo('ph1'), prises) : m)),
    }));
  }

  const ids = identifiantsDePhotos(apres);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2, `identifiants confondus : ${ids.join(', ')}`);
});

test('la relecture d’un contenu enregistré rend les identifiants de photos uniques', () => {
  // Deux meubles, deux `ph1` : le cas que produit une version antérieure ou une
  // sauvegarde abîmée. Le second doit être renuméroté, sinon une photo disparaît.
  const relu = reprendreBrouillonInventaire(
    {
      pieces: [
        {
          id: 'pi1',
          nom: 'Séjour',
          meubles: [
            { id: 'm1', nom: 'Canapé', photos: [photo('ph1', '/a.jpg')] },
            { id: 'm2', nom: 'Table', photos: [photo('ph1', '/b.jpg')] },
          ],
        },
      ],
    },
    brouillonValide(),
  );

  const ids = identifiantsDePhotos(relu.pieces ?? []);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  // Les deux photos sont conservées, et gardent leur chemin respectif.
  assert.deepEqual(
    (relu.pieces ?? [])[0].meubles.map((m) => m.photos[0].chemin).sort(),
    ['/a.jpg', '/b.jpg'],
  );
});

test('la relecture écarte un état inconnu et une quantité invalide', () => {
  const relu = reprendreBrouillonInventaire(
    {
      pieces: [
        {
          id: 'pi1',
          nom: 'Cuisine',
          meubles: [
            { id: 'm1', nom: 'Four', etat: 'bon' },
            { id: 'm2', nom: 'Table', etat: 'excellent', quantite: -3 },
            { id: 'm3', nom: 'Chaise', quantite: 2.4 },
          ],
        },
      ],
    },
    brouillonValide(),
  );

  const meubles = (relu.pieces ?? [])[0].meubles;
  // « excellent » n’est pas un des sept états : il est ignoré, pas converti.
  assert.equal(meubles[1].etat, undefined);
  // Une quantité négative est ignorée : un nombre négatif d'exemplaires n'existe pas.
  assert.equal(meubles[1].quantite, undefined);
  // Une quantité décimale est ramenée à l'entier le plus proche.
  assert.equal(meubles[2].quantite, 2);
});

// ---------------------------------------------------------------------------
// La dérivation : ce qu'une sortie reprend, et ce qu'elle ne reprend pas
// ---------------------------------------------------------------------------

test('la sortie reprend les identifiants et les noms, et vide tout le constat', () => {
  const entree = [
    piece(
      'Chambre 1',
      [
        {
          id: 'm1',
          nom: 'Lit',
          quantite: 1,
          etat: 'bon',
          commentaire: 'sommier neuf',
          photos: [photo('ph1')],
        },
      ],
      'pi1',
    ),
  ];

  const sortie = sortieInventaireDepuisLEntree({ pieces: entree });
  const p = sortie.pieces[0];
  assert.equal(p.id, 'pi1');
  assert.equal(p.nom, 'Chambre 1');
  assert.equal(p.meubles[0].id, 'm1');
  assert.equal(p.meubles[0].nom, 'Lit');

  // Le constat d'entrée ne se recopie pas : un inventaire de sortie constate à
  // nouveau, et recopier ferait signer au locataire une visite qu'il n'a pas faite.
  assert.equal(p.meubles[0].etat, undefined);
  assert.equal(p.meubles[0].quantite, undefined);
  assert.equal(p.meubles[0].commentaire, '');
  assert.deepEqual(p.meubles[0].photos, []);
});

test('la quantité d’entrée est rendue à part, pour être rappelée et non validée', () => {
  const entree = [
    piece('Séjour', [meuble('Chaise', 4, 'bon', 'm1'), meuble('Table', 1, 'bon', 'm2')], 'pi1'),
    piece('Cuisine', [meuble('Four', undefined, undefined, 'm3')], 'pi2'),
  ];

  const sortie = sortieInventaireDepuisLEntree({ pieces: entree });

  // Les deux quantités connues sont rappelées, chacune dans **sa** pièce.
  assert.equal(quantiteRappelee(sortie, 'pi1', 'm1'), 4);
  assert.equal(quantiteRappelee(sortie, 'pi1', 'm2'), 1);
  // Un meuble jamais compté n'a rien à rappeler : l'y mettre à zéro ferait
  // croire qu'il a été compté pour rien.
  assert.equal(quantiteRappelee(sortie, 'pi2', 'm3'), undefined);
  // Et aucune quantité ne subsiste dans le brouillon lui-même.
  assert.ok(sortie.pieces.every((p) => p.meubles.every((m) => m.quantite === undefined)));
});

test('le rappel indexe un meuble dans sa pièce, et non dans le document', () => {
  // Les identifiants de meubles sont déterministes et propres à leur pièce :
  // deux pièces en portent de semblables. Une carte indexée par le seul
  // identifiant du meuble garderait la dernière quantité lue et l'afficherait
  // partout — le séjour rappellerait le compte de la chambre.
  const pieces = piecesInitialesInventaire('appartement');
  const ids = pieces.flatMap((p) => p.meubles.map((m) => m.id));
  assert.ok(
    ids.length > new Set(ids).size,
    'le décor du test doit porter des identifiants répétés d’une pièce à l’autre',
  );

  // Chaque pièce reçoit des quantités qui lui sont propres : c'est ce qui
  // distingue un rappel juste d'un rappel pris dans une autre pièce.
  const compte = pieces.map((piece, rang) => ({
    ...piece,
    meubles: piece.meubles.map((m, index) => ({
      ...m,
      quantite: (rang + 1) * 10 + index + 1,
      etat: 'bon' as const,
    })),
  }));

  const sortie = sortieInventaireDepuisLEntree({ pieces: compte });

  // Chaque meuble compté est rappelé, et **un seul** : la carte porte autant
  // d'entrées que de meubles comptés, tous meubles et toutes pièces confondus.
  assert.equal(sortie.quantitesEntree.size, compte.flatMap((p) => p.meubles).length);

  // Et le rappel d'un meuble est bien celui de sa pièce, et non celui d'une
  // autre qui porte le même identifiant.
  const premiere = compte[0];
  const seconde = compte[1];
  const id = premiere.meubles[0].id;
  assert.equal(id, seconde.meubles[0].id, 'les deux pièces doivent partager cet identifiant');
  assert.equal(quantiteRappelee(sortie, premiere.id, id), premiere.meubles[0].quantite);
  assert.equal(quantiteRappelee(sortie, seconde.id, id), seconde.meubles[0].quantite);

  // Les deux pièces partagent l'identifiant mais pas la quantité : c'est ce que
  // la clé composite distingue.
  assert.notEqual(premiere.meubles[0].quantite, seconde.meubles[0].quantite);
});

test('reprendreLesQuantites remplit les meubles vides et n’écrase aucun comptage', () => {
  const quantites = new Map([
    [cleDeRappel('pi1', 'm1'), 4],
    [cleDeRappel('pi1', 'm2'), 1],
  ]);
  const base = piece('Séjour', [
    meuble('Chaise', undefined, undefined, 'm1'),
    // Ce meuble a déjà été compté à la sortie : le raccourci ne doit pas y toucher.
    meuble('Table', 3, 'bon', 'm2'),
    // Ce meuble n'existe pas à l'entrée : rien à reprendre.
    meuble('Bureau', undefined, undefined, 'm3'),
  ]);

  const apres = reprendreLesQuantites(base, quantites);
  assert.equal(apres.meubles[0].quantite, 4);
  assert.equal(apres.meubles[1].quantite, 3, 'un comptage déjà fait a été écrasé');
  assert.equal(apres.meubles[2].quantite, undefined);
});

test('toutEnBonEtat ne touche qu’aux meubles sans état, et viderConstat efface le constat', () => {
  const base = piece('Séjour', [
    meuble('Canapé', 1, 'mauvais', 'm1'),
    meuble('Table', 1, undefined, 'm2'),
  ]);

  const rempli = toutEnBonEtat(base, 'bon');
  assert.equal(rempli.meubles[0].etat, 'mauvais', 'un constat déjà fait a été écrasé');
  assert.equal(rempli.meubles[1].etat, 'bon');

  const vide = viderConstat(rempli);
  assert.ok(vide.meubles.every((m) => m.etat === undefined && m.quantite === undefined));
});

test('le premier meuble à renseigner est celui qui manque de nombre ou d’état', () => {
  const base = piece('Séjour', [
    meuble('Canapé', 1, 'bon', 'm1'),
    meuble('Table', 1, undefined, 'm2'),
    meuble('Chaise', undefined, 'bon', 'm3'),
  ]);
  assert.equal(premierMeubleARenseigner(base)?.id, 'm2');

  const complet = piece('Séjour', [meuble('Canapé', 1, 'bon', 'm1')]);
  assert.equal(premierMeubleARenseigner(complet), null);
});

// ---------------------------------------------------------------------------
// La comparaison
// ---------------------------------------------------------------------------

test('la comparaison apparie par identifiant, jamais par nom', () => {
  // Le meuble a été rebaptisé entre les deux constats : c'est le même meuble,
  // et le renommage ne doit pas produire un « disparu » suivi d'un « nouveau ».
  const entree = [piece('Séjour', [meuble('Fauteuil', 1, 'bon', 'm1')], 'pi1')];
  const sortie = [piece('Séjour', [meuble('Fauteuil de lecture', 1, 'usage', 'm1')], 'pi1')];

  const comparaison = comparerInventaire(entree, sortie);
  const m = comparaison.pieces[0].meubles[0];
  assert.equal(m.aLEntree, true);
  assert.equal(m.aLaSortie, true);
  assert.equal(m.nom, 'Fauteuil de lecture', 'le nom retenu est celui du document qu’on lit');
  assert.equal(m.evolutionEtat, true);
  assert.equal(comparaison.nouveaux, 0);
  assert.equal(comparaison.disparus, 0);
});

test('deux meubles qui portent le même nom ne se confondent pas', () => {
  const entree = [
    piece('Séjour', [meuble('Table', 1, 'bon', 'm1'), meuble('Table', 1, 'mauvais', 'm2')], 'pi1'),
  ];
  const sortie = [
    piece('Séjour', [meuble('Table', 1, 'bon', 'm1'), meuble('Table', 1, 'bon', 'm2')], 'pi1'),
  ];

  const m = comparerInventaire(entree, sortie).pieces[0].meubles;
  // Seule m2 a changé, bien que les deux s'appellent « Table ».
  assert.equal(m[0].evolutionEtat, false);
  assert.equal(m[1].evolutionEtat, true);
});

test('un écart de quantité est rapporté, et rien n’est imputé à personne', () => {
  const entree = [piece('Séjour', [meuble('Chaise', 4, 'bon', 'm1')], 'pi1')];
  const sortie = [piece('Séjour', [meuble('Chaise', 3, 'bon', 'm1')], 'pi1')];

  const comparaison = comparerInventaire(entree, sortie);
  const m = comparaison.pieces[0].meubles[0];
  assert.equal(m.ecartQuantite, true);
  assert.equal(m.quantiteEntree, 4);
  assert.equal(m.quantiteSortie, 3);
  assert.equal(m.evolution, true);
  // L'état n'a pas changé : seule la quantité a bougé.
  assert.equal(m.evolutionEtat, false);
  assert.equal(comparaison.ecarts, 1);
  assert.equal(comparaison.evolutionsEtat, 0);
});

test('une quantité non comptée ne donne ni écart ni disparition', () => {
  // Le meuble n'a pas été compté à la sortie. Le dire « disparu » serait une
  // accusation gratuite : personne n'a regardé.
  const entree = [piece('Séjour', [meuble('Chaise', 4, 'bon', 'm1')], 'pi1')];
  const sortie = [piece('Séjour', [meuble('Chaise', undefined, 'bon', 'm1')], 'pi1')];

  const comparaison = comparerInventaire(entree, sortie);
  const m = comparaison.pieces[0].meubles[0];
  assert.equal(m.aLaSortie, true, 'le meuble est bien décrit à la sortie');
  assert.equal(m.ecartQuantite, false);
  assert.equal(m.quantiteSortie, undefined);
  assert.equal(comparaison.ecarts, 0);
  assert.equal(comparaison.disparus, 0);
});

test('un état non constaté n’est pas une évolution', () => {
  // « non vérifié » à l'entrée puis « bon » à la sortie : personne n'avait
  // regardé à l'entrée. Ce n'est pas une évolution, c'est un trou comblé.
  const entree = [piece('Séjour', [meuble('Canapé', 1, 'non_verifie', 'm1')], 'pi1')];
  const sortie = [piece('Séjour', [meuble('Canapé', 1, 'bon', 'm1')], 'pi1')];

  const comparaison = comparerInventaire(entree, sortie);
  const m = comparaison.pieces[0].meubles[0];
  assert.equal(m.evolutionEtat, false);
  assert.equal(m.incomparable, true);
  assert.equal(comparaison.evolutionsEtat, 0);
  assert.equal(comparaison.incomparables, 1);
});

test('un meuble de l’entrée absent de la sortie est listé, jamais tu', () => {
  const entree = [piece('Séjour', [meuble('Canapé', 1, 'bon', 'm1')], 'pi1')];
  const sortie = [piece('Séjour', [], 'pi1')];

  const comparaison = comparerInventaire(entree, sortie);
  const m = comparaison.pieces[0].meubles[0];
  assert.equal(m.aLEntree, true);
  assert.equal(m.aLaSortie, false);
  assert.equal(m.etatEntree, 'bon');
  assert.equal(comparaison.disparus, 1);
});

test('une pièce absente de la sortie est listée avec ses meubles', () => {
  const entree = [
    piece('Séjour', [meuble('Canapé', 1, 'bon', 'm1')], 'pi1'),
    piece('Cave', [meuble('Étagère', 2, 'usage', 'm2')], 'pi2'),
  ];
  const sortie = [piece('Séjour', [meuble('Canapé', 1, 'bon', 'm1')], 'pi1')];

  const comparaison = comparerInventaire(entree, sortie);
  assert.equal(comparaison.pieces.length, 2);
  const cave = comparaison.pieces[1];
  assert.equal(cave.id, 'pi2');
  assert.equal(cave.nom, 'Cave');
  assert.equal(cave.aLEntree, true);
  assert.equal(cave.meubles[0].nom, 'Étagère');
  assert.equal(cave.meubles[0].aLaSortie, false);
});

test('les photos des deux constats restent dans deux listes séparées', () => {
  const entree = [
    piece(
      'Séjour',
      [{ id: 'm1', nom: 'Canapé', quantite: 1, etat: 'bon', commentaire: '', photos: [photo('ph1', '/avant.jpg')] }],
      'pi1',
    ),
  ];
  const sortie = [
    piece(
      'Séjour',
      [{ id: 'm1', nom: 'Canapé', quantite: 1, etat: 'usage', commentaire: '', photos: [photo('ph1', '/apres.jpg')] }],
      'pi1',
    ),
  ];

  const m = comparerInventaire(entree, sortie).pieces[0].meubles[0];
  // Les deux documents numérotent leurs photos à partir de `ph1`. Les réunir
  // dans une seule liste ferait imprimer la photo d'entrée dans la colonne
  // « sortie » — un document faux qu'aucun test de texte ne verrait.
  assert.deepEqual(m.photosEntree, ['ph1']);
  assert.deepEqual(m.photosSortie, ['ph1']);
});

test('une comparaison sans aucun meuble ne rapporte rien, et ne lève pas', () => {
  const comparaison = comparerInventaire([], []);
  assert.deepEqual(comparaison.pieces, []);
  assert.equal(comparaison.ecarts, 0);
  assert.equal(comparaison.disparus, 0);
  assert.equal(comparaison.illustres, 0);
});

// ---------------------------------------------------------------------------
// Ce qui bloque, et ce qui se signale
// ---------------------------------------------------------------------------

test('un brouillon complet ne manque de rien', () => {
  assert.deepEqual(manquesDeLInventaire(brouillonValide(), ATTENDUS), []);
});

test('un meuble sans nombre, sans état, ou mal compté bloque l’établissement', () => {
  const sansNombre = brouillonValide({
    pieces: [piece('Cuisine', [meuble('Four', undefined, 'bon')])],
  });
  assert.match(manquesDeLInventaire(sansNombre, ATTENDUS).join(' '), /nombre/);

  const sansEtat = brouillonValide({ pieces: [piece('Cuisine', [meuble('Four', 1, undefined)])] });
  assert.match(manquesDeLInventaire(sansEtat, ATTENDUS).join(' '), /état/);

  const negatif = brouillonValide({ pieces: [piece('Cuisine', [meuble('Four', -1, 'bon')])] });
  assert.match(manquesDeLInventaire(negatif, ATTENDUS).join(' '), /nombre entier/);

  // Zéro exemplaire est un compte valide : il dit « il n'y en a plus ».
  const zero = brouillonValide({ pieces: [piece('Cuisine', [meuble('Four', 0, 'non_applicable')])] });
  assert.deepEqual(manquesDeLInventaire(zero, ATTENDUS), []);
});

test('deux pièces du même nom bloquent : la comparaison ne saurait plus laquelle', () => {
  const b = brouillonValide({
    pieces: [
      piece('Chambre', [meuble('Lit', 1, 'bon', 'm1')], 'pi1'),
      piece('chambre', [meuble('Lit', 1, 'bon', 'm2')], 'pi2'),
    ],
  });
  assert.match(manquesDeLInventaire(b, ATTENDUS).join(' '), /même nom/);
});

test('un inventaire de sortie sans inventaire d’entrée nommé bloque', () => {
  const b = brouillonValide({ type: 'sortie' });
  assert.match(manquesDeLInventaire(b, ATTENDUS).join(' '), /nommer l’inventaire d’entrée/);

  const complet = brouillonValide({
    type: 'sortie',
    inventaireEntreeId: 'inv-1',
    dateEntree: '2024-03-01',
  });
  assert.deepEqual(manquesDeLInventaire(complet, ATTENDUS), []);
});

test('un signataire qui n’a pas signé bloque, et le manque nomme la personne', () => {
  const b = brouillonValide({ signatures: [SIGNATURE_BAILLEUR] });
  const manques = manquesDeLInventaire(b, ATTENDUS);
  assert.equal(manques.length, 1);
  assert.match(manques[0], /Awa Ndiaye n’a pas signé/);
});

test('les manques par étape reconstituent exactement la liste complète', () => {
  // Le formulaire lit les manques d'une étape, le contrôle final lit la liste
  // entière : si les deux ne venaient pas de la même source, ils divergeraient.
  const b = brouillonValide({
    type: 'sortie',
    pieces: [piece('Cuisine', [meuble('Four', undefined, undefined)])],
    signatures: [],
  });

  const parEtape = ETAPES_INVENTAIRE.flatMap((e) => manquesDeLEtapeInventaire(b, e.valeur, ATTENDUS));
  const complet = manquesDeLInventaire(b, ATTENDUS);
  assert.ok(complet.length > 0);
  assert.deepEqual(parEtape.slice().sort(), complet.slice().sort());
});

test('un logement déclaré meublé signale les éléments obligatoires manquants, sans bloquer', () => {
  const b = brouillonValide({
    meuble: true,
    pieces: [piece('Cuisine', [meuble('Four', 1, 'bon')])],
  });

  // Le document s'établit : l'application ne sait pas si le logement est
  // réellement loué meublé, ni si le meuble est rangé ailleurs.
  assert.deepEqual(manquesDeLInventaire(b, ATTENDUS), []);

  const avertissements = avertissementsDeLInventaire(b).join(' | ');
  assert.match(avertissements, /décret n° 2015-981/);
  assert.match(avertissements, /onze éléments/);
});

test('un logement non déclaré meublé ne signale aucun élément obligatoire', () => {
  // Le déduire de la présence d'un lit ferait dire à l'application ce qu'elle ne
  // sait pas : un logement vide n'est pas un logement non meublé, et l'inverse
  // n'est pas vrai non plus.
  const b = brouillonValide({ pieces: [piece('Cuisine', [meuble('Four', 1, 'bon')])] });
  assert.ok(!avertissementsDeLInventaire(b).some((a) => /2015-981/.test(a)));
});

test('un meuble compté zéro tout en portant un état se signale', () => {
  const b = brouillonValide({
    pieces: [piece('Cuisine', [meuble('Four', 0, 'bon')])],
  });
  assert.match(avertissementsDeLInventaire(b).join(' | '), /0 exemplaire/);
});

// ---------------------------------------------------------------------------
// La synthèse
// ---------------------------------------------------------------------------

test('la synthèse sépare les états constatés des états qui ne le sont pas', () => {
  const b = brouillonValide({
    pieces: [
      piece(
        'Séjour',
        [
          meuble('Canapé', 1, 'bon', 'm1'),
          meuble('Table', 1, 'non_verifie', 'm2'),
          meuble('Chaise', 4, undefined, 'm3'),
        ],
        'pi1',
      ),
    ],
  });

  const s = syntheseInventaire(b);
  assert.equal(s.total, 3);
  assert.equal(s.constates, 1);
  // « Table » est renseignée — elle porte « non vérifié », qui dit qu'on a
  // décidé de ne pas regarder — mais elle n'est pas constatée. « Chaise » n'a
  // rien : elle est à renseigner. Ce sont deux choses différentes, et c'est
  // toute la distinction que porte `etatConstate`.
  assert.equal(s.aRenseigner, 1);
  assert.equal(s.pieces, 1);
  assert.equal(s.parEtat.find((e) => e.etat === 'bon')?.nombre, 1);
  assert.equal(s.parEtat.find((e) => e.etat === 'non_verifie')?.nombre, 1);
});

test('la synthèse n’additionne que les quantités réellement comptées', () => {
  const b = brouillonValide({
    pieces: [
      piece('Séjour', [meuble('Chaise', 4, 'bon', 'm1'), meuble('Table', 1, 'bon', 'm2')], 'pi1'),
      piece('Cuisine', [meuble('Four', undefined, 'bon', 'm3')], 'pi2'),
    ],
  });

  // Un meuble non compté ne vaut pas zéro : l'additionner comme tel donnerait un
  // total que personne n'a établi.
  assert.equal(syntheseInventaire(b).exemplaires, 5);
});

test('la synthèse compte les photos de tous les meubles', () => {
  const b = brouillonValide({
    pieces: [
      piece(
        'Séjour',
        [
          { id: 'm1', nom: 'Canapé', quantite: 1, etat: 'bon', commentaire: '', photos: [photo('ph1'), photo('ph2')] },
          { id: 'm2', nom: 'Table', quantite: 1, etat: 'bon', commentaire: '', photos: [photo('ph3')] },
        ],
        'pi1',
      ),
    ],
  });
  assert.equal(syntheseInventaire(b).photos, 3);
});

// ---------------------------------------------------------------------------
// Les sections et le parcours
// ---------------------------------------------------------------------------

test('un inventaire d’entrée porte onze sections, une de sortie en porte treize', () => {
  const entree = sectionsInventaire('entree');
  const sortie = sectionsInventaire('sortie');

  assert.equal(entree.length, 11);
  assert.equal(sortie.length, 13);
  assert.deepEqual(entree.map((s) => s.valeur), SECTIONS_INVENTAIRE.map((s) => s.valeur));
  assert.deepEqual(
    sortie.map((s) => s.valeur),
    [
      'objet',
      'logement',
      'parties',
      'bail',
      'reference_entree',
      'mobilier_legal',
      'pieces',
      'observations',
      'vetuste',
      'evolutions',
      'synthese',
      'signatures',
      'sources',
    ],
  );

  for (const section of sortie) {
    assert.ok(section.titre.trim().length > 0, `la section « ${section.valeur} » n’a pas de titre`);
    assert.ok(
      section.exigence.trim().length > 10,
      `la section « ${section.valeur} » n’énonce pas ce qu’elle doit contenir`,
    );
    assert.ok(section.fondement.trim().length > 0);
  }
});

test('le mobilier obligatoire se lit avant le détail, et les évolutions après', () => {
  const sortie = sectionsInventaire('sortie').map((s) => s.valeur);
  // Les onze éléments forment le cadre : on les lit avant de parcourir le
  // détail, sinon le lecteur découvre la règle après l'avoir appliquée.
  assert.ok(sortie.indexOf('mobilier_legal') < sortie.indexOf('pieces'));
  // Les évolutions se lisent après la description, dont elles tirent leurs
  // constats, et avant la synthèse, qu'elles nourrissent.
  assert.ok(sortie.indexOf('evolutions') > sortie.indexOf('pieces'));
  assert.ok(sortie.indexOf('evolutions') < sortie.indexOf('synthese'));
  // La référence à l'entrée suit le bail, dont elle dépend.
  assert.ok(sortie.indexOf('reference_entree') > sortie.indexOf('bail'));
  assert.ok(sortie.indexOf('reference_entree') < sortie.indexOf('mobilier_legal'));
});

test('les cinq étapes s’enchaînent et se comptent', () => {
  assert.equal(ETAPES_INVENTAIRE.length, 5);
  assert.deepEqual(
    ETAPES_INVENTAIRE.map((e) => e.valeur),
    ['logement', 'pieces', 'mobilier', 'observations', 'signature'],
  );
  assert.equal(numeroEtapeInventaire('logement'), 1);
  assert.equal(numeroEtapeInventaire('signature'), 5);
  assert.equal(etapeSuivanteInventaire('logement'), 'pieces');
  assert.equal(etapeSuivanteInventaire('signature'), null);
  assert.equal(etapePrecedenteInventaire('logement'), null);
  assert.equal(etapePrecedenteInventaire('mobilier'), 'pieces');
  for (const etape of ETAPES_INVENTAIRE) {
    assert.ok(etape.titre.trim().length > 0);
    assert.ok(etape.aide.trim().length > 0);
  }
});

test('une entrée et une sortie ont deux brouillons distincts, pour les deux documents', () => {
  // La clé primaire de la table est le couple (logement, type) : une clé
  // partagée ferait écraser une entrée en cours par une sortie commencée, en
  // silence.
  assert.notEqual(brouillonDeLInventaire('entree'), brouillonDeLInventaire('sortie'));
  assert.notEqual(brouillonDeLEdl('entree'), brouillonDeLEdl('sortie'));
  // Et les deux documents ne se disputent pas la même clé entre eux.
  const cles = [
    brouillonDeLInventaire('entree'),
    brouillonDeLInventaire('sortie'),
    brouillonDeLEdl('entree'),
    brouillonDeLEdl('sortie'),
  ];
  assert.equal(new Set(cles).size, 4);
});

test('le titre de la pièce nomme la nature et la date, en français', () => {
  assert.equal(
    titreDeLInventaire('entree', '2026-09-01'),
    "Inventaire du mobilier d'entrée du 1 septembre 2026",
  );
  assert.equal(
    titreDeLInventaire('sortie', '2027-02-14'),
    'Inventaire du mobilier de sortie du 14 février 2027',
  );
});

test('meubleVide et pieceInventaireVide ne présument ni nombre ni état', () => {
  const m = meubleVide('Lit', []);
  assert.equal(m.quantite, undefined);
  assert.equal(m.etat, undefined);

  const p = pieceInventaireVide('Chambre', []);
  assert.equal(p.nom, 'Chambre');
  assert.ok(p.meubles.length > 0);
  assert.ok(p.meubles.every((x) => x.quantite === undefined && x.etat === undefined));
});
