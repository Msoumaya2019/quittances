/**
 * Le rendu de l'état des lieux.
 *
 * Un document de plusieurs pages ne se relit pas à l'œil sur un téléphone : on
 * vérifie donc ici ce qui est **imprimé**, sur la chaîne HTML elle-même. Chaque
 * contrôle porte sur une phrase ou une structure précise, jamais sur la
 * présence d'un mot quelque part.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ETATS_ELEMENT,
  SECTIONS_EDL,
  avertissementsDeLEdl,
  pieceVide,
  sectionsEdl,
} from '../src/domain/etat-des-lieux.ts';
import type { BrouillonEdl, EtatElement } from '../src/domain/etat-des-lieux.ts';
import {
  LARGEUR_PHOTO_MM,
  contenuEdlDepuis,
  rendreEtatDesLieux,
} from '../src/pdf/etat-des-lieux.ts';
import type { ContenuEdl } from '../src/pdf/etat-des-lieux.ts';

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
  { nom: 'Martin', prenom: 'Julie', telephone: null, email: null, dateNaissance: '1990-04-17', lieuNaissance: 'Lyon' },
  { nom: 'Bernard', prenom: 'Karim', telephone: null, email: null, dateNaissance: null, lieuNaissance: null },
];

const BAIL = {
  dateEntree: '2026-09-01',
  dateSortie: null,
  loyer: 85000,
  charges: 4500,
  depotGarantie: 85000,
  jourEcheance: 5,
};

/** Une pièce dont tous les éléments portent un état. */
function piece(nom: string, etat: EtatElement, id = 'p1') {
  const base = pieceVide(nom, []);
  return { ...base, id, elements: base.elements.map((e) => ({ ...e, etat })) };
}

/** Un brouillon complet, à partir duquel on assemble un document. */
function brouillon(): BrouillonEdl {
  return {
    logementId: 'logement-1',
    bailId: 'bail-1',
    type: 'entree',
    dateEdl: '2026-09-24',
    pieces: [piece('Séjour', 'bon', 'p1'), piece('Cuisine', 'usage', 'p2')],
    compteurs: [{ id: 'c1', type: 'electricite', valeur: '007412', precision: 'Sous l’escalier' }],
    cles: [{ id: 'k1', libelle: 'Clé', destination: 'Porte d’entrée', quantite: 2 }],
    observations: 'Le logement a été repeint en 2025.',
    compteursIndividuels: true,
    signatures: [
      { signataire: 'bailleur', nom: 'SCI Les Lilas', date: '2026-09-24', trace: 'data:image/svg+xml;base64,BAILLEUR' },
      { signataire: 'titulaire-1', nom: 'Julie Martin', date: '2026-09-24', trace: 'data:image/svg+xml;base64,JULIE' },
      { signataire: 'titulaire-2', nom: 'Karim Bernard', date: '2026-09-24', trace: 'data:image/svg+xml;base64,KARIM' },
    ],
  };
}

/** Assemble le document imprimé depuis un brouillon. */
function document(b: BrouillonEdl = brouillon(), extra: Partial<Parameters<typeof contenuEdlDepuis>[0]> = {}) {
  return rendreEtatDesLieux(
    contenuEdlDepuis({
      type: b.type,
      dateEdl: b.dateEdl!,
      etabliLe: '2026-09-24',
      lieu: 'Paris',
      logement: LOGEMENT,
      bailleur: BAILLEUR,
      locataires: LOCATAIRES,
      locatairesIds: ['titulaire-1', 'titulaire-2'],
      mandataire: b.mandataire,
      bail: BAIL,
      compteurs: b.compteurs,
      cles: b.cles,
      pieces: b.pieces,
      observations: b.observations,
      signatures: b.signatures,
      compteursIndividuels: b.compteursIndividuels,
      dateEntree: b.dateEntree,
      nouveauDomicile: b.nouveauDomicile,
      // Les réserves viennent du **domaine**, pas d'une liste écrite dans le
      // test : c'est la vraie chaîne qu'on éprouve, et non un exemple.
      reserves: avertissementsDeLEdl(b),
      ...extra,
    }),
  );
}

/** Le texte visible, feuille de style retirée. */
function visible(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/g, '');
}

/**
 * Le texte **tel qu'il se lit** : feuille de style retirée, entités décodées.
 *
 * Le document échappe le texte saisi — `'` devient `&#39;`, `&` devient
 * `&amp;` — et c'est ce qu'il doit faire. Comparer sur le HTML brut
 * obligerait à écrire les apostrophes en entités dans chaque assertion, ce qui
 * rendrait les tests illisibles et cacherait le fait qu'on vérifie bien une
 * phrase française.
 */
function texte(html: string): string {
  return visible(html)
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** La portion du document consacrée aux signatures, et elle seule. */
function blocSignatures(html: string): string {
  const debut = html.indexOf('Signatures</h2>');
  assert.ok(debut >= 0, 'la section des signatures doit exister');
  const fin = html.indexOf('Sources</h2>', debut);
  return html.slice(debut, fin >= 0 ? fin : undefined);
}

/**
 * Les couples « nom imprimé / tracé de signature » de la section des signatures.
 *
 * On lit chaque bloc plutôt que de comparer des positions dans tout le
 * document : c'est l'**appariement** qu'on veut prouver, et non un ordre
 * fortuit. Dans la mise en page, le tracé est au-dessus du nom ; ce qui compte
 * est qu'ils soient dans le même bloc.
 */
function couplesSignature(html: string): { nom: string; trace: string }[] {
  const bloc = blocSignatures(html);
  const morceaux = bloc.split('<div class="e-signature">').slice(1);
  return morceaux.map((morceau) => {
    const trace = /<img src="([^"]+)"/.exec(morceau)?.[1] ?? '';
    const nom = /<strong>([^<]*)<\/strong>/.exec(morceau)?.[1] ?? '';
    return { nom, trace };
  });
}

/** La position d'un motif, en levant si absent. */
function position(html: string, motif: string): number {
  const index = html.indexOf(motif);
  assert.ok(index >= 0, `« ${motif} » doit figurer dans le document`);
  return index;
}

// ---------------------------------------------------------------------------
// Les douze sections
// ---------------------------------------------------------------------------

test('le document imprime les douze sections, numérotées', () => {
  const html = texte(document());
  for (const [index, section] of SECTIONS_EDL.entries()) {
    assert.ok(
      html.includes(`${index + 1}.</span> ${section.titre}`),
      `la section ${index + 1} « ${section.titre} » doit être imprimée et numérotée`,
    );
  }
  assert.ok(!html.includes('13.</span>'), 'il ne doit pas y avoir de treizième section');
});

test('l’ordre des sections imprimées est celui du domaine', () => {
  // Changer l'ordre change ce que le bailleur lit en premier : c'est une
  // décision de domaine, pas de mise en page.
  const html = texte(document());
  const positions = SECTIONS_EDL.map((s) => position(html, `${s.titre}</h2>`));
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(positions[i] > positions[i - 1], `« ${SECTIONS_EDL[i].titre} » doit suivre la précédente`);
  }
});

test('un état des lieux de sortie imprime quinze sections', () => {
  const html = texte(
    document({ ...brouillon(), type: 'sortie', entreeId: 'edl-1', dateEntree: '2025-09-01' }),
  );
  for (const section of sectionsEdl('sortie')) {
    assert.ok(html.includes(`${section.titre}</h2>`), `« ${section.titre} » doit être imprimée`);
  }
  assert.ok(html.includes('16.</span>') === false, 'quinze sections, pas seize');
});

test('une section sans contenu le dit, au lieu de disparaître', () => {
  // Une section obligatoire qui s'évapore laisse croire qu'elle a été traitée.
  const html = texte(document({ ...brouillon(), compteurs: [], cles: [], observations: '' }));
  assert.ok(html.includes('Aucun relevé de compteur'));
  assert.ok(html.includes('Aucune clé'));
  assert.ok(html.includes('Aucune observation générale'));
});

test('toutes les sections déclarées par le domaine sont traitées par le rendu', () => {
  // C'est le contrôle qui relie les deux modules. Une section ajoutée au
  // domaine et oubliée ici disparaîtrait du document **sans un mot**, et
  // l'état des lieux ne comporterait plus une mention obligatoire.
  for (const type of ['entree', 'sortie'] as const) {
    const html = texte(
      document(
        type === 'sortie'
          ? { ...brouillon(), type: 'sortie', entreeId: 'e1', dateEntree: '2025-09-01' }
          : brouillon(),
      ),
    );
    assert.ok(
      !html.includes('Section non reconnue'),
      `toutes les sections de « ${type} » doivent être traitées par le rendu`,
    );
  }
});

test('une section que le rendu ne connaît pas est dite, jamais sautée', () => {
  // Le cas se produira le jour où une section sera ajoutée au domaine sans son
  // équivalent ici. La faire disparaître laisserait croire que le document est
  // complet, alors qu'il manquerait une mention obligatoire.
  //
  // `SECTIONS_EDL` est la liste que `sectionsEdl('entree')` rend telle quelle :
  // on y ajoute une section inconnue, puis on la retire. Le retrait est dans un
  // `finally` — une constante partagée laissée modifiée ferait échouer les
  // tests suivants pour une raison qui n'existe pas.
  const temoin = {
    valeur: 'section_du_futur',
    titre: 'Section du futur',
    exigence: 'Une exigence que cette version ne sait pas imprimer.',
    fondement: 'Exigence propre à l’application',
  };
  SECTIONS_EDL.push(temoin);
  try {
    const html = texte(document());
    assert.ok(html.includes('Section du futur'), 'la section figure, avec son titre');
    assert.ok(
      html.includes('Section non reconnue'),
      'et le document dit qu’il ne sait pas la remplir',
    );
    assert.ok(html.includes('section_du_futur'), 'en nommant la section');
  } finally {
    const rang = SECTIONS_EDL.indexOf(temoin);
    if (rang >= 0) SECTIONS_EDL.splice(rang, 1);
  }
});

// ---------------------------------------------------------------------------
// Les états
// ---------------------------------------------------------------------------

test('chaque état imprime son libellé, jamais seulement une couleur', () => {
  // Un état des lieux photocopié en noir et blanc doit rester lisible :
  // « Mauvais état » ne peut pas dépendre d'un fond rouge.
  for (const etat of ETATS_ELEMENT) {
    const html = texte(document({ ...brouillon(), pieces: [piece('Séjour', etat.valeur, 'p1')] }));
    assert.ok(
      html.includes(`>${etat.libelle}</span>`),
      `l'état « ${etat.libelle} » doit être imprimé en toutes lettres`,
    );
  }
});

test('un élément sans état imprime « Non renseigné », et non un état par défaut', () => {
  const base = pieceVide('Séjour', []);
  const html = texte(document({ ...brouillon(), pieces: [{ ...base, id: 'p1' }] }));
  assert.ok(html.includes('Non renseigné'));
  for (const etat of ETATS_ELEMENT) {
    assert.ok(
      !html.includes(`>${etat.libelle}</span>`),
      `« ${etat.libelle} » ne doit pas apparaître : rien n'a été constaté`,
    );
  }
});

// ---------------------------------------------------------------------------
// Les photos
// ---------------------------------------------------------------------------

test('une photo s’imprime sous son élément, et non dans une planche à la fin', () => {
  // C'est la règle centrale du document : un cahier de photos regroupé à la fin
  // obligerait le lecteur à faire l'aller-retour entre une ligne et une planche.
  const sejour = piece('Séjour', 'bon', 'p1');
  const cuisine = piece('Cuisine', 'usage', 'p2');
  const avecPhoto = {
    ...sejour,
    elements: sejour.elements.map((e, i) =>
      i === 0 ? { ...e, photos: [{ id: 'ph1', chemin: '/a.jpg', legende: 'Rayure sur le parquet', priseLe: '2026-09-24' }] } : e,
    ),
  };

  const html = visible(
    document(
      { ...brouillon(), pieces: [avecPhoto, cuisine] },
      {
        photos: {
          ph1: { id: 'ph1', donnees: 'data:image/jpeg;base64,PHOTO', legende: 'Rayure sur le parquet' },
        },
      },
    ),
  );

  const nomElement = position(html, avecPhoto.elements[0].nom);
  const photo = position(html, 'data:image/jpeg;base64,PHOTO');
  const elementSuivant = position(html, avecPhoto.elements[1].nom);
  const pieceSuivante = position(html, `${cuisine.nom}</h3>`);

  assert.ok(photo > nomElement, 'la photo vient après le nom de son élément');
  assert.ok(photo < elementSuivant, 'et avant l’élément suivant');
  assert.ok(photo < pieceSuivante, 'et avant la pièce suivante');
  assert.ok(html.includes('Rayure sur le parquet'), 'la légende est imprimée');
});

test('un élément et ses photos forment un bloc insécable', () => {
  // Une photo qui passe à la feuille suivante ne montre plus la ligne qu'elle
  // illustre.
  const html = document();
  assert.ok(
    /\.e-element\s*\{[^}]*break-inside:\s*avoid-page/.test(html),
    'l’élément doit porter break-inside: avoid-page',
  );
  assert.ok(
    /\.e-photo\s*\{[^}]*break-inside:\s*avoid-page/.test(html),
    'la photo aussi',
  );
});

test('une photo dont le fichier est illisible le dit, au lieu d’une image cassée', () => {
  const sejour = piece('Séjour', 'bon', 'p1');
  const avecPhoto = {
    ...sejour,
    elements: sejour.elements.map((e, i) =>
      i === 0 ? { ...e, photos: [{ id: 'ph1', chemin: '/absent.jpg', legende: 'Cave', priseLe: '2026-09-24' }] } : e,
    ),
  };
  const html = visible(
    document(
      { ...brouillon(), pieces: [avecPhoto] },
      { photos: { ph1: { id: 'ph1', donnees: '', legende: 'Cave' } } },
    ),
  );
  assert.ok(html.includes('Photo illisible'));
  assert.ok(html.includes('Cave'), 'la légende reste lisible');
});

test('une photo absente de la table n’imprime rien du tout', () => {
  // Ni image cassée, ni mention : il n'y a pas de photo, et le document ne
  // doit pas inventer qu'il en manque une.
  const sejour = piece('Séjour', 'bon', 'p1');
  const avecPhoto = {
    ...sejour,
    elements: sejour.elements.map((e, i) =>
      i === 0 ? { ...e, photos: [{ id: 'ph1', chemin: '/a.jpg', legende: '', priseLe: '2026-09-24' }] } : e,
    ),
  };
  const html = texte(document({ ...brouillon(), pieces: [avecPhoto] }));
  assert.ok(!html.includes('Photo illisible'));
});

test('les URI de données ne sont pas abîmées par l’échappement', () => {
  // Un `&` dans une URI de données la casse, et la photo disparaît du PDF sans
  // que rien ne le signale.
  const sejour = piece('Séjour', 'bon', 'p1');
  const avecPhoto = {
    ...sejour,
    elements: sejour.elements.map((e, i) =>
      i === 0 ? { ...e, photos: [{ id: 'ph1', chemin: '/a.jpg', legende: 'A & B', priseLe: '2026-09-24' }] } : e,
    ),
  };
  const html = document(
    { ...brouillon(), pieces: [avecPhoto] },
    { photos: { ph1: { id: 'ph1', donnees: 'data:image/jpeg;base64,AA+/B', legende: 'A & B' } } },
  );
  assert.ok(html.includes('src="data:image/jpeg;base64,AA+/B"'), 'l’URI doit être intacte');
  assert.ok(!/data:image\/jpeg;base64,[^"]*&/.test(html), 'aucune URI ne doit contenir d’esperluette');
});

test('une photo en portrait est ramenée dans une hauteur imprimable', () => {
  const sejour = piece('Séjour', 'bon', 'p1');
  const avecPhoto = {
    ...sejour,
    elements: sejour.elements.map((e, i) =>
      i === 0 ? { ...e, photos: [{ id: 'ph1', chemin: '/a.jpg', legende: '', priseLe: '2026-09-24' }] } : e,
    ),
  };
  const html = document(
    { ...brouillon(), pieces: [avecPhoto] },
    { photos: { ph1: { id: 'ph1', donnees: 'data:image/jpeg;base64,AAA', legende: '', largeur: 1000, hauteur: 4000 } } },
  );
  const largeur = /class="e-photo" style="width:(\d+)mm"/.exec(html);
  assert.ok(largeur, 'la photo doit porter une largeur calculée');
  assert.ok(Number(largeur![1]) > 0);
  assert.ok(
    Number(largeur![1]) < LARGEUR_PHOTO_MM,
    'une photo en portrait doit être plus étroite que le cadre, sans être étirée',
  );
});

// ---------------------------------------------------------------------------
// Les signatures
// ---------------------------------------------------------------------------

test('chaque signature est imprimée sous le nom de la personne qui a signé', () => {
  // C'est le contrôle le plus important de ce fichier. Une version antérieure
  // appariait les signatures par position : dès qu'une signature manquait, la
  // signature d'un colocataire se retrouvait sous le nom de l'autre. Un
  // document qui attribue une signature à la mauvaise personne est faux.
  const couples = couplesSignature(texte(document()));

  assert.deepEqual(
    couples.map((c) => c.nom),
    ['SCI Les Lilas', 'Julie Martin', 'Karim Bernard'],
    'les trois signataires figurent, dans l’ordre du bail',
  );
  assert.ok(couples[0].trace.endsWith('BAILLEUR'), 'le bailleur porte sa propre signature');
  assert.ok(couples[1].trace.endsWith('JULIE'), 'Julie porte la sienne');
  assert.ok(couples[2].trace.endsWith('KARIM'), 'Karim porte la sienne');
});

test('un locataire qui n’a pas signé figure quand même, avec la mention « Non signé »', () => {
  // C'est une information, pas un oubli : le document doit dire qui manque.
  const b = brouillon();
  b.signatures = [
    { signataire: 'bailleur', nom: 'SCI Les Lilas', date: '2026-09-24', trace: 'data:image/svg+xml;base64,BAILLEUR' },
    { signataire: 'titulaire-2', nom: 'Karim Bernard', date: '2026-09-24', trace: 'data:image/svg+xml;base64,KARIM' },
  ];
  const html = texte(document(b));
  const couples = couplesSignature(html);

  assert.deepEqual(
    couples.map((c) => c.nom),
    ['SCI Les Lilas', 'Julie Martin', 'Karim Bernard'],
    'Julie figure toujours',
  );
  // Julie n'a pas signé : son bloc ne porte aucun tracé. C'est exactement ce
  // que produisait l'appariement par position — sa signature se retrouvait sous
  // le nom de Julie.
  assert.equal(couples[1].trace, '', 'Julie n’a pas de tracé');
  assert.ok(couples[2].trace.endsWith('KARIM'), 'Karim porte la sienne');
  assert.ok(html.includes('Non signé'), 'et l’absence est dite');
});

test('un signataire attendu sans signature ne prend pas celle d’un autre', () => {
  const b = brouillon();
  // Seul le second locataire a signé.
  b.signatures = [
    { signataire: 'titulaire-2', nom: 'Karim Bernard', date: '2026-09-24', trace: 'data:image/svg+xml;base64,KARIM' },
  ];
  const couples = couplesSignature(texte(document(b)));

  // Le bailleur et Julie n'ont pas signé, et Karim garde la sienne : aucune
  // signature ne se décale d'un cran.
  assert.equal(couples[0].trace, '', 'le bailleur n’a pas de tracé');
  assert.equal(couples[1].trace, '', 'Julie non plus');
  assert.ok(couples[2].trace.endsWith('KARIM'), 'Karim conserve la sienne');
});

test('le document rappelle ce que valent les signatures', () => {
  const html = texte(document());
  assert.ok(html.includes('ne constituent pas une signature électronique qualifiée'));
  assert.ok(html.includes('Chaque partie conserve un exemplaire du document.'));
});

// ---------------------------------------------------------------------------
// Ce que le document affirme, et ce qu'il refuse d'affirmer
// ---------------------------------------------------------------------------

test('le document ne qualifie aucune évolution et n’impute rien au locataire', () => {
  // L'article 4 définit la vétusté comme l'usure du temps ou de l'usage normal.
  // Le document le rappelle, et rappelle qu'il ne tranche pas.
  const html = texte(document());
  assert.ok(html.includes('usage normal'));
  assert.ok(html.includes('n’impute aucune dégradation au locataire'));
});

test('un état des lieux d’entrée rappelle le délai de dix jours', () => {
  const html = texte(document());
  assert.ok(html.includes('Le locataire peut demander à compléter'));
  assert.ok(html.includes('dix jours'));
});

test('le nombre d’exemplaires suit le nombre de parties', () => {
  const html = texte(document());
  assert.ok(html.includes('3 — un pour le bailleur, un pour chacun des 2 locataire(s)'));
});

test('la synthèse sépare les états constatés des éléments sans état', () => {
  const html = texte(document({ ...brouillon(), pieces: [pieceVide('Séjour', [])] }));
  assert.ok(html.includes('ne portent aucun état'));
  assert.ok(html.includes('Éléments sans état'));
});

test('les réserves et avertissements sont imprimés', () => {
  const html = texte(document());
  assert.ok(html.includes('Aucune photo'), 'les avertissements du domaine sont imprimés');
});

test('les sources sont imprimées avec leur date de consultation', () => {
  const html = texte(document());
  assert.ok(html.includes('Décret n° 2016-382 du 30 mars 2016'));
  assert.ok(html.includes('consulté le 24 septembre 2026'));
});

// ---------------------------------------------------------------------------
// Robustesse
// ---------------------------------------------------------------------------

test('un texte saisi ne peut pas casser le document', () => {
  const base = pieceVide('<script>alert(1)</script>', []);
  const html = document({
    ...brouillon(),
    pieces: [{ ...base, id: 'p1' }],
    observations: 'Devis <b>faux</b> & « guillemets »',
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
});

test('aucun balisage en étoiles n’est imprimé', () => {
  // Le document échappe le texte saisi : « **gras** » s'imprimerait tel quel.
  // Le contrôle porte sur le texte visible, car un astérisque dans un
  // commentaire CSS ne s'imprime pas — et l'inclure ferait crier le contrôle
  // sur un défaut qui n'existe pas.
  for (const etat of ['entree', 'sortie'] as const) {
    const html = document(
      etat === 'sortie'
        ? { ...brouillon(), type: 'sortie', entreeId: 'e1', dateEntree: '2025-09-01' }
        : brouillon(),
    );
    const texte = visible(html);
    assert.ok(texte.length < html.length, `feuille de style introuvable pour ${etat}`);
    const asters = texte.match(/\*\*/g) ?? [];
    assert.equal(asters.length, 0, `balisage imprimé pour ${etat}`);
  }
});

test('un brouillon vide produit quand même un document, sans lever', () => {
  const html = document({ logementId: 'l', bailId: 'b', type: 'entree', dateEdl: '2026-09-24' });
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(visible(html).includes('Aucune pièce n’est décrite.'));
});

test('le document est en français et déclaré comme tel', () => {
  const html = document();
  assert.ok(html.includes('<html lang="fr">'));
  assert.ok(html.includes('charset="utf-8"'));
});

test('le titre du document nomme le logement et le type', () => {
  const html = texte(document());
  assert.ok(html.includes("<title>État des lieux d'entrée — Appartement 1</title>"));
});

test('les relevés de compteur impriment leur unité', () => {
  const html = texte(document());
  assert.ok(html.includes('007412'), 'les zéros de tête sont conservés');
  assert.ok(html.includes('kWh'), 'l’unité est imprimée');
  assert.ok(html.includes('Sous l’escalier'), 'la précision est imprimée');
});

test('les clés impriment leur quantité et leur destination', () => {
  const html = texte(document());
  assert.ok(html.includes('2 ×'), 'la quantité est imprimée');
  assert.ok(html.includes('Porte d’entrée'), 'la destination est imprimée');
});

test('les montants du bail sont imprimés en euros', () => {
  const html = texte(document());
  assert.ok(html.includes('850,00 €'), 'le loyer');
  assert.ok(html.includes('45,00 €'), 'les charges');
  assert.ok(html.includes('895,00 €'), 'le total');
});

test('une URI de photo qui porte un guillemet ne casse pas l’attribut', () => {
  // Défaut mesuré le 24 septembre 2026 : l’URI de données était écrite dans
  // l’attribut `src` **sans échappement**, alors que le tracé de signature du
  // bail, lui, était échappé. Une URI contenant un guillemet fermait donc
  // l’attribut, et Chromium imprimait le texte de remplacement — plus le
  // balisage restant — à la place de la photo.
  //
  // L’URI employée ici est celle qui a révélé le défaut : un SVG en ligne, dont
  // les attributs portent des guillemets.
  const uri = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg">x</svg>';
  const b = brouillon();
  // La photo doit être **rattachée à un élément** : une photo que rien ne
  // référence n’est jamais rendue, et le test passerait sans rien mesurer.
  const pieces = b.pieces ?? [];
  pieces[0].elements[0].photos = [
    { id: 'ph1', chemin: 'peu-importe', legende: 'Photo témoin', priseLe: '2026-09-24' },
  ];
  b.pieces = pieces;
  const html = document(b, {
    photos: { ph1: { id: 'ph1', donnees: uri, legende: 'Photo témoin' } },
  });

  assert.ok(
    html.includes('&quot;'),
    'l’URI doit être échappée : un guillemet nu fermerait l’attribut',
  );

  // Le contrôle qui tranche : ce que porte **réellement** l’attribut `src`.
  //
  // Compter les guillemets ou chercher le balisage ne dirait rien — le
  // document en porte partout, légitimement. On extrait donc la valeur de
  // l’attribut, et on exige qu’elle soit l’URI entière. Quand l’attribut casse,
  // le motif s’arrête au premier guillemet et la valeur se réduit à
  // `data:image/svg+xml;utf8,<svg xmlns=`.
  const src = /<img src="([^"]*)"/.exec(html)?.[1] ?? '';
  assert.equal(
    texte(src),
    uri,
    'l’attribut src doit porter l’URI entière, et non son début',
  );
});

test('le tracé de signature est échappé comme la photo', () => {
  // Deux documents, deux traitements du même genre de valeur : c’est ce
  // désaccord qui avait laissé passer le défaut. Le contrôle porte donc sur
  // les deux, dans le même fichier de test.
  const uri = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg">y</svg>';
  const b = brouillon();
  b.signatures = [{ signataire: 'bailleur', nom: 'SCI Les Lilas', date: '2026-09-24', trace: uri }];

  const html = document(b);
  const bloc = blocSignatures(html);
  assert.ok(bloc.includes('&quot;'), 'le tracé doit être échappé');

  const [couple] = couplesSignature(html);
  assert.equal(
    texte(couple.trace),
    uri,
    'l’attribut src de la signature doit porter le tracé entier',
  );
});
