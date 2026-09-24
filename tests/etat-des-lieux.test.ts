/**
 * Le domaine des états des lieux.
 *
 * Ces tests portent sur des **règles**, pas sur des écrans : ils tournent sous
 * `node --test`, sans émulateur. Chacun énonce ce qu'il protège, parce qu'un
 * test dont on ne sait plus ce qu'il défend finit par être ajusté au code au
 * lieu de l'inverse.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPTEURS,
  ETAPES_EDL,
  ETATS_ELEMENT,
  SECTIONS_EDL,
  SOURCES_EDL,
  ajouterElement,
  ajouterPhoto,
  avertissementsDeLEdl,
  elementsParDefaut,
  etapePrecedenteEdl,
  etapeSuivanteEdl,
  etatConstate,
  exemplairesNecessaires,
  manquesDeLEdl,
  manquesDeLEtapeEdl,
  numeroEtapeEdl,
  pieceVide,
  piecesInitiales,
  piecesParDefaut,
  presentationEtat,
  premierElementARenseigner,
  premierePieceARenseigner,
  reprendreBrouillonEdl,
  sectionsEdl,
  signatairesAttendusDeLEdl,
  syntheseEdl,
  titreDeLEdl,
  toutEnBonEtat,
  viderEtats,
} from '../src/domain/etat-des-lieux.ts';
import type { BrouillonEdl, EtatElement, PieceEdl } from '../src/domain/etat-des-lieux.ts';
import { dateCivileValide } from '../src/domain/period.ts';

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/** Une pièce dont tous les éléments portent le même état. */
function pieceRenseignee(nom: string, etat: EtatElement, id = 'p1'): PieceEdl {
  const piece = pieceVide(nom, []);
  return { ...piece, id, elements: piece.elements.map((e) => ({ ...e, etat })) };
}

/** Un brouillon complet et valide, qu'on dégrade ensuite champ par champ. */
function brouillonValide(): BrouillonEdl {
  return {
    logementId: 'logement-1',
    bailId: 'bail-1',
    type: 'entree',
    dateEdl: '2026-09-24',
    pieces: [pieceRenseignee('Séjour', 'bon', 'p1'), pieceRenseignee('Cuisine', 'usage', 'p2')],
    compteurs: [
      { id: 'c1', type: 'electricite', valeur: '007412', precision: '', },
      { id: 'c2', type: 'eau_froide', valeur: '001238', precision: '' },
    ],
    cles: [
      { id: 'k1', libelle: 'Clé', destination: 'Porte d’entrée', quantite: 2 },
      { id: 'k2', libelle: 'Badge', destination: 'Parking', quantite: 1 },
    ],
    observations: '',
    compteursIndividuels: true,
    signatures: [
      { signataire: 'bailleur', nom: 'A. Bailleur', date: '2026-09-24', trace: 'data:image/svg+xml;base64,AAA' },
      { signataire: 'titulaire-1', nom: 'M. Locataire', date: '2026-09-24', trace: 'data:image/svg+xml;base64,BBB' },
    ],
  };
}

const ATTENDUS = [
  { id: 'bailleur', nom: 'A. Bailleur' },
  { id: 'titulaire-1', nom: 'M. Locataire' },
];

// ---------------------------------------------------------------------------
// Les sept états
// ---------------------------------------------------------------------------

test('les sept états demandés existent, et exactement ceux-là', () => {
  assert.deepEqual(
    ETATS_ELEMENT.map((e) => e.libelle),
    [
      'Neuf',
      'Très bon état',
      'Bon état',
      "État d'usage",
      'Mauvais état',
      'Non vérifié',
      'Non applicable',
    ],
  );
});

test('« non vérifié » et « non applicable » ne sont pas des états constatés', () => {
  // C'est la distinction qui empêche le document d'annoncer un constat que
  // personne n'a fait. Si elle tombait, la synthèse compterait un élément non
  // regardé parmi les éléments décrits.
  for (const etat of ETATS_ELEMENT) {
    const attendu = etat.valeur !== 'non_verifie' && etat.valeur !== 'non_applicable';
    assert.equal(etatConstate(etat.valeur), attendu, `etatConstate(${etat.valeur})`);
  }
});

test('un état absent n’est pas un état constaté', () => {
  assert.equal(etatConstate(undefined), false);
  assert.equal(presentationEtat(undefined), null);
});

test('un état inconnu n’est pas présenté comme un état', () => {
  assert.equal(presentationEtat('excellent' as EtatElement), null);
});

// ---------------------------------------------------------------------------
// Le parcours
// ---------------------------------------------------------------------------

test('le parcours compte six étapes, et la première ne demande rien', () => {
  assert.equal(ETAPES_EDL.length, 6);
  assert.equal(ETAPES_EDL[0].valeur, 'logement');
  assert.equal(numeroEtapeEdl('logement'), 1);
  assert.equal(numeroEtapeEdl('signature'), 6);
});

test('les étapes s’enchaînent dans les deux sens, et s’arrêtent aux extrémités', () => {
  assert.equal(etapeSuivanteEdl('logement'), 'pieces');
  assert.equal(etapeSuivanteEdl('signature'), null);
  assert.equal(etapePrecedenteEdl('logement'), null);
  assert.equal(etapePrecedenteEdl('visite'), 'compteurs');
});

// ---------------------------------------------------------------------------
// Pièces et éléments proposés
// ---------------------------------------------------------------------------

test('une pièce inconnue reçoit des éléments plutôt que rien', () => {
  // Une pièce sans élément ne se décrit pas : le formulaire serait un cul-de-sac.
  const elements = elementsParDefaut('Pièce mystérieuse');
  assert.ok(elements.length > 0);
  assert.ok(elements.includes('Sol'));
});

test('les éléments proposés dépendent du nom de la pièce', () => {
  const cuisine = elementsParDefaut('Cuisine');
  assert.ok(cuisine.includes('Évier'), 'une cuisine a un évier');
  assert.ok(cuisine.includes('Plaques de cuisson'));

  const bain = elementsParDefaut('Salle de bain');
  assert.ok(bain.includes('Douche') || bain.includes('Baignoire'));

  const sejour = elementsParDefaut('Séjour');
  assert.ok(sejour.includes('Fenêtre'));
  assert.ok(!sejour.includes('Évier'), 'un séjour n’a pas d’évier');
});

test('les accents et la casse ne changent pas les éléments proposés', () => {
  assert.deepEqual(elementsParDefaut('CUISINE'), elementsParDefaut('cuisine'));
  assert.deepEqual(elementsParDefaut('Salle de Bain'), elementsParDefaut('salle de bain'));
});

test('la liste rendue est une copie : la modifier ne corrompt pas le modèle', () => {
  const premiers = elementsParDefaut('Cuisine');
  premiers.push('Élément inventé');
  assert.ok(!elementsParDefaut('Cuisine').includes('Élément inventé'));
});

test('les pièces proposées dépendent du type de logement', () => {
  assert.ok(piecesParDefaut('maison').includes('Cave'));
  assert.ok(!piecesParDefaut('studio').includes('Chambre 1'));
  assert.ok(piecesParDefaut('type inconnu').length > 0);
});

test('les identifiants d’une liste de pièces sont tous distincts', () => {
  const pieces = piecesInitiales('appartement');
  const ids = pieces.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const piece of pieces) {
    const idsElements = piece.elements.map((e) => e.id);
    assert.equal(new Set(idsElements).size, idsElements.length, `éléments de ${piece.nom}`);
  }
});

test('ajouter un élément lui donne un identifiant libre dans sa pièce', () => {
  const piece = pieceVide('Séjour', []);
  const avec = ajouterElement(piece, 'Radiateur');
  assert.equal(avec.elements.length, piece.elements.length + 1);
  const ids = avec.elements.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ajouter une photo lui donne un identifiant libre dans son élément', () => {
  const piece = pieceVide('Séjour', []);
  const element = piece.elements[0];
  const un = ajouterPhoto(element, { id: '', chemin: '/a.jpg', legende: '', priseLe: '2026-09-24' });
  const deux = ajouterPhoto(un, { id: '', chemin: '/b.jpg', legende: '', priseLe: '2026-09-24' });
  assert.deepEqual(deux.photos.map((p) => p.id), ['ph1', 'ph2']);
});

// ---------------------------------------------------------------------------
// Raccourcis
// ---------------------------------------------------------------------------

test('« tout est en bon état » ne touche pas aux constats déjà faits', () => {
  // Écraser un constat — avec son commentaire et ses photos — parce qu'on a
  // touché un bouton serait une perte de travail silencieuse.
  const piece = pieceVide('Séjour', []);
  const avecConstat: PieceEdl = {
    ...piece,
    elements: piece.elements.map((e, i) => (i === 0 ? { ...e, etat: 'mauvais' as EtatElement } : e)),
  };
  const apres = toutEnBonEtat(avecConstat, 'bon');
  assert.equal(apres.elements[0].etat, 'mauvais', 'le constat existant est conservé');
  assert.ok(
    apres.elements.slice(1).every((e) => e.etat === 'bon'),
    'les éléments non renseignés sont remplis',
  );
});

test('vider les états les remet tous à renseigner, sans retirer d’élément', () => {
  const piece = toutEnBonEtat(pieceVide('Séjour', []), 'bon');
  const vide = viderEtats(piece);
  assert.equal(vide.elements.length, piece.elements.length);
  assert.ok(vide.elements.every((e) => e.etat === undefined));
});

test('le premier élément à renseigner est bien celui qui manque', () => {
  const piece = pieceVide('Séjour', []);
  const partiel: PieceEdl = {
    ...piece,
    elements: piece.elements.map((e, i) => (i < 2 ? { ...e, etat: 'bon' as EtatElement } : e)),
  };
  assert.equal(premierElementARenseigner(partiel)?.id, partiel.elements[2].id);
  assert.equal(premierElementARenseigner(toutEnBonEtat(piece, 'bon')), null);
});

test('la première pièce à renseigner est celle qui contient un manque', () => {
  const pieces = [pieceRenseignee('Séjour', 'bon', 'p1'), pieceVide('Cuisine', [])];
  assert.equal(premierePieceARenseigner(pieces)?.nom, 'Cuisine');
  assert.equal(premierePieceARenseigner([pieceRenseignee('Séjour', 'bon', 'p1')]), null);
});

// ---------------------------------------------------------------------------
// Ce qui bloque
// ---------------------------------------------------------------------------

test('un brouillon complet ne manque de rien', () => {
  assert.deepEqual(manquesDeLEdl(brouillonValide(), ATTENDUS), []);
});

test('un brouillon vide nomme tout ce qui manque, un par un', () => {
  const manques = manquesDeLEdl(
    { logementId: '', bailId: '', type: 'entree' },
    ATTENDUS,
  );
  // Six reproches, et non sept : le logement, la location, la date, l'absence
  // de pièce, et les deux signatures. L'étape « visite » ne réclame rien ici,
  // et c'est juste — sans aucune pièce, il n'y a aucun élément à renseigner,
  // et reprocher un élément non renseigné serait reprocher un manque qui
  // n'existe pas.
  assert.equal(manques.length, 6, manques.join(' | '));
  assert.ok(manques.some((m) => m.includes('logement')));
  assert.ok(manques.some((m) => m.includes('date d’établissement')));
  assert.ok(manques.some((m) => m.includes('Aucune pièce')));
  assert.ok(manques.some((m) => m.includes('A. Bailleur n’a pas signé')));
});

test('un élément sans état empêche d’établir le document', () => {
  // Un état par défaut serait un constat inventé : c'est la règle centrale de
  // ce module, et si elle tombait, le document affirmerait ce que personne n'a
  // regardé.
  const b = brouillonValide();
  b.pieces = [{ ...b.pieces![0], elements: [{ id: 'e1', nom: 'Sol', commentaire: '', photos: [] }] }];
  const manques = manquesDeLEdl(b, ATTENDUS);
  assert.equal(manques.length, 1);
  assert.ok(manques[0].includes('Séjour'));
  assert.ok(manques[0].includes('Sol'));
});

test('un élément « non vérifié » suffit à établir le document', () => {
  // Le septième état existe précisément pour permettre de finir sans mentir.
  const b = brouillonValide();
  b.pieces = [pieceRenseignee('Séjour', 'non_verifie', 'p1')];
  assert.deepEqual(manquesDeLEdl(b, ATTENDUS), []);
});

test('le manque de la visite nomme les éléments, sans les compter seulement', () => {
  const b = brouillonValide();
  b.pieces = [pieceVide('Cuisine', [])];
  const manque = manquesDeLEdl(b, ATTENDUS).find((m) => m.includes('non vérifié'));
  assert.ok(manque, 'le manque doit exister');
  assert.ok(manque!.includes('Cuisine'), 'il doit dire où aller');
  assert.ok(manque!.includes('autre(s)'), 'il doit dire combien il en reste');
});

test('deux pièces du même nom empêchent d’établir le document', () => {
  // Sans cette règle, la comparaison entrée/sortie confronterait la mauvaise
  // chambre à la mauvaise chambre.
  const b = brouillonValide();
  b.pieces = [pieceRenseignee('Chambre', 'bon', 'p1'), pieceRenseignee('chambre', 'usage', 'p2')];
  const manques = manquesDeLEdl(b, ATTENDUS);
  assert.equal(manques.length, 1);
  assert.ok(manques[0].includes('même nom'));
});

test('une pièce sans élément empêche d’établir le document', () => {
  const b = brouillonValide();
  b.pieces = [{ id: 'p1', nom: 'Séjour', commentaire: '', photos: [], elements: [] }];
  assert.ok(manquesDeLEdl(b, ATTENDUS).some((m) => m.includes('aucun élément')));
});

test('une date qui n’existe pas dans le calendrier bloque', () => {
  // « 2026-02-31 » a la bonne forme et n'existe pas : un contrôle de forme seul
  // le laisserait passer, et le document serait daté d'un jour inexistant.
  const b = brouillonValide();
  b.dateEdl = '2026-02-31';
  assert.ok(manquesDeLEdl(b, ATTENDUS).some((m) => m.includes('date d’établissement')));
  assert.equal(dateCivileValide('2026-02-31'), false);
  assert.equal(dateCivileValide('2028-02-29'), true, '2028 est bissextile');
});

// ---------------------------------------------------------------------------
// Compteurs et clés
// ---------------------------------------------------------------------------

test('une installation individuelle déclarée sans relevé bloque', () => {
  // L'article 3-2 impose les index en présence d'un chauffage ou d'un
  // chauffe-eau individuel : c'est la déclaration du bailleur qui déclenche
  // l'exigence, pas une supposition de l'application.
  const b = brouillonValide();
  b.compteurs = [];
  const manques = manquesDeLEdl(b, ATTENDUS);
  assert.equal(manques.length, 1);
  assert.ok(manques[0].includes('installation individuelle'));
});

test('sans installation individuelle, l’absence de relevé ne bloque pas', () => {
  const b = brouillonValide();
  b.compteurs = [];
  b.compteursIndividuels = false;
  assert.deepEqual(manquesDeLEdl(b, ATTENDUS), []);
});

test('un index vide bloque, et nomme le compteur', () => {
  const b = brouillonValide();
  b.compteurs = [{ id: 'c1', type: 'gaz', valeur: '   ', precision: '' }];
  const manques = manquesDeLEdl(b, ATTENDUS);
  assert.equal(manques.length, 1);
  assert.ok(manques[0].includes('Gaz'));
});

test('deux relevés du même compteur bloquent', () => {
  const b = brouillonValide();
  b.compteurs = [
    { id: 'c1', type: 'electricite', valeur: '100', precision: '' },
    { id: 'c2', type: 'electricite', valeur: '200', precision: '' },
  ];
  const manques = manquesDeLEdl(b, ATTENDUS);
  assert.equal(manques.length, 1);
  assert.ok(manques[0].includes('même compteur'));
});

test('une clé sans destination bloque, et nomme la clé', () => {
  const b = brouillonValide();
  b.cles = [{ id: 'k1', libelle: 'Clé de cave', destination: '  ', quantite: 1 }];
  const manques = manquesDeLEdl(b, ATTENDUS);
  assert.equal(manques.length, 1);
  assert.ok(manques[0].includes('Clé de cave'));
});

test('une quantité de clé nulle ou fractionnaire bloque', () => {
  const b = brouillonValide();
  b.cles = [{ id: 'k1', libelle: 'Clé', destination: 'Entrée', quantite: 0 }];
  assert.ok(manquesDeLEdl(b, ATTENDUS).some((m) => m.includes('quantité')));

  b.cles = [{ id: 'k1', libelle: 'Clé', destination: 'Entrée', quantite: 1.5 }];
  assert.ok(manquesDeLEdl(b, ATTENDUS).some((m) => m.includes('quantité')));
});

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

test('chaque signataire attendu est réclamé nommément', () => {
  const b = brouillonValide();
  b.signatures = [b.signatures![0]];
  const manques = manquesDeLEdl(b, ATTENDUS);
  assert.equal(manques.length, 1);
  assert.ok(manques[0].includes('M. Locataire'));
});

test('une signature sans tracé ne compte pas comme une signature', () => {
  // C'est une case cochée, pas une signature : l'admettre viderait de son sens
  // la mention imprimée sous les signatures.
  const b = brouillonValide();
  b.signatures = [{ signataire: 'bailleur', nom: 'A. Bailleur', date: '2026-09-24', trace: '' }];
  const manques = manquesDeLEdl(b, ATTENDUS);
  assert.equal(manques.length, 2, manques.join(' | '));
});

test('deux signataires du même nom ne se confondent pas', () => {
  // L'identification se fait sur l'identifiant : deux « Martin » ne doivent pas
  // se couvrir l'un l'autre.
  const b = brouillonValide();
  const signatures = [
    { signataire: 'titulaire-1', nom: 'Martin', date: '2026-09-24', trace: 'data:x' },
    { signataire: 'titulaire-2', nom: 'Martin', date: '2026-09-24', trace: 'data:y' },
  ];
  b.signatures = signatures;
  const attendus = [
    { id: 'titulaire-1', nom: 'Martin' },
    { id: 'titulaire-2', nom: 'Martin' },
  ];
  assert.deepEqual(manquesDeLEdl(b, attendus), []);
});

test('sans liste de signataires, une seule signature suffit à ne pas bloquer', () => {
  const b = brouillonValide();
  assert.deepEqual(manquesDeLEdl(b), []);
});

test('sans aucune signature, le document est refusé', () => {
  const b = brouillonValide();
  b.signatures = [];
  assert.ok(manquesDeLEdl(b).some((m) => m.includes('Aucune signature')));
});

test('le nombre d’exemplaires suit le nombre de parties', () => {
  // L'article 3-2 exige « autant d'exemplaires que de parties ».
  assert.equal(exemplairesNecessaires(0), 2, 'un bailleur et au moins un locataire');
  assert.equal(exemplairesNecessaires(1), 2);
  assert.equal(exemplairesNecessaires(2), 3);
  assert.equal(exemplairesNecessaires(3), 4);
});

// ---------------------------------------------------------------------------
// L'invariant : formulaire et contrôle final ne divergent pas
// ---------------------------------------------------------------------------

test('aucune règle du contrôle final n’échappe au formulaire guidé', () => {
  // La somme des manques par étape doit être exactement la liste complète. Si
  // une règle était étiquetée d'une étape qui n'existe pas, ou oubliée d'un
  // côté, le formulaire laisserait avancer vers une vérification qui refuse.
  const brouillons: BrouillonEdl[] = [
    { logementId: '', bailId: '', type: 'entree' },
    brouillonValide(),
    { ...brouillonValide(), dateEdl: '2026-13-45' },
    { ...brouillonValide(), pieces: [] },
    { ...brouillonValide(), pieces: [{ id: 'p1', nom: 'Séjour', commentaire: '', photos: [], elements: [] }] },
    { ...brouillonValide(), pieces: [pieceVide('Séjour', [])] },
    { ...brouillonValide(), pieces: [pieceRenseignee('Chambre', 'bon', 'p1'), pieceRenseignee('Chambre', 'bon', 'p2')] },
    { ...brouillonValide(), compteurs: [], compteursIndividuels: true },
    { ...brouillonValide(), compteurs: [], compteursIndividuels: false },
    { ...brouillonValide(), cles: [{ id: 'k1', libelle: '', destination: '', quantite: 0 }] },
    { ...brouillonValide(), signatures: [] },
    { ...brouillonValide(), type: 'sortie', entreeId: undefined, dateEntree: undefined },
    { ...brouillonValide(), type: 'sortie', entreeId: 'edl-1', dateEntree: '2025-09-01' },
  ];

  for (const b of brouillons) {
    const parEtape = ETAPES_EDL.flatMap((e) => manquesDeLEtapeEdl(b, e.valeur, ATTENDUS));
    assert.deepEqual(
      parEtape,
      manquesDeLEdl(b, ATTENDUS),
      `divergence sur ${JSON.stringify(b).slice(0, 120)}`,
    );
  }
});

test('chaque étape sait dire ce qui manque pour la quitter', () => {
  const vide: BrouillonEdl = { logementId: '', bailId: '', type: 'entree' };
  assert.ok(manquesDeLEtapeEdl(vide, 'logement').length > 0);
  assert.ok(manquesDeLEtapeEdl(vide, 'pieces').length > 0);
  assert.ok(manquesDeLEtapeEdl(vide, 'signature').length > 0);
  // Les étapes qui ne portent aucune règle obligatoire ne réclament rien : un
  // formulaire qui réclame une observation obligerait à écrire pour écrire.
  assert.deepEqual(manquesDeLEtapeEdl(brouillonValide(), 'observations', ATTENDUS), []);
});

// ---------------------------------------------------------------------------
// Avertissements
// ---------------------------------------------------------------------------

test('une pièce sans aucune photo est signalée, sans bloquer', () => {
  const avertissements = avertissementsDeLEdl(brouillonValide());
  assert.ok(avertissements.some((a) => a.includes('Aucune photo')));
  assert.deepEqual(manquesDeLEdl(brouillonValide(), ATTENDUS), [], 'et rien ne bloque');
});

test('les éléments « non vérifié » sont signalés', () => {
  const b = brouillonValide();
  b.pieces = [pieceRenseignee('Séjour', 'non_verifie', 'p1')];
  assert.ok(avertissementsDeLEdl(b).some((a) => a.includes('non vérifié')));
});

test('l’absence de relevé et de clé est signalée, sans bloquer', () => {
  const b = brouillonValide();
  b.compteurs = [];
  b.cles = [];
  // Sans installation individuelle déclarée : c'est ce cas qui se **signale**.
  // Avec une installation déclarée, l'absence de relevé **bloque**, et c'est un
  // autre test qui le dit.
  b.compteursIndividuels = false;
  const avertissements = avertissementsDeLEdl(b);
  assert.ok(avertissements.some((a) => a.includes('relevé de compteur')));
  assert.ok(avertissements.some((a) => a.includes('clé')));
  assert.deepEqual(manquesDeLEdl(b, ATTENDUS), []);
});

test('un état des lieux d’entrée rappelle le délai de dix jours', () => {
  // C'est un droit du locataire, énoncé par l'article 3-2 : le taire ferait
  // croire que l'entrée est définitive une fois signée.
  const avertissements = avertissementsDeLEdl(brouillonValide());
  assert.ok(avertissements.some((a) => a.includes('dix jours')));
});

test('un état des lieux de sortie ne rappelle pas le délai d’entrée', () => {
  const b: BrouillonEdl = {
    ...brouillonValide(),
    type: 'sortie',
    entreeId: 'edl-1',
    dateEntree: '2025-09-01',
  };
  assert.ok(!avertissementsDeLEdl(b).some((a) => a.includes('dix jours')));
});

// ---------------------------------------------------------------------------
// Les douze sections
// ---------------------------------------------------------------------------

test('un état des lieux d’entrée compte douze sections', () => {
  assert.equal(SECTIONS_EDL.length, 12);
  assert.equal(sectionsEdl('entree').length, 12);
});

test('chaque section nomme son exigence et le texte qui la fonde', () => {
  for (const section of SECTIONS_EDL) {
    assert.ok(section.titre.trim().length > 0, `${section.valeur} : titre`);
    assert.ok(section.exigence.trim().length > 0, `${section.valeur} : exigence`);
    assert.ok(section.fondement.trim().length > 0, `${section.valeur} : fondement`);
  }
});

test('chaque fondement renvoie à une source réellement déclarée', () => {
  // Un fondement qui ne renvoie à aucune source lue est une clause inventée,
  // même quand elle est vraie.
  const references = SOURCES_EDL.map((s) => s.reference);
  for (const section of [...SECTIONS_EDL, ...sectionsEdl('sortie')]) {
    if (section.fondement.startsWith('Exigence propre')) continue;
    const debut = section.fondement.split(',')[0].trim();
    assert.ok(
      references.some((r) => r.startsWith(debut)),
      `« ${section.fondement} » ne renvoie à aucune source déclarée`,
    );
  }
});

test('chaque source porte une date de consultation', () => {
  for (const source of SOURCES_EDL) {
    assert.match(source.consulteLe, /^\d{4}-\d{2}-\d{2}$/, source.reference);
    assert.ok(source.etablit.trim().length > 0, source.reference);
  }
});

test('les sections d’un état des lieux de sortie ajoutent les trois de l’article 2, 2°', () => {
  const sortie = sectionsEdl('sortie');
  assert.equal(sortie.length, 15);
  const valeurs = sortie.map((s) => s.valeur);
  assert.ok(valeurs.includes('reference_entree'));
  assert.ok(valeurs.includes('nouveau_domicile'));
  assert.ok(valeurs.includes('evolutions'));
});

test('les sections de sortie s’insèrent au bon endroit, et non à la fin', () => {
  // La référence à l'entrée se lit après le bail dont elle dépend ; les
  // évolutions se lisent après la description des pièces, dont elles tirent
  // leurs constats, et avant la synthèse.
  const valeurs = sectionsEdl('sortie').map((s) => s.valeur);
  assert.ok(valeurs.indexOf('reference_entree') > valeurs.indexOf('bail'));
  assert.ok(valeurs.indexOf('reference_entree') < valeurs.indexOf('compteurs'));
  assert.ok(valeurs.indexOf('evolutions') > valeurs.indexOf('pieces'));
  assert.ok(valeurs.indexOf('evolutions') < valeurs.indexOf('synthese'));
});

test('la liste de sortie est une copie : l’entrée n’est pas modifiée', () => {
  sectionsEdl('sortie');
  assert.equal(SECTIONS_EDL.length, 12, 'la constante d’entrée doit rester intacte');
});

// ---------------------------------------------------------------------------
// Synthèse
// ---------------------------------------------------------------------------

test('la synthèse sépare les états constatés des éléments non renseignés', () => {
  // C'est la distinction qui empêche « 12 éléments en bon état » là où deux
  // n'ont jamais été regardés.
  const b = brouillonValide();
  b.pieces = [
    pieceRenseignee('Séjour', 'bon', 'p1'),
    pieceRenseignee('Cuisine', 'non_verifie', 'p2'),
    pieceVide('Entrée', []),
  ];
  const synthese = syntheseEdl(b);
  const attendus = b.pieces.reduce((n, p) => n + p.elements.length, 0);
  assert.equal(synthese.total, attendus);
  assert.equal(synthese.aRenseigner, pieceVide('Entrée', []).elements.length);
  assert.equal(synthese.constates, synthese.total - synthese.aRenseigner - synthese.parEtat.find((e) => e.etat === 'non_verifie')!.nombre);
  assert.equal(synthese.parEtat.find((e) => e.etat === 'bon')!.nombre, pieceVide('Séjour', []).elements.length);
});

test('la synthèse compte les photos des pièces et des éléments', () => {
  const b = brouillonValide();
  const piece = pieceVide('Séjour', []);
  b.pieces = [
    {
      ...piece,
      photos: [{ id: 'ph1', chemin: '/a.jpg', legende: '', priseLe: '2026-09-24' }],
      elements: piece.elements.map((e, i) =>
        i === 0
          ? { ...e, etat: 'bon' as EtatElement, photos: [{ id: 'ph1', chemin: '/b.jpg', legende: '', priseLe: '2026-09-24' }] }
          : { ...e, etat: 'bon' as EtatElement },
      ),
    },
  ];
  assert.equal(syntheseEdl(b).photos, 2);
});

test('un brouillon vide se résume sans lever', () => {
  const synthese = syntheseEdl({ logementId: 'l', bailId: 'b', type: 'entree' });
  assert.equal(synthese.total, 0);
  assert.equal(synthese.pieces, 0);
  assert.equal(synthese.photos, 0);
  assert.equal(synthese.parEtat.length, 7);
});

test('le titre nomme le type et la date, en français', () => {
  assert.equal(titreDeLEdl('entree', '2026-09-24'), "État des lieux d'entrée du 24 septembre 2026");
  assert.equal(titreDeLEdl('sortie', '2027-01-05'), 'État des lieux de sortie du 5 janvier 2027');
});

// ---------------------------------------------------------------------------
// Reprise d'un brouillon
// ---------------------------------------------------------------------------

test('un brouillon complet se relit sans rien perdre', () => {
  const avant = brouillonValide();
  const apres = reprendreBrouillonEdl(
    JSON.parse(JSON.stringify(avant)) as Record<string, unknown>,
    { logementId: '', bailId: '', type: 'entree' },
  );
  assert.deepEqual(apres.pieces?.map((p) => p.nom), avant.pieces?.map((p) => p.nom));
  assert.deepEqual(apres.compteurs?.map((c) => c.valeur), avant.compteurs?.map((c) => c.valeur));
  assert.deepEqual(apres.cles?.map((k) => k.libelle), avant.cles?.map((k) => k.libelle));
  assert.equal(apres.signatures?.length, 2);
  assert.equal(apres.dateEdl, '2026-09-24');
});

test('un index numérique relu comme un nombre garde ses zéros de tête', () => {
  // Un index de compteur n'est pas une quantité : `007412` et `7412` ne
  // désignent pas le même relevé pour qui doit vérifier une consommation.
  const apres = reprendreBrouillonEdl(
    { compteurs: [{ type: 'electricite', valeur: 7412, precision: '' }] },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apres.compteurs?.[0].valeur, '7412');

  const apresTexte = reprendreBrouillonEdl(
    { compteurs: [{ type: 'electricite', valeur: '007412', precision: '' }] },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apresTexte.compteurs?.[0].valeur, '007412');
});

test('un état d’élément inconnu est ignoré, et non conservé', () => {
  // Le conserver ferait afficher une case vide dans la liste des sept, et le
  // contrôle final refuserait un élément que l'utilisateur croit avoir rempli.
  const apres = reprendreBrouillonEdl(
    { pieces: [{ nom: 'Séjour', elements: [{ nom: 'Sol', etat: 'excellent' }] }] },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apres.pieces?.[0].elements[0].etat, undefined);
});

test('un état d’élément connu est conservé', () => {
  const apres = reprendreBrouillonEdl(
    { pieces: [{ nom: 'Séjour', elements: [{ nom: 'Sol', etat: 'mauvais' }] }] },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apres.pieces?.[0].elements[0].etat, 'mauvais');
});

test('une photo sans fichier est écartée', () => {
  // La garder ferait afficher une image vide dans le document, et personne ne
  // saurait qu'il en manque une.
  const apres = reprendreBrouillonEdl(
    { pieces: [{ nom: 'Séjour', elements: [{ nom: 'Sol', photos: [{ chemin: '' }, { chemin: '/ok.jpg' }] }] }] },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apres.pieces?.[0].elements[0].photos.length, 1);
  assert.equal(apres.pieces?.[0].elements[0].photos[0].chemin, '/ok.jpg');
});

test('une signature sans tracé est écartée à la relecture', () => {
  const apres = reprendreBrouillonEdl(
    {
      signatures: [
        { signataire: 'bailleur', nom: 'A', date: '2026-09-24', trace: '' },
        { signataire: 'titulaire-1', nom: 'B', date: '2026-09-24', trace: 'data:x' },
      ],
    },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apres.signatures?.length, 1);
  assert.equal(apres.signatures?.[0].signataire, 'titulaire-1');
});

test('une date d’établissement invalide n’est pas reprise', () => {
  const base: BrouillonEdl = { logementId: 'l', bailId: 'b', type: 'entree', dateEdl: '2026-09-24' };
  const apres = reprendreBrouillonEdl({ dateEdl: '2026-02-31' }, base);
  assert.equal(apres.dateEdl, '2026-09-24', 'la valeur de base est conservée');
});

test('un contenu d’un autre type ne fait pas tomber la reprise', () => {
  // Un tableau, une chaîne, un nombre : formes qu'une écriture partielle peut
  // produire. On rend la base plutôt que de lever.
  const base: BrouillonEdl = { logementId: 'l', bailId: 'b', type: 'entree' };
  for (const mauvais of [
    { pieces: 'Séjour' },
    { pieces: 42 },
    { compteurs: {} },
    { cles: null },
    { signatures: 'oui' },
    { type: 'inventaire' },
    { logementId: 12 },
  ]) {
    const apres = reprendreBrouillonEdl(mauvais as Record<string, unknown>, base);
    assert.equal(apres.type, 'entree');
    assert.equal(apres.logementId, 'l');
  }
});

test('un type inconnu ne remplace pas le type de base', () => {
  const base: BrouillonEdl = { logementId: 'l', bailId: 'b', type: 'entree' };
  const apres = reprendreBrouillonEdl({ type: 'inventaire' }, base);
  assert.equal(apres.type, 'entree');
});

test('une pièce sans nom est écartée, une pièce nommée est gardée', () => {
  const apres = reprendreBrouillonEdl(
    { pieces: [{ nom: '   ' }, { nom: 'Cuisine' }] },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apres.pieces?.length, 1);
  assert.equal(apres.pieces?.[0].nom, 'Cuisine');
});

test('les identifiants repris restent tous distincts', () => {
  // Deux pièces peuvent porter le même identifiant si le contenu vient d'une
  // sauvegarde abîmée ou d'une version antérieure. Ces identifiants servent à
  // apparier un état des lieux de sortie à celui d'entrée : deux pièces
  // confondues feraient comparer la mauvaise chambre à la mauvaise chambre.
  const apres = reprendreBrouillonEdl(
    {
      pieces: [
        { id: 'p1', nom: 'Séjour', elements: [{ id: 'e1', nom: 'Sol' }, { id: 'e1', nom: 'Murs' }] },
        { id: 'p1', nom: 'Cuisine', elements: [{ id: 'e1', nom: 'Sol' }] },
      ],
    },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );

  const ids = apres.pieces!.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'deux pièces ne peuvent pas partager un identifiant');

  for (const piece of apres.pieces!) {
    const idsElements = piece.elements.map((e) => e.id);
    assert.equal(
      new Set(idsElements).size,
      idsElements.length,
      `deux éléments de « ${piece.nom} » ne peuvent pas partager un identifiant`,
    );
  }
});

test('un identifiant libre est conservé tel quel', () => {
  // Le contrôle ne doit pas réécrire ce qui est sain : réattribuer un
  // identifiant libre romprait l'appariement entrée/sortie qu'il protège.
  const apres = reprendreBrouillonEdl(
    { pieces: [{ id: 'p7', nom: 'Séjour', elements: [{ id: 'e3', nom: 'Sol' }] }] },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apres.pieces![0].id, 'p7');
  assert.equal(apres.pieces![0].elements[0].id, 'e3');
});

test('un identifiant vide ou d’un autre type est remplacé', () => {
  const apres = reprendreBrouillonEdl(
    { pieces: [{ id: '   ', nom: 'Séjour' }, { id: 12, nom: 'Cuisine' }] },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  for (const piece of apres.pieces!) {
    assert.ok(piece.id.trim().length > 0, `« ${piece.nom} » doit avoir un identifiant`);
  }
  const ids = apres.pieces!.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('un compteur de type inconnu est écarté', () => {
  const apres = reprendreBrouillonEdl(
    { compteurs: [{ type: 'eau_de_pluie', valeur: '10' }, { type: 'gaz', valeur: '20' }] },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apres.compteurs?.length, 1);
  assert.equal(apres.compteurs?.[0].type, 'gaz');
});

test('tous les compteurs proposés sont relus sans perte', () => {
  const apres = reprendreBrouillonEdl(
    { compteurs: COMPTEURS.map((c, i) => ({ type: c.valeur, valeur: String(i + 1) })) },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apres.compteurs?.length, COMPTEURS.length);
});

test('une quantité de clé absente vaut une, et une quantité absurde est corrigée', () => {
  const apres = reprendreBrouillonEdl(
    { cles: [{ libelle: 'Clé', destination: 'Entrée' }, { libelle: 'Badge', destination: 'Parking', quantite: -3 }] },
    { logementId: 'l', bailId: 'b', type: 'entree' },
  );
  assert.equal(apres.cles?.[0].quantite, 1);
  assert.equal(apres.cles?.[1].quantite, 1);
});

// ---------------------------------------------------------------------------
// Qui doit signer
// ---------------------------------------------------------------------------

test('les signataires attendus nomment le bailleur, puis chaque locataire dans l’ordre', () => {
  const attendus = signatairesAttendusDeLEdl({
    nomBailleur: 'SCI Les Lilas',
    titulaires: [
      { id: 't1', nom: 'Martin', prenom: 'Julie' },
      { id: 't2', nom: 'Bernard', prenom: 'Karim' },
    ],
  });

  assert.deepEqual(
    attendus.map((a) => [a.id, a.nom]),
    [
      ['bailleur', 'SCI Les Lilas'],
      ['t1', 'Julie Martin'],
      ['t2', 'Karim Bernard'],
    ],
  );
});

test('l’identifiant du locataire est celui du titulaire, jamais son rang', () => {
  // Deux personnes peuvent porter le même nom : c’est l’identifiant qui décide
  // sous quel nom une signature s’imprime. Un appariement par rang glisserait
  // la signature de l’une sous le nom de l’autre, et cela ne se voit pas.
  const attendus = signatairesAttendusDeLEdl({
    nomBailleur: 'SCI Les Lilas',
    titulaires: [
      { id: 'titulaire-9', nom: 'Martin', prenom: 'Julie' },
      { id: 'titulaire-4', nom: 'Martin', prenom: 'Paul' },
    ],
  });

  assert.deepEqual(attendus.map((a) => a.id), ['bailleur', 'titulaire-9', 'titulaire-4']);
  assert.equal(attendus.filter((a) => a.nom === 'Julie Martin').length, 1);
  assert.equal(attendus.filter((a) => a.nom === 'Paul Martin').length, 1);
});

test('un mandataire nommé s’ajoute en dernier, un mandataire vide ne s’ajoute pas', () => {
  const base = {
    nomBailleur: 'SCI Les Lilas',
    titulaires: [{ id: 't1', nom: 'Martin', prenom: 'Julie' }],
  };

  assert.deepEqual(
    signatairesAttendusDeLEdl({ ...base, mandataire: 'Agence du Parc' }).map((a) => a.id),
    ['bailleur', 't1', 'mandataire'],
  );
  assert.deepEqual(
    signatairesAttendusDeLEdl({ ...base, mandataire: '   ' }).map((a) => a.id),
    ['bailleur', 't1'],
    'un mandataire qui n’est que des espaces n’est pas un signataire',
  );
  assert.deepEqual(signatairesAttendusDeLEdl(base).map((a) => a.id), ['bailleur', 't1']);
});

test('le formulaire et l’émission exigent les mêmes signatures', () => {
  // C’est la raison d’être de cette fonction : la liste vivait dans le module
  // d’émission, et le formulaire en refaisait une. Deux constructions séparées
  // finissent par ne plus désigner les mêmes personnes — et un état des lieux
  // imprimé sans la signature d’un locataire nommé est écarté.
  const attendus = signatairesAttendusDeLEdl({
    nomBailleur: 'SCI Les Lilas',
    titulaires: [
      { id: 't1', nom: 'Martin', prenom: 'Julie' },
      { id: 't2', nom: 'Bernard', prenom: 'Karim' },
    ],
  });

  const sejour = pieceVide('Séjour', []);
  sejour.elements = sejour.elements.map((e) => ({ ...e, etat: 'bon' as const }));

  const b: BrouillonEdl = {
    logementId: 'l',
    bailId: 'b',
    type: 'entree',
    // La date est renseignée : sans elle, le domaine réclame aussi la date, et
    // le test mesurerait deux manques au lieu du seul manque de signature.
    dateEdl: '2026-09-24',
    pieces: [sejour],
    signatures: [
      { signataire: 'bailleur', nom: 'SCI Les Lilas', date: '2026-09-24', trace: 'data:,a' },
      { signataire: 't1', nom: 'Julie Martin', date: '2026-09-24', trace: 'data:,b' },
    ],
  };

  const manques = manquesDeLEdl(b, attendus);
  assert.equal(manques.length, 1, `un seul manque attendu, vu : ${JSON.stringify(manques)}`);
  assert.ok(
    manques[0].includes('Karim Bernard'),
    'le manque doit nommer le signataire absent',
  );
});
