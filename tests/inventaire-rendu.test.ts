/**
 * Le rendu de l'inventaire du mobilier.
 *
 * Un document de plusieurs pages ne se relit pas à l'œil sur un téléphone : on
 * vérifie donc ici ce qui est **imprimé**, sur la chaîne HTML elle-même.
 *
 * Quatre précautions rendent ces contrôles fiables, et chacune vient d'un faux
 * résultat observé :
 *
 * - **On cherche dans le texte tel qu'il se lit.** Une phrase écrite sur deux
 *   lignes dans un littéral de gabarit est imprimée sur deux lignes, et une
 *   apostrophe droite est écrite `&#39;` : la chercher telle qu'on l'a tapée
 *   échouerait sur un document juste.
 * - **On borne chaque assertion à sa section**, et une section se désigne par
 *   son titre **fermé par `</h2>`**. Le document porte sa feuille de styles : le
 *   mot « Signatures » y apparaît dans un commentaire CSS, avant la section, et
 *   une recherche du premier venu tombe dedans.
 * - **On borne aussi à la section ce qu'on compte.** Une photo s'imprime deux
 *   fois dans un inventaire de sortie — une fois sous son meuble, une fois dans
 *   la mise en regard — et c'est voulu.
 * - **On construit les intitulés depuis le domaine**, jamais en les retapant.
 *
 * Deux contrôles portent sur des fautes qu'aucune relecture ne verrait :
 *
 * - une quantité non comptée ne doit **jamais** s'imprimer comme un nombre ;
 * - les deux colonnes d'une paire avant/après doivent résoudre contre **deux
 *   index distincts**, faute de quoi la photo de l'entrée s'imprime dans la
 *   colonne « Sortie » — un document faux, et rien dans le texte ne le dit.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ELEMENTS_MEUBLE_OBLIGATOIRES,
  LIBELLE_TYPE_INVENTAIRE,
  avertissementsDeLInventaire,
  comparerInventaire,
  meubleVide,
  piecesInitialesInventaire,
  sectionsInventaire,
  sortieInventaireDepuisLEntree,
} from '../src/domain/inventaire.ts';
import type {
  BrouillonInventaire,
  MeubleInventaire,
  PieceInventaire,
} from '../src/domain/inventaire.ts';
import { libelleEtat } from '../src/domain/etats.ts';
import type { EtatElement } from '../src/domain/etats.ts';
import { contenuInventaireDepuis, rendreInventaire } from '../src/pdf/inventaire.ts';
import type { ContenuInventaire } from '../src/pdf/inventaire.ts';

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

const LOGEMENT = {
  nom: 'Appartement 1',
  adresse: '12 rue des Lilas',
  complement: '3e étage',
  codePostal: '75011',
  ville: 'Paris',
  surface: 42,
  reference: 'LOT-12',
};

const BAILLEUR = {
  nom: 'SCI Les Lilas',
  qualite: 'Représentée par M. Dupont',
  adresse: '1 place de la Mairie',
  codePostal: '75011',
  ville: 'Paris',
  telephone: '01 23 45 67 89',
  email: null,
  siret: '12345678900011',
};

const LOCATAIRES = [
  {
    nom: 'Martin',
    prenom: 'Julie',
    telephone: null,
    email: null,
    dateNaissance: '1990-04-17',
    lieuNaissance: 'Lyon',
  },
  {
    nom: 'Bernard',
    prenom: 'Karim',
    telephone: null,
    email: null,
    dateNaissance: null,
    lieuNaissance: null,
  },
];

const BAIL = {
  dateEntree: '2026-09-01',
  dateSortie: null,
  loyer: 85000,
  charges: 4500,
  depotGarantie: 85000,
  jourEcheance: 5,
};

/**
 * Le document tel qu'il se lit : entités résolues, blancs normalisés.
 *
 * `&lt;` redevient `<`, et c'est bien ce que le lecteur voit — mais c'est aussi
 * pourquoi le contrôle d'échappement, lui, porte sur la chaîne **brute** : il
 * cherche à prouver que le balisage saisi n'est pas interprété.
 */
function lisible(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** Le rang d'un fragment dans le texte du document, ou une erreur lisible. */
function rang(html: string, fragment: string): number {
  const position = lisible(html).indexOf(lisible(fragment));
  assert.notEqual(position, -1, `le document ne porte pas « ${fragment} »`);
  return position;
}

function compter(html: string, fragment: string): number {
  return lisible(html).split(lisible(fragment)).length - 1;
}

/**
 * Le texte d'une section, borné par la suivante.
 *
 * Le titre est cherché **fermé par `</h2>`** : le mot seul apparaîtrait d'abord
 * dans la feuille de styles du document.
 */
function sectionDuTitre(html: string, titre: string): string {
  const plat = lisible(html);
  const debut = plat.indexOf(`</span> ${titre}</h2>`);
  assert.notEqual(debut, -1, `le document n’a pas de section « ${titre} »`);
  const suivante = plat.indexOf('<span class="e-numero">', debut);
  return suivante === -1 ? plat.slice(debut) : plat.slice(debut, suivante);
}

/** Combien de sections numérotées le document porte. */
function sectionsNumerotees(html: string): number {
  return compter(html, '<span class="e-numero">');
}

/**
 * Un meuble, avec ses photos.
 *
 * Les photos d'un meuble sont des `PhotoDocument` : elles portent le chemin du
 * fichier et la date de la prise de vue, et non seulement de quoi l'imprimer.
 * C'est l'émission du PDF qui construit l'index imprimable à partir d'elles.
 */
function meuble(
  nom: string,
  quantite?: number,
  etat?: EtatElement,
  id = 'm1',
  photos: { id: string; donnees: string; legende: string }[] = [],
): MeubleInventaire {
  return {
    id,
    nom,
    quantite,
    etat,
    commentaire: '',
    photos: photos.map((p) => ({
      id: p.id,
      chemin: `documents/photos/${p.id}.jpg`,
      legende: p.legende,
      priseLe: '2026-09-24',
    })),
  };
}

function piece(nom: string, meubles: MeubleInventaire[], id = 'pi1'): PieceInventaire {
  return { id, nom, meubles };
}

/** Un brouillon complet d'inventaire d'entrée. */
function brouillon(): BrouillonInventaire {
  return {
    logementId: 'logement-1',
    bailId: 'bail-1',
    type: 'entree',
    dateInventaire: '2026-09-24',
    pieces: [
      piece('Séjour', [meuble('Canapé', 1, 'bon', 'm1'), meuble('Table basse', 2, 'usage', 'm2')]),
      piece('Chambre', [meuble('Lit 140', 1, 'neuf', 'm1')], 'pi2'),
    ],
    observations: 'Le mobilier a été livré en septembre 2026.',
    meuble: false,
    signatures: [
      {
        signataire: 'bailleur',
        nom: 'SCI Les Lilas',
        date: '2026-09-24',
        trace: 'data:image/svg+xml;base64,BAILLEUR',
      },
      {
        signataire: 'titulaire-1',
        nom: 'Julie Martin',
        date: '2026-09-24',
        trace: 'data:image/svg+xml;base64,JULIE',
      },
      {
        signataire: 'titulaire-2',
        nom: 'Karim Bernard',
        date: '2026-09-24',
        trace: 'data:image/svg+xml;base64,KARIM',
      },
    ],
  };
}

/** Assemble le document imprimé depuis un brouillon. */
function document(
  b: BrouillonInventaire = brouillon(),
  extra: Partial<Parameters<typeof contenuInventaireDepuis>[0]> = {},
): string {
  return rendreInventaire(
    contenuInventaireDepuis({
      type: b.type,
      dateInventaire: b.dateInventaire!,
      etabliLe: '2026-09-24',
      lieu: 'Paris',
      logement: LOGEMENT,
      bailleur: BAILLEUR,
      locataires: LOCATAIRES,
      locatairesIds: ['titulaire-1', 'titulaire-2'],
      mandataire: b.mandataire,
      bail: BAIL,
      pieces: b.pieces,
      observations: b.observations,
      signatures: b.signatures,
      meuble: b.meuble,
      dateEntree: b.dateEntree,
      // Les réserves viennent du **domaine**, pas d'une liste écrite dans le
      // test : c'est la vraie chaîne qu'on éprouve, et non un exemple.
      reserves: avertissementsDeLInventaire(b),
      ...extra,
    }),
  );
}

/** Un document de sortie, mis en regard de son inventaire d'entrée. */
function documentDeSortie(
  entree: BrouillonInventaire,
  sortie: BrouillonInventaire,
  extra: Partial<Parameters<typeof contenuInventaireDepuis>[0]> = {},
): string {
  const comparaison = comparerInventaire(entree.pieces ?? [], sortie.pieces ?? []);
  return document(
    { ...sortie, type: 'sortie', dateEntree: entree.dateInventaire },
    { comparaison, ...extra },
  );
}

/** Une photo imprimable, indexée par identifiant. */
function photo(id: string, donnees: string, legende: string) {
  return { [id]: { id, donnees, legende } };
}

// ---------------------------------------------------------------------------
// Les sections
// ---------------------------------------------------------------------------

test('les onze sections d’un inventaire d’entrée s’impriment, dans l’ordre', () => {
  const html = document();

  const titres = sectionsInventaire('entree').map((s) => s.titre);
  assert.equal(titres.length, 11);
  assert.equal(sectionsNumerotees(html), 11);

  let precedent = -1;
  titres.forEach((titre, index) => {
    const position = rang(html, `${index + 1}.</span> ${titre}</h2>`);
    assert.ok(position > precedent, `la section « ${titre} » n’est pas à son rang`);
    precedent = position;
  });
});

test('un inventaire de sortie compte treize sections, les deux siennes au bon rang', () => {
  const sortie: BrouillonInventaire = {
    ...brouillon(),
    type: 'sortie',
    dateInventaire: '2027-02-04',
  };
  const html = documentDeSortie(brouillon(), sortie);

  const titres = sectionsInventaire('sortie').map((s) => s.titre);
  assert.equal(titres.length, 13);
  assert.equal(sectionsNumerotees(html), 13);

  titres.forEach((titre, index) => {
    assert.notEqual(
      rang(html, `${index + 1}.</span> ${titre}</h2>`),
      -1,
      `la section « ${titre} » n’est pas au rang ${index + 1}`,
    );
  });

  // La référence à l'entrée se lit juste après le bail, dont elle dépend ; les
  // évolutions viennent après la description, qu'elles mettent en regard, et
  // avant la synthèse, qu'elles nourrissent.
  assert.ok(rang(html, 'Le bail de référence') < rang(html, "L'inventaire du mobilier d'entrée"));
  assert.ok(
    rang(html, "L'inventaire du mobilier d'entrée") < rang(html, 'Le mobilier obligatoire'),
  );
  assert.ok(rang(html, 'Le mobilier, pièce par pièce') < rang(html, 'Évolutions depuis l’entrée'));
  assert.ok(rang(html, 'Évolutions depuis l’entrée') < rang(html, 'Synthèse'));
});

test('le document nomme sa nature, son logement et sa date', () => {
  const html = document();
  const nature = LIBELLE_TYPE_INVENTAIRE.entree;

  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.ok(lisible(html).includes(`<title>${nature} — Appartement 1</title>`));
  assert.ok(lisible(html).includes(`<h1>${nature}</h1>`));
  assert.ok(lisible(html).includes('Appartement 1 — établi à Paris'));
  assert.ok(lisible(html).includes('Établi le<br />24 septembre 2026'));
  // Le cadre du document est dit, et il ne promet rien de plus que les sources.
  assert.ok(lisible(html).includes('destiné à être joint au contrat de location'));
  // Les styles du constat sont repris, et le document porte ceux de l'inventaire.
  assert.ok(html.includes('.e-section'));
  assert.ok(html.includes('.e-evol-quantite'));
});

// ---------------------------------------------------------------------------
// Le mobilier
// ---------------------------------------------------------------------------

test('le mobilier s’imprime pièce par pièce, chaque meuble sous sa pièce', () => {
  const pieces = sectionDuTitre(document(), 'Le mobilier, pièce par pièce');

  assert.ok(rang(pieces, 'Séjour') < rang(pieces, 'Canapé'));
  assert.ok(rang(pieces, 'Canapé') < rang(pieces, 'Table basse'));
  assert.ok(rang(pieces, 'Table basse') < rang(pieces, 'Chambre'));
  assert.ok(rang(pieces, 'Chambre') < rang(pieces, 'Lit 140'));
});

test('une quantité non comptée s’imprime « quantité non comptée », jamais un nombre', () => {
  const html = document({
    ...brouillon(),
    pieces: [piece('Séjour', [meuble('Canapé', undefined, 'bon', 'm1')])],
  });
  const pieces = sectionDuTitre(html, 'Le mobilier, pièce par pièce');

  assert.ok(pieces.includes('quantité non comptée'));
  // Un « 1 » par défaut compterait un meuble que personne n'a compté.
  assert.equal(compter(pieces, '<strong>'), 0, 'un nombre a été inventé pour une quantité absente');
});

test('une quantité de zéro exemplaire s’imprime comme un zéro, et non comme un vide', () => {
  const html = document({
    ...brouillon(),
    pieces: [piece('Séjour', [meuble('Chaise', 0, 'bon', 'm1')])],
  });
  const pieces = sectionDuTitre(html, 'Le mobilier, pièce par pièce');

  // « 0 » a un sens, et un sens utile : il n'y en a plus. C'est ainsi qu'un
  // inventaire de sortie rapporte qu'une chaise a disparu, sans accuser.
  assert.ok(pieces.includes('<strong>0</strong>'));
  assert.equal(compter(pieces, 'quantité non comptée'), 0);
});

test('la photo d’un meuble s’imprime sous lui, avant la pièce suivante', () => {
  const avecPhoto: BrouillonInventaire = {
    ...brouillon(),
    pieces: [
      piece(
        'Séjour',
        [
          meuble('Canapé', 1, 'bon', 'm1', [
            { id: 'ph1', donnees: 'data:image/png;base64,CANAPE', legende: 'Canapé, vue de face' },
          ]),
        ],
        'pi1',
      ),
      piece('Chambre', [meuble('Lit 140', 1, 'neuf', 'm1')], 'pi2'),
    ],
  };

  const html = document(avecPhoto, {
    photos: photo('ph1', 'data:image/png;base64,CANAPE', 'Canapé, vue de face'),
  });
  const pieces = sectionDuTitre(html, 'Le mobilier, pièce par pièce');

  assert.ok(rang(pieces, 'Canapé') < rang(pieces, 'CANAPE'));
  assert.ok(rang(pieces, 'CANAPE') < rang(pieces, 'Chambre'));
  assert.ok(pieces.includes('Canapé, vue de face'));
});

test('une photo illisible le dit, au lieu d’imprimer une image cassée', () => {
  const html = document(brouillon(), {
    pieces: [
      piece('Séjour', [
        meuble('Canapé', 1, 'bon', 'm1', [{ id: 'ph1', donnees: '', legende: 'Canapé' }]),
      ]),
    ],
    photos: photo('ph1', '', 'Canapé'),
  });

  assert.ok(lisible(html).includes('Photo illisible'));
  assert.equal(compter(html, '<img src=""'), 0, 'une image vide a été imprimée');
});

// ---------------------------------------------------------------------------
// Le mobilier obligatoire
// ---------------------------------------------------------------------------

/** Un mobilier qui couvre les onze éléments obligatoires, un par élément. */
function mobilierComplet(): PieceInventaire[] {
  return [
    piece(
      'Toutes pièces',
      ELEMENTS_MEUBLE_OBLIGATOIRES.map((e, index) =>
        meuble(`${e.mots[0]} (${e.rang})`, 1, 'bon', `m${index + 1}`),
      ),
      'pi1',
    ),
  ];
}

test('la liste légale imprime les onze éléments, avec leur rang', () => {
  const html = document({ ...brouillon(), pieces: mobilierComplet(), meuble: true });
  const liste = sectionDuTitre(html, 'Le mobilier obligatoire d’un logement meublé');

  for (const element of ELEMENTS_MEUBLE_OBLIGATOIRES) {
    assert.ok(
      liste.includes(lisible(element.libelle)),
      `l’élément ${element.rang} n’est pas imprimé mot pour mot`,
    );
    assert.ok(liste.includes(element.rang), `le rang ${element.rang} n’est pas imprimé`);
  }
  // L'orthographe du Journal officiel est conservée : « Etagères » sans accent.
  assert.ok(liste.includes('Etagères de rangement'));
});

test('un élément obligatoire absent est signalé quand le logement est déclaré meublé', () => {
  const html = document({
    ...brouillon(),
    meuble: true,
    pieces: [piece('Séjour', [meuble('Canapé', 1, 'bon')])],
  });
  const liste = sectionDuTitre(html, 'Le mobilier obligatoire d’un logement meublé');

  assert.ok(liste.includes('non trouvé dans cet inventaire'));
  assert.ok(liste.includes('n’ont pas été trouvés dans cet inventaire'));
  assert.ok(liste.includes('ne dit pas que le logement n’est pas meublé'));
});

test('un mobilier complet n’est pas signalé, même déclaré meublé', () => {
  const html = document({ ...brouillon(), pieces: mobilierComplet(), meuble: true });
  const liste = sectionDuTitre(html, 'Le mobilier obligatoire d’un logement meublé');

  assert.equal(
    compter(liste, 'n’ont pas été trouvés dans cet inventaire'),
    0,
    'un mobilier complet a été signalé comme incomplet',
  );
  assert.equal(compter(liste, 'non trouvé dans cet inventaire'), 0);
});

test('le même manque n’est pas signalé quand le logement n’est pas déclaré meublé', () => {
  const html = document({
    ...brouillon(),
    meuble: false,
    pieces: [piece('Séjour', [meuble('Canapé', 1, 'bon')])],
  });
  const liste = sectionDuTitre(html, 'Le mobilier obligatoire d’un logement meublé');

  // Un logement vide n'est pas un logement non meublé : la déclaration du
  // bailleur est la seule chose que l'application sache, et elle la dit.
  assert.equal(compter(liste, 'n’ont pas été trouvés dans cet inventaire'), 0);
  assert.ok(liste.includes('Le logement n’est pas déclaré loué meublé'));
});

// ---------------------------------------------------------------------------
// La synthèse
// ---------------------------------------------------------------------------

test('la synthèse compte les exemplaires et signale ce qui reste à constater', () => {
  const html = document({
    ...brouillon(),
    pieces: [
      piece('Séjour', [
        meuble('Canapé', 1, 'bon', 'm1'),
        meuble('Chaise', 4, 'bon', 'm2'),
        // Ni compté, ni constaté : le document le dit, et refuse de l'établir.
        meuble('Table', undefined, undefined, 'm3'),
      ]),
    ],
  });
  const synthese = sectionDuTitre(html, 'Synthèse');

  assert.ok(synthese.includes('<th>Exemplaires comptés</th><td>5</td>'));
  assert.ok(synthese.includes('<th>Meubles décrits</th><td>3</td>'));
  assert.ok(synthese.includes('<th>Meubles constatés</th><td>2</td>'));
  assert.ok(synthese.includes('1 meuble(s) n’ont pas de quantité comptée'));
  assert.ok(synthese.includes('ne peut pas être établi en l’état'));
});

test('la synthèse sépare les états constatés des états qui ne le sont pas', () => {
  const html = document({
    ...brouillon(),
    pieces: [
      piece('Séjour', [meuble('Canapé', 1, 'bon', 'm1'), meuble('Table', 1, 'non_verifie', 'm2')]),
    ],
  });
  const synthese = sectionDuTitre(html, 'Synthèse');

  // « Non vérifié » est renseigné, mais n'est pas un constat : le compte le
  // montre comme les autres, et le total des constatés ne l'inclut pas.
  assert.ok(synthese.includes('>1</strong> Bon état'));
  assert.ok(synthese.includes('>1</strong> Non vérifié'));
  assert.ok(synthese.includes('<th>Meubles constatés</th><td>1</td>'));
});

// ---------------------------------------------------------------------------
// La mise en regard des deux constats
// ---------------------------------------------------------------------------

test('la comparaison imprime les deux colonnes d’un meuble', () => {
  const entree = brouillon();
  const sortie: BrouillonInventaire = {
    ...brouillon(),
    type: 'sortie',
    dateInventaire: '2027-02-04',
    pieces: [
      piece('Séjour', [
        meuble('Canapé', 1, 'usage', 'm1', [
          { id: 'ph1', donnees: 'data:image/png;base64,CANAPESORTIE', legende: 'Canapé à la sortie' },
        ]),
        meuble('Table basse', 2, 'usage', 'm2'),
      ]),
      piece('Chambre', [meuble('Lit 140', 1, 'bon', 'm1')], 'pi2'),
    ],
  };

  const html = documentDeSortie(entree, sortie, {
    photos: photo('ph1', 'data:image/png;base64,CANAPESORTIE', 'Canapé à la sortie'),
  });
  const evolutions = sectionDuTitre(html, 'Évolutions depuis l’entrée');

  assert.ok(evolutions.includes('<th>Entrée</th><th>Sortie</th>'));
  // Le canapé est passé de bon état à l'état d'usage : une évolution constatée.
  assert.ok(evolutions.includes('1 évolution(s) constatée(s)'));
  assert.ok(evolutions.includes('États constatés qui diffèrent'));
  assert.ok(evolutions.includes('Quantités qui diffèrent'));
  // Les deux colonnes d'une paire portent leur date : sans elle, le lecteur ne
  // saurait pas laquelle des deux photos est celle de l'entrée.
  assert.ok(
    rang(evolutions, 'Entrée du 24 septembre 2026') < rang(evolutions, 'Sortie du 4 février 2027'),
  );
  // La quantité et l'état s'impriment d'un seul tenant, séparés par un tiret
  // cadratin. Le libellé vient du domaine : `etats.ts` écrit « État d'usage »
  // avec une apostrophe **droite**, que le document rend `&#39;` — la retaper
  // ici avec une apostrophe typographique ferait échouer un document juste.
  assert.ok(lisible(evolutions).includes(`1 × — ${libelleEtat('usage')}`));
});

test('une quantité non comptée d’un côté ne s’imprime pas comme un zéro', () => {
  const entree = brouillon();
  const sortie: BrouillonInventaire = {
    ...brouillon(),
    type: 'sortie',
    dateInventaire: '2027-02-04',
    pieces: [
      piece('Séjour', [
        meuble('Canapé', undefined, 'bon', 'm1'),
        meuble('Table basse', 2, 'usage', 'm2'),
      ]),
      piece('Chambre', [meuble('Lit 140', 1, 'bon', 'm1')], 'pi2'),
    ],
  };

  const html = documentDeSortie(entree, sortie);
  const evolutions = sectionDuTitre(html, 'Évolutions depuis l’entrée');

  // Le meuble n'a pas été compté à la sortie : la cellule le dit. Annoncer un
  // écart de quantité serait une accusation gratuite — personne n'a regardé.
  assert.ok(evolutions.includes('quantité non comptée'));
  assert.ok(evolutions.includes('Meubles dont la condition ne se compare pas'));
  assert.equal(compter(evolutions, '<th>Quantités qui diffèrent</th><td>0</td>'), 1);
});

test('les deux colonnes d’une paire résolvent contre deux index distincts', () => {
  const entree: BrouillonInventaire = {
    ...brouillon(),
    pieces: [
      piece('Séjour', [
        meuble('Canapé', 1, 'bon', 'm1', [
          { id: 'ph1', donnees: 'data:image/png;base64,PHOTOENTREE', legende: 'Entrée' },
        ]),
      ]),
    ],
  };
  const sortie: BrouillonInventaire = {
    ...brouillon(),
    type: 'sortie',
    dateInventaire: '2027-02-04',
    pieces: [
      piece('Séjour', [
        meuble('Canapé', 1, 'usage', 'm1', [
          { id: 'ph1', donnees: 'data:image/png;base64,PHOTOSORTIE', legende: 'Sortie' },
        ]),
      ]),
    ],
  };

  const html = documentDeSortie(entree, sortie, {
    // Les deux documents numérotent leurs photos `ph1` : c'est précisément ce
    // qui rend un index commun dangereux.
    photos: photo('ph1', 'data:image/png;base64,PHOTOSORTIE', 'Sortie'),
    photosEntree: photo('ph1', 'data:image/png;base64,PHOTOENTREE', 'Entrée'),
  });
  const evolutions = sectionDuTitre(html, 'Évolutions depuis l’entrée');

  // Dans la mise en regard, une seule occurrence de chaque image, et chacune de
  // son côté : celle de l'entrée avant l'intitulé de la sortie, celle de la
  // sortie après.
  assert.equal(compter(evolutions, 'PHOTOENTREE'), 1, 'la photo d’entrée est imprimée deux fois');
  assert.equal(compter(evolutions, 'PHOTOSORTIE'), 1, 'la photo de sortie est imprimée deux fois');
  assert.ok(
    rang(evolutions, 'PHOTOENTREE') < rang(evolutions, 'Sortie du 4 février 2027'),
    'la photo d’entrée s’est imprimée dans la colonne de sortie',
  );
  assert.ok(rang(evolutions, 'Sortie du 4 février 2027') < rang(evolutions, 'PHOTOSORTIE'));
});

test('sans inventaire d’entrée relu, la section le dit et n’imprime aucun tableau', () => {
  const sortie: BrouillonInventaire = {
    ...brouillon(),
    type: 'sortie',
    dateInventaire: '2027-02-04',
  };
  const html = document(sortie, { dateEntree: undefined, comparaison: undefined });
  const evolutions = sectionDuTitre(html, 'Évolutions depuis l’entrée');

  assert.ok(evolutions.includes('n’a pas pu être relu'));
  assert.ok(evolutions.includes('reste consultable dans le dossier du logement'));
  // Inventer un tableau comparatif que rien n'a rempli serait le pire des deux
  // mondes : une section obligatoire qui affirme sans constater.
  assert.equal(compter(evolutions, 'États constatés qui diffèrent'), 0);
  assert.equal(compter(evolutions, '<table'), 0);
});

test('la section des évolutions rappelle qu’elle n’impute rien au locataire', () => {
  const sortie: BrouillonInventaire = {
    ...brouillon(),
    type: 'sortie',
    dateInventaire: '2027-02-04',
  };
  const html = documentDeSortie(brouillon(), sortie);
  const evolutions = sectionDuTitre(html, 'Évolutions depuis l’entrée');

  assert.ok(evolutions.includes('ne qualifie aucun écart'));
  assert.ok(evolutions.includes('n’impute aucune dégradation au locataire'));
});

// ---------------------------------------------------------------------------
// Signatures, sources, échappement
// ---------------------------------------------------------------------------

test('les signatures s’apparient par identifiant, jamais par rang', () => {
  const html = document();
  const signatures = sectionDuTitre(html, 'Signatures');

  assert.ok(rang(signatures, 'SCI Les Lilas') < rang(signatures, 'Julie Martin'));
  assert.ok(rang(signatures, 'Julie Martin') < rang(signatures, 'Karim Bernard'));
  assert.equal(compter(signatures, 'data:image/svg+xml;base64,JULIE'), 1);
  assert.ok(signatures.includes('alt="Signature de Julie Martin"'));
  // La mention qui écarte la signature manuscrite certifiée est imprimée : une
  // signature tracée au doigt n'est pas une signature électronique qualifiée, et
  // le document ne doit pas la présenter comme telle.
  assert.ok(signatures.includes('tracées au doigt'));
  assert.ok(signatures.includes('ne constituent pas une signature électronique qualifiée'));
});

test('un signataire attendu qui n’a pas signé figure quand même', () => {
  const html = document({ ...brouillon(), signatures: [] });
  const signatures = sectionDuTitre(html, 'Signatures');

  assert.ok(signatures.includes('Julie Martin'));
  assert.ok(signatures.includes('Karim Bernard'));
  assert.ok(signatures.includes('Non signé'));
  assert.equal(compter(signatures, '<img src="data:image/svg+xml'), 0);
});

test('un nom de meuble portant un guillemet n’échappe pas du document', () => {
  const html = document(
    {
      ...brouillon(),
      pieces: [
        piece('Séjour', [
          meuble('Fauteuil "club" <script>', 1, 'bon', 'm1', [
            { id: 'ph1', donnees: 'data:image/png;base64,FAUTEUIL', legende: 'Un "club"' },
          ]),
        ]),
      ],
    },
    { photos: photo('ph1', 'data:image/png;base64,FAUTEUIL', 'Un "club"') },
  );

  // Le contrôle porte sur la chaîne **brute** : c'est le seul endroit où l'on
  // veut savoir que le balisage saisi n'est pas interprété.
  assert.equal(html.split('<script>').length - 1, 0, 'le balisage saisi a été imprimé tel quel');
  assert.equal(html.split('&lt;script&gt;').length - 1, 1);
  assert.ok(html.includes('alt="Un &quot;club&quot;"'));
  // Et ce que le lecteur voit est bien le nom qu'il a saisi.
  assert.ok(lisible(html).includes('Fauteuil "club" <script>'));
});

test('les sources s’impriment, avec la date à laquelle elles ont été lues', () => {
  const sources = sectionDuTitre(document(), 'Sources');

  assert.ok(sources.includes('Décret n° 2015-981 du 31 juillet 2015, article 2'));
  assert.ok(sources.includes('Loi n° 89-462 du 6 juillet 1989, article 25-4'));
  assert.ok(sources.includes('Décret n° 2016-382 du 30 mars 2016, article 4'));
  assert.ok(sources.includes('consulté le 24 septembre 2026'));
});

test('les réserves du domaine sont imprimées, pour que le document dise ses limites', () => {
  const html = document({
    ...brouillon(),
    pieces: [piece('Séjour', [meuble('Canapé', 1, 'non_verifie', 'm1')])],
  });

  assert.ok(lisible(html).includes('marqués « non vérifié »'));
  assert.ok(lisible(html).includes('d’autant plus contestable'));
});

test('la liste des pièces par défaut s’imprime sans trou, et sans rien inventer', () => {
  const pieces = piecesInitialesInventaire('appartement');
  const html = document({ ...brouillon(), pieces });
  const corps = sectionDuTitre(html, 'Le mobilier, pièce par pièce');

  // Chaque pièce et chaque meuble proposés sont imprimés, et aucun ne porte de
  // quantité ni d'état : la liste est un point de départ, pas un constat.
  for (const p of pieces) {
    assert.ok(corps.includes(p.nom), `la pièce « ${p.nom} » n’est pas imprimée`);
    for (const m of p.meubles) {
      assert.ok(corps.includes(m.nom), `le meuble « ${m.nom} » n’est pas imprimé`);
    }
  }
  assert.equal(compter(corps, '<strong>'), 0, 'un nombre a été inventé dans la liste par défaut');
  assert.ok(corps.includes('quantité non comptée'));
});

test('le contenu assemblé ne porte que ce qui a été saisi', () => {
  const contenu: ContenuInventaire = contenuInventaireDepuis({
    type: 'entree',
    dateInventaire: '2026-09-24',
    etabliLe: '2026-09-24',
    logement: LOGEMENT,
    bailleur: BAILLEUR,
    locataires: LOCATAIRES,
    bail: BAIL,
  });

  assert.deepEqual(contenu.pieces, []);
  assert.equal(contenu.lieu, '');
  assert.equal(contenu.observations, '');
  assert.equal(contenu.meuble, false);
  assert.deepEqual(
    contenu.signataires.map((s) => s.id),
    ['bailleur', 'titulaire-1', 'titulaire-2'],
  );
});

test('la dérivation d’une sortie ne recopie aucun constat d’entrée', () => {
  // Le document de sortie se construit sur les identifiants de l'entrée, et sur
  // eux seuls : reprendre une quantité ou un état ferait signer au locataire un
  // constat qu'il n'a pas fait.
  const entree = brouillon();
  const derivee = sortieInventaireDepuisLEntree(entree);

  assert.deepEqual(
    derivee.pieces.map((p) => p.id),
    (entree.pieces ?? []).map((p) => p.id),
  );
  assert.ok(derivee.pieces.every((p) => p.meubles.every((m) => m.quantite === undefined)));
  assert.ok(derivee.pieces.every((p) => p.meubles.every((m) => m.etat === undefined)));
});

test('un meuble vide de la liste par défaut ne réserve aucun identifiant de photo', () => {
  // Le rappel de la règle qui a coûté un défaut : les identifiants de photos
  // doivent être uniques dans **tout** le document, et un meuble qui n'a pas de
  // photo ne doit pas en réserver une.
  const pieces = piecesInitialesInventaire('appartement');
  const vide = meubleVide('Bureau', pieces.flatMap((p) => p.meubles.map((m) => m.id)));

  assert.equal(vide.photos.length, 0);
  assert.ok(!pieces.some((p) => p.meubles.some((m) => m.id === vide.id)));
});
