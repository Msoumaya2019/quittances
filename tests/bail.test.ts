/**
 * Les baux : catégories, règles légales et brouillon guidé.
 *
 * Ces tests portent sur le **domaine pur**. Ils sont lancés par `node --test`,
 * sans émulateur : le module importe donc en chemin relatif avec `.ts`.
 *
 * Ce qu'ils protègent, en une phrase : **l'application ne doit jamais produire
 * un bail que la loi interdit**, et ne doit jamais présenter une règle qu'elle
 * n'a pas lue dans une source officielle comme un fait établi.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CATEGORIES_BAIL,
  CONTRATS_TYPES,
  DIAGNOSTICS_PROPOSES,
  ETAPES_BAIL,
  LIBELLE_ANNEXE,
  LIBELLE_BAIL,
  REGLES_BAIL,
  SOURCES_BAIL,
  avertissementsDuBail,
  depotDepasseLaRegle,
  dureeMinimaleMois,
  etapePrecedente,
  etapeSuivante,
  manquesDeLEtape,
  manquesDuBail,
  numeroEtape,
  reprendreBrouillon,
} from '../src/domain/bail.ts';
import type { BrouillonBail, CategorieBail, EtapeBail } from '../src/domain/bail.ts';

/** Un brouillon valide pour la catégorie demandée, que chaque test ajuste. */
function brouillon(categorie: CategorieBail, extra: Partial<BrouillonBail> = {}): BrouillonBail {
  return {
    logementId: 'log-1',
    bailId: 'bail-1',
    categorie,
    dateDebut: '2026-10-01',
    dureeMois: 36,
    loyer: 70000,
    charges: 5000,
    jourEcheance: 1,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Couverture des catégories
// ---------------------------------------------------------------------------

test('chaque catégorie proposée porte une règle, et réciproquement', () => {
  const proposees = CATEGORIES_BAIL.map((c) => c.valeur).sort();
  const reglees = Object.keys(REGLES_BAIL).sort();
  assert.deepEqual(reglees, proposees);
});

test('chaque catégorie a un libellé et un résumé non vides', () => {
  for (const c of CATEGORIES_BAIL) {
    assert.ok(c.libelle.trim(), `libellé vide pour ${c.valeur}`);
    assert.ok(c.resume.trim(), `résumé vide pour ${c.valeur}`);
    assert.equal(c.libelle, LIBELLE_BAIL[c.valeur]);
  }
});

test('chaque règle annonce son régime et sa durée', () => {
  for (const [categorie, regle] of Object.entries(REGLES_BAIL)) {
    assert.ok(regle.regime.trim(), `régime vide pour ${categorie}`);
    assert.ok(regle.duree.trim(), `durée vide pour ${categorie}`);
    assert.ok(regle.preavisLocataire.trim(), `préavis locataire vide pour ${categorie}`);
  }
});

test('aucun point de vigilance n’est vide', () => {
  for (const [categorie, regle] of Object.entries(REGLES_BAIL)) {
    for (const point of regle.vigilance) {
      assert.ok(point.trim(), `point de vigilance vide pour ${categorie}`);
    }
  }
});

test('chaque annexe annoncée par une règle a un libellé', () => {
  for (const regle of Object.values(REGLES_BAIL)) {
    for (const annexe of regle.annexes) {
      assert.ok(LIBELLE_ANNEXE[annexe]?.trim(), `libellé manquant pour ${annexe}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Les sources — le cœur de la promesse « aucune clause inventée »
// ---------------------------------------------------------------------------

test('chaque source porte une référence et une date de consultation', () => {
  assert.ok(SOURCES_BAIL.length >= 8, 'trop peu de sources pour couvrir six catégories');
  for (const s of SOURCES_BAIL) {
    assert.ok(s.etablit.trim(), 'une source n’annonce pas ce qu’elle établit');
    assert.ok(s.reference.trim(), `référence vide : ${s.etablit.slice(0, 40)}`);
    assert.match(s.consulteLe, /^\d{4}-\d{2}-\d{2}$/, `date de consultation invalide : ${s.consulteLe}`);
  }
});

test('la durée légale du vide est sourcée par la loi de 1989', () => {
  const s = SOURCES_BAIL.find((x) => x.reference.includes('article 10'));
  assert.ok(s, 'aucune source ne cite l’article 10');
  assert.match(s.etablit, /trois ans/);
  assert.match(s.etablit, /six ans/);
});

test('le plafond du dépôt de garantie est sourcé, et distingue vide et meublé', () => {
  const s = SOURCES_BAIL.find((x) => x.etablit.includes('Dépôt de garantie'));
  assert.ok(s, 'aucune source ne porte le plafond du dépôt de garantie');
  assert.match(s.etablit, /1 mois/);
  assert.match(s.etablit, /2 mois/);
});

test('le changement des contrats types au 1er octobre 2026 est sourcé', () => {
  const s = SOURCES_BAIL.find((x) => x.etablit.includes('contrats types'));
  assert.ok(s, 'le changement réglementaire n’est pas sourcé');
  assert.equal(CONTRATS_TYPES, '2026-10-01');
  assert.match(s.reference, /Journal officiel du 7 juillet 2026/);
});

// ---------------------------------------------------------------------------
// Les neuf étapes
// ---------------------------------------------------------------------------

test('le formulaire guidé compte exactement neuf étapes', () => {
  assert.equal(ETAPES_BAIL.length, 9);
});

test('chaque étape a un titre et une aide', () => {
  for (const e of ETAPES_BAIL) {
    assert.ok(e.titre.trim(), `titre vide pour ${e.valeur}`);
    assert.ok(e.aide.trim(), `aide vide pour ${e.valeur}`);
  }
});

test('les étapes sont numérotées de 1 à 9, sans trou', () => {
  const numeros = ETAPES_BAIL.map((e) => numeroEtape(e.valeur));
  assert.deepEqual(numeros, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('les deux premières étapes ne demandent aucune saisie', () => {
  // Elles rappellent ce qui est déjà enregistré : c'est la promesse « ne jamais
  // ressaisir une information déjà donnée ».
  assert.equal(ETAPES_BAIL[0].valeur, 'logement');
  assert.equal(ETAPES_BAIL[1].valeur, 'locataires');
});

// ---------------------------------------------------------------------------
// Durée
// ---------------------------------------------------------------------------

test('une location vide dure au moins trois ans', () => {
  assert.equal(dureeMinimaleMois('vide', false), 36);
  const manques = manquesDuBail(brouillon('vide', { dureeMois: 24 }));
  assert.equal(manques.length, 1);
  assert.match(manques[0], /inférieure au minimum légal/);
});

test('un bailleur personne morale impose six ans', () => {
  assert.equal(dureeMinimaleMois('vide', true), 72);
  const manques = manquesDuBail(
    brouillon('vide', { dureeMois: 36, bailleurPersonneMorale: true }),
  );
  assert.equal(manques.length, 1);
  assert.match(manques[0], /72 mois/);
});

test('trois ans suffisent pour une personne physique, six pour une morale', () => {
  assert.deepEqual(manquesDuBail(brouillon('vide', { dureeMois: 36 })), []);
  assert.deepEqual(
    manquesDuBail(brouillon('vide', { dureeMois: 72, bailleurPersonneMorale: true })),
    [],
  );
});

test('la durée du stationnement est libre', () => {
  assert.equal(dureeMinimaleMois('stationnement', false), null);
  assert.deepEqual(manquesDuBail(brouillon('stationnement', { dureeMois: 1 })), []);
});

test('un bail étudiant est conclu pour neuf mois', () => {
  assert.deepEqual(manquesDuBail(brouillon('etudiant', { dureeMois: 9 })), []);
  const manques = manquesDuBail(brouillon('etudiant', { dureeMois: 12 }));
  assert.equal(manques.length, 1);
  assert.match(manques[0], /9 mois/);
});

// ---------------------------------------------------------------------------
// Dépôt de garantie — la règle qui corrige au lieu d'informer
// ---------------------------------------------------------------------------

test('le dépôt de garantie est interdit pour un bail mobilité', () => {
  const b = brouillon('mobilite', {
    dureeMois: 6,
    motifMobilite: 'Mutation professionnelle',
    depotGarantie: 1,
  });
  assert.match(String(depotDepasseLaRegle(b)), /interdit/);
  const manques = manquesDuBail(b);
  assert.ok(manques.some((m) => /dépôt de garantie est interdit/.test(m)));
});

test('un bail mobilité sans dépôt de garantie passe', () => {
  const b = brouillon('mobilite', {
    dureeMois: 6,
    motifMobilite: 'Stage de six mois',
    depotGarantie: 0,
  });
  assert.equal(depotDepasseLaRegle(b), null);
  assert.deepEqual(manquesDuBail(b), []);
});

test('le dépôt de garantie du vide ne dépasse pas un mois de loyer', () => {
  assert.equal(depotDepasseLaRegle(brouillon('vide', { depotGarantie: 70000 })), null);
  const trop = depotDepasseLaRegle(brouillon('vide', { depotGarantie: 70001 }));
  assert.match(String(trop), /plafond légal de 1 mois/);
});

test('le dépôt de garantie du meublé va jusqu’à deux mois de loyer', () => {
  assert.equal(depotDepasseLaRegle(brouillon('meuble', { depotGarantie: 140000 })), null);
  const trop = depotDepasseLaRegle(brouillon('meuble', { depotGarantie: 140001 }));
  assert.match(String(trop), /plafond légal de 2 mois/);
});

test('un plafond de dépôt interdit ne se lit pas comme un plafond de zéro mois', () => {
  // Le piège : confondre « interdit » et « plafonné à zéro » ferait passer un
  // dépôt nul pour une infraction.
  assert.equal(REGLES_BAIL.mobilite.depotGarantieInterdit, true);
  assert.equal(REGLES_BAIL.mobilite.depotGarantieMois, 0);
  assert.equal(depotDepasseLaRegle(brouillon('mobilite', { dureeMois: 6, depotGarantie: 0 })), null);
});

// ---------------------------------------------------------------------------
// Bail mobilité
// ---------------------------------------------------------------------------

test('un bail mobilité sans motif est refusé', () => {
  const manques = manquesDuBail(brouillon('mobilite', { dureeMois: 6, depotGarantie: 0 }));
  assert.equal(manques.length, 1);
  assert.match(manques[0], /motif du locataire est obligatoire/);
});

test('un bail mobilité ne dépasse pas dix mois', () => {
  const manques = manquesDuBail(
    brouillon('mobilite', { dureeMois: 11, motifMobilite: 'Mission', depotGarantie: 0 }),
  );
  assert.equal(manques.length, 1);
  assert.match(manques[0], /ne peut pas dépasser 10 mois/);
});

test('la règle du bail mobilité cite ses cinq interdictions', () => {
  const points = REGLES_BAIL.mobilite.vigilance.join(' ');
  assert.match(points, /dépôt de garantie est interdit/);
  assert.match(points, /motif du locataire/);
  assert.match(points, /titre Ier ter/);
  assert.match(points, /solidarité/);
  assert.match(points, /18 mois/);
});

test('aucune règle du domaine ne porte de balisage de rédaction', () => {
  // Ces chaînes sont imprimées telles quelles sur le papier : un astérisque
  // d'emphase s'y verrait. Le domaine ne sait rien du HTML, c'est donc ici que
  // la contrainte se tient — et elle porte sur toutes les catégories.
  for (const [categorie, regle] of Object.entries(REGLES_BAIL)) {
    for (const champ of [regle.regime, regle.duree, regle.preavisLocataire, regle.preavisBailleur]) {
      assert.ok(!champ?.includes('**'), `balisage dans ${categorie} : ${champ}`);
    }
    for (const point of regle.vigilance) {
      assert.ok(!point.includes('**'), `balisage dans la vigilance de ${categorie}`);
    }
  }
  for (const s of SOURCES_BAIL) {
    assert.ok(!s.etablit.includes('**'), 'balisage dans une source');
    assert.ok(!s.reference.includes('**'), 'balisage dans une référence');
  }
  for (const c of CATEGORIES_BAIL) {
    assert.ok(!c.resume.includes('**'), `balisage dans le résumé de ${c.valeur}`);
  }
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

test('une date de forme correcte mais impossible est refusée', () => {
  const manques = manquesDuBail(brouillon('vide', { dateDebut: '2026-02-30' }));
  assert.equal(manques.length, 1);
  assert.match(manques[0], /n’existe pas dans le calendrier/);
});

test('une date réelle passe', () => {
  assert.deepEqual(manquesDuBail(brouillon('vide', { dateDebut: '2028-02-29' })), []);
});

test('le jour d’échéance reste entre 1 et 31', () => {
  const manques = manquesDuBail(brouillon('vide', { jourEcheance: 32 }));
  assert.equal(manques.length, 1);
  assert.match(manques[0], /entre 1 et 31/);
});

// ---------------------------------------------------------------------------
// Anneaux manquants et avertissements
// ---------------------------------------------------------------------------

test('un brouillon vide nomme tout ce qui manque, un par un', () => {
  const manques = manquesDuBail({ logementId: '', bailId: '' });
  assert.equal(manques.length, 5);
  assert.ok(manques.some((m) => /logement/.test(m)));
  assert.ok(manques.some((m) => /location en cours/.test(m)));
  assert.ok(manques.some((m) => /type de bail/.test(m)));
  assert.ok(manques.some((m) => /date de prise d’effet/.test(m)));
  assert.ok(manques.some((m) => /loyer/.test(m)));
});

test('une annexe obligatoire manquante est signalée, sans bloquer', () => {
  const b = brouillon('meuble', { annexesFournies: [] });
  assert.deepEqual(manquesDuBail(b), [], 'une annexe manquante ne doit pas bloquer');
  const avertissements = avertissementsDuBail(b);
  assert.ok(avertissements.some((a) => /Inventaire et état détaillé du mobilier/.test(a)));
  assert.ok(avertissements.some((a) => /Dossier de diagnostic technique/.test(a)));
});

test('une annexe fournie n’est plus signalée', () => {
  const b = brouillon('meuble', {
    annexesFournies: ['diagnostic_technique', 'etat_des_lieux_entree', 'inventaire_mobilier'],
  });
  const avertissements = avertissementsDuBail(b);
  assert.ok(!avertissements.some((a) => a.startsWith('Annexe obligatoire manquante')));
});

test('un bail conclu après le 1er octobre 2026 avertit sur les contrats types', () => {
  const avant = avertissementsDuBail(brouillon('vide', { dateDebut: '2026-09-30' }));
  assert.ok(!avant.some((a) => /contrats types/.test(a)));
  const apres = avertissementsDuBail(brouillon('vide', { dateDebut: '2026-10-01' }));
  assert.ok(apres.some((a) => /contrats types/.test(a)));
});

test('les avertissements rappellent les points de vigilance de la catégorie', () => {
  const avertissements = avertissementsDuBail(brouillon('colocation', { dureeMois: 36 }));
  assert.ok(avertissements.some((a) => /bail unique/.test(a)));
  assert.ok(avertissements.some((a) => /marié ou pacsé/.test(a)));
});

test('un brouillon sans catégorie n’avertit de rien', () => {
  assert.deepEqual(avertissementsDuBail({ logementId: 'l', bailId: 'b' }), []);
});

// ---------------------------------------------------------------------------
// Le parcours guidé : neuf étapes, et rien qui échappe au formulaire
// ---------------------------------------------------------------------------

test('les étapes s’enchaînent dans l’ordre, et s’arrêtent aux deux bouts', () => {
  const parcours: string[] = [ETAPES_BAIL[0].valeur];
  let courante = ETAPES_BAIL[0].valeur;
  let suivante = etapeSuivante(courante);
  while (suivante) {
    parcours.push(suivante);
    courante = suivante;
    suivante = etapeSuivante(courante);
  }
  // Le parcours doit couvrir les neuf étapes, dans l'ordre de la liste : une
  // étape oubliée dans l'enchaînement serait une étape jamais atteinte.
  assert.deepEqual(parcours, ETAPES_BAIL.map((e) => e.valeur));
  assert.equal(etapeSuivante(ETAPES_BAIL[ETAPES_BAIL.length - 1].valeur), null);

  const retour: string[] = [];
  let reculee: EtapeBail | null = ETAPES_BAIL[ETAPES_BAIL.length - 1].valeur;
  while (reculee) {
    retour.unshift(reculee);
    reculee = etapePrecedente(reculee);
  }
  assert.deepEqual(retour, ETAPES_BAIL.map((e) => e.valeur));
  assert.equal(etapePrecedente(ETAPES_BAIL[0].valeur), null);
});

test('aucune règle du contrôle final n’échappe au formulaire guidé', () => {
  // L'invariant qui compte : la réunion des manques de chaque étape doit être
  // exactement le contrôle final. Si les deux divergeaient, le formulaire
  // laisserait continuer là où le contrôle refuse — le bailleur ne
  // comprendrait l'empêchement qu'au dernier appui.
  const brouillons: BrouillonBail[] = [
    { logementId: '', bailId: '' },
    { logementId: 'log-1', bailId: '' },
    { logementId: 'log-1', bailId: 'bail-1' },
    { logementId: 'log-1', bailId: 'bail-1', categorie: 'vide' },
    brouillon('vide', { dureeMois: 24 }),
    brouillon('vide', { dureeMois: 72, bailleurPersonneMorale: true }),
    brouillon('etudiant', { dureeMois: 12 }),
    brouillon('mobilite', { dureeMois: 14, motifMobilite: '' }),
    brouillon('mobilite', { dureeMois: 6, motifMobilite: 'Stage', depotGarantie: 1 }),
    brouillon('vide', { jourEcheance: 0 }),
    brouillon('vide', { dateDebut: '2026-02-31' }),
    brouillon('vide'),
  ];

  for (const b of brouillons) {
    const parEtape = ETAPES_BAIL.flatMap((e) => manquesDeLEtape(b, e.valeur));
    assert.deepEqual(parEtape, manquesDuBail(b), `divergence sur ${JSON.stringify(b)}`);
  }
});

test('un manque est rattaché à l’étape qui le lève', () => {
  assert.deepEqual(manquesDeLEtape({ logementId: '', bailId: '' }, 'logement'), [
    'Aucun logement n’est rattaché à ce bail.',
  ]);
  // Un loyer hors plafond se corrige à l'étape du loyer, pas ailleurs.
  const depasse = brouillon('vide', { depotGarantie: 70000 * 2 });
  assert.equal(manquesDeLEtape(depasse, 'loyer').length, 1);
  assert.deepEqual(manquesDeLEtape(depasse, 'duree'), []);
  // Le motif du bail mobilité se demande avec le type, pas avec la durée.
  const mobilite = brouillon('mobilite', { dureeMois: 6, motifMobilite: '' });
  assert.match(manquesDeLEtape(mobilite, 'categorie')[0], /motif/);
});

test('une étape sans rien à corriger n’annonce rien', () => {
  const b = brouillon('vide');
  for (const etape of ETAPES_BAIL) {
    assert.deepEqual(manquesDeLEtape(b, etape.valeur), [], `étape ${etape.valeur}`);
  }
});

test('les diagnostics proposés n’annoncent aucune durée de validité', () => {
  // Les durées dépendent du diagnostic, de son résultat et de l'ancienneté de
  // l'installation. En coder une approximativement ferait croire le bailleur à
  // une vérification que l'application n'a pas faite.
  assert.ok(DIAGNOSTICS_PROPOSES.length >= 6);
  for (const libelle of DIAGNOSTICS_PROPOSES) {
    assert.ok(!/\d/.test(libelle), `durée ou chiffre dans « ${libelle} »`);
  }
});

// ---------------------------------------------------------------------------
// Reprise d'un brouillon enregistré
// ---------------------------------------------------------------------------

test('un brouillon repris garde ce qui a été saisi', () => {
  const repris = reprendreBrouillon(
    {
      categorie: 'meuble',
      dateDebut: '2026-11-01',
      dureeMois: 12,
      loyer: 65000,
      charges: 4000,
      depotGarantie: 130000,
      jourEcheance: 3,
      clausesParticulieres: 'Interdiction de fumer dans les parties communes.',
      residencePrincipale: false,
      annexesFournies: ['diagnostic_technique', 'inventaire_mobilier'],
      diagnostics: [{ libelle: 'DPE', date: '2025-01-01', aRenouveler: true }],
      signatures: [{ signataire: 'bailleur', nom: 'Dupont', date: '2026-10-01', trace: 'data:x' }],
    },
    brouillon('vide'),
  );

  assert.equal(repris.categorie, 'meuble');
  assert.equal(repris.dureeMois, 12);
  assert.equal(repris.loyer, 65000);
  assert.equal(repris.depotGarantie, 130000);
  assert.equal(repris.jourEcheance, 3);
  assert.equal(repris.residencePrincipale, false);
  assert.deepEqual(repris.annexesFournies, ['diagnostic_technique', 'inventaire_mobilier']);
  assert.equal(repris.diagnostics?.[0].aRenouveler, true);
  assert.equal(repris.signatures?.[0].nom, 'Dupont');
});

test('une valeur du mauvais type est ignorée, pas convertie', () => {
  // Le piège que ce contrôle existe pour éviter : `'36' < 36` est **faux**, donc
  // une durée écrite en texte ferait passer le minimum légal sans un mot.
  const repris = reprendreBrouillon(
    {
      categorie: 'vide',
      dureeMois: '36',
      loyer: '70000',
      depotGarantie: null,
      jourEcheance: 5.5,
      residencePrincipale: 'oui',
      meuble: 1,
    },
    brouillon('vide', { dureeMois: 36, loyer: 70000, jourEcheance: 5 }),
  );

  // Les valeurs de la location ont repris la main : elles, sont fiables.
  assert.equal(repris.dureeMois, 36);
  assert.equal(repris.loyer, 70000);
  assert.equal(repris.jourEcheance, 5);
  assert.equal(repris.residencePrincipale, undefined);
  assert.equal(repris.meuble, undefined);
  assert.equal(repris.depotGarantie, undefined);
});

test('une catégorie inconnue est ignorée, jamais acceptée', () => {
  const repris = reprendreBrouillon({ categorie: 'bail_ancien_contrat' }, brouillon('vide'));
  assert.equal(repris.categorie, 'vide');

  // Et une catégorie connue passe : le contrôle refuse l'inconnu, pas tout.
  assert.equal(reprendreBrouillon({ categorie: 'mobilite' }, brouillon('vide')).categorie, 'mobilite');
});

test('les listes sont filtrées élément par élément', () => {
  const repris = reprendreBrouillon(
    {
      annexesFournies: ['diagnostic_technique', 'annexe_qui_n_existe_pas', 42],
      diagnostics: [
        { libelle: 'Gaz', date: '2020-01-01' },
        { libelle: '', date: '2020-01-01' },
        'pas un objet',
        null,
      ],
      signatures: [
        { signataire: 'bailleur', nom: 'Dupont', date: '2026-10-01', trace: 'data:x' },
        { signataire: 'tit-1', nom: 'Sans tracé', date: '2026-10-01', trace: '' },
      ],
    },
    brouillon('vide'),
  );

  assert.deepEqual(repris.annexesFournies, ['diagnostic_technique']);
  assert.equal(repris.diagnostics?.length, 1);
  assert.equal(repris.diagnostics?.[0].libelle, 'Gaz');
  // Une signature sans tracé n'est pas une signature : la garder ferait
  // imprimer un cadre signé et vide.
  assert.equal(repris.signatures?.length, 1);
});

test('un brouillon illisible rend la base intacte', () => {
  const base = brouillon('vide');
  assert.deepEqual(reprendreBrouillon({}, base), base);
});

test('la colocation suit le régime du logement, vide ou meublé', () => {
  // Sans ce branchement, une colocation meublée de trois mois passait pour un
  // bail de trois ans : le champ « meublé » du brouillon n'était lu par aucune
  // règle.
  assert.equal(dureeMinimaleMois('colocation', false, false), 36);
  assert.equal(dureeMinimaleMois('colocation', true, false), 72);
  assert.equal(dureeMinimaleMois('colocation', false, true), 12);

  const trop_court = brouillon('colocation', { dureeMois: 3, meuble: true });
  assert.equal(manquesDuBail(trop_court).length, 1);
  assert.match(manquesDuBail(trop_court)[0], /12 mois/);
  assert.deepEqual(manquesDuBail(brouillon('colocation', { dureeMois: 12, meuble: true })), []);
});
