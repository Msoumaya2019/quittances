/**
 * Les locataires sur les documents : tous en gras, et leur civilité.
 *
 * Deux faits demandés depuis un téléphone, et **mesurés** plutôt que relus :
 *
 *  1. **Tous les locataires sont en gras** — le premier, le deuxième, et
 *     au-delà. Le défaut venait du modèle `colore` : sa carte des locataires
 *     n'enveloppait que la **première** ligne, parce qu'elle réemploie la carte
 *     du bailleur, où seule la première ligne est un nom et les suivantes une
 *     adresse. `classique`, `moderne` et le bail étaient déjà justes ; ils sont
 *     contrôlés ici pour que le prochain modèle ne réintroduise pas le défaut.
 *  2. **La civilité choisie s'imprime**, pour le locataire comme pour le
 *     bailleur, et une civilité vide n'imprime **rien**. C'est ce qui rend la
 *     migration additive : un locataire enregistré avant cette version garde des
 *     documents identiques à ceux d'avant.
 *
 * Le contrôle porte sur le **HTML rendu**, pas sur la source : le gras est une
 * balise. Mais dans le bail, la liste des parties met en gras par une **classe**
 * et une règle de style ; la règle est donc exigée elle aussi, sans quoi la
 * classe serait un vœu pieux et le contrôle passerait sur un document maigre.
 *
 * Ce que ce contrôle ne fait pas, et qui est dit ici pour qu'on ne le lui
 * demande pas : il ne mesure aucune hauteur et ne compte aucune page. Qu'un
 * texte en gras tienne sur la même ligne qu'en maigre se prouve à l'impression,
 * par les bancs de tenue en page.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  contenuDepuis,
  nomDuBailleur,
  nomDuLocataire,
  rendreBail,
  signataires,
  type ContenuBail,
  type PartieBailleur,
  type PartieLocataire,
  type SourcesBail,
} from '../src/pdf/bail.ts';
import { rendreHtml, type ContenuDocument } from '../src/pdf/models.ts';
import { corpsParties } from '../src/pdf/sections-constat.ts';
import {
  CIVILITES,
  LIBELLE_MODELE,
  MODELES_PROPOSES,
  civiliteStockee,
  nomPourDocument,
} from '../src/domain/types.ts';

const ICI = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Les locataires, et les documents
// ---------------------------------------------------------------------------

/**
 * Trois locataires, avec trois civilités différentes.
 *
 * Trois, et pas deux : c'est la seule façon que « le troisième » soit un cas
 * mesuré et non une théorie. Le premier porte `M.`, le deuxième `Mme`, le
 * troisième `Mlle` — les trois valeurs du sélecteur.
 */
const LOCATAIRES: PartieLocataire[] = [
  { id: 'tit-1', civilite: 'M.', nom: 'RAJAONAH', prenom: 'Hery Ny Ony' },
  { id: 'tit-2', civilite: 'Mme', nom: 'SONIZARA', prenom: 'Danie' },
  { id: 'tit-3', civilite: 'Mlle', nom: 'TROISIEME', prenom: 'Personne' },
];

/**
 * Les mêmes, tels que la quittance les imprime : une chaîne par locataire.
 *
 * Le nom est composé par la **règle du domaine** (`nomPourDocument`), et non
 * recopié ici : recopier le résultat ferait passer le contrôle même si la règle
 * changeait de forme. `civiliteStockee` est employé pour la même raison — c'est
 * lui qui décide de ce qu'une base peut porter, et il n'accepte que les trois
 * valeurs proposées.
 */
const LOCATAIRES_IMPRIMES = LOCATAIRES.map((l) =>
  nomPourDocument({
    id: l.id ?? '',
    bailId: 'bail-1',
    ordre: 1,
    civilite: civiliteStockee(l.civilite),
    nom: l.nom,
    prenom: l.prenom,
  }),
);

const BAILLEUR: PartieBailleur = {
  civilite: null,
  nom: 'SCI LES TILLEULS',
  qualite: null,
  adresse: '12 rue des Tilleuls',
  codePostal: '69003',
  ville: 'Lyon',
  telephone: null,
  email: null,
  siret: null,
};

const SOURCES: SourcesBail = {
  bailleur: BAILLEUR,
  logement: {
    nom: 'Appartement 1',
    adresse: '4 avenue de la République',
    codePostal: '69003',
    ville: 'Lyon',
    surface: 62,
  },
  locataires: LOCATAIRES,
};

const BROUILLON = { logementId: 'log-1', bailId: 'bail-1' };
const ETABLI_LE = '2026-09-24';

function bail(partiel: Partial<ContenuBail> = {}): ContenuBail {
  return {
    categorie: 'vide',
    bailleur: BAILLEUR,
    locataires: LOCATAIRES,
    logement: SOURCES.logement,
    dateDebut: '2026-10-01',
    dureeMois: 36,
    loyer: 70000,
    charges: 5000,
    depotGarantie: 70000,
    jourEcheance: 1,
    annexes: [],
    signatures: [],
    lieu: 'Lyon',
    etabliLe: ETABLI_LE,
    ...partiel,
  };
}

function quittance(partiel: Partial<ContenuDocument> = {}): ContenuDocument {
  return {
    type: 'quittance',
    numero: 'Q-2026-0001',
    periodeLibelle: 'Août 2026',
    dateEmission: '31 août 2026',
    emetteur: {
      nom: BAILLEUR.nom,
      civilite: '',
      adresse: ['12 RUE DES TILLEULS', '69003 LYON'],
      qualite: null,
      telephone: null,
      email: null,
      siret: null,
    },
    locataires: LOCATAIRES_IMPRIMES,
    logement: { nom: 'Appartement', adresse: ['33 rue des Marais', '95210 St Gratien'] },
    montants: { loyer: 118000, charges: 12000, total: 130000 },
    montantRecu: 130000,
    paiements: [{ date: '5 août 2026', modes: ['Virement'] }],
    dateEcheance: '05/08/2026',
    periodeDebut: '01/08/2026',
    periodeFin: '31/08/2026',
    echeanceLibelle: '5 août 2026',
    resteAPercevoir: 0,
    lieuEmission: 'MONTMAIGNY',
    signatureBase64: null,
    mentionLibre: '',
    mentionCharges: true,
    ...partiel,
  };
}

/**
 * Le texte du document, tel qu'un lecteur le voit : l'échappement défait.
 *
 * Le `<head>` et sa feuille de style sont retirés : une couleur ou un
 * `font-weight` écrits dans le CSS ne sont imprimés nulle part, et un contrôle
 * de contenu qui les lirait serait vert sur un document muet.
 */
function texte(html: string): string {
  const corps = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1];
  if (corps === undefined) {
    throw new Error('le rendu ne porte pas de <body> : le contrôle ne mesure rien');
  }
  return corps
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Le nom est-il mis en gras par une balise, et non par une couleur ou un style ? */
function enGras(html: string, nom: string): boolean {
  return html.includes(`<strong>${nom}</strong>`);
}

// ---------------------------------------------------------------------------
// 1. Tous les locataires en gras
// ---------------------------------------------------------------------------

describe('Tous les locataires sont en gras', () => {
  it('le contrôle porte sur au moins trois locataires', () => {
    assert.ok(
      LOCATAIRES.length >= 3,
      'le banc ne mesure que deux locataires : « le troisième et plus » ne serait pas un cas',
    );
  });

  for (const modele of MODELES_PROPOSES) {
    it(`« ${LIBELLE_MODELE[modele]} » met en gras le premier, le deuxième et le troisième`, () => {
      const html = rendreHtml(quittance(), modele);

      for (const nom of LOCATAIRES_IMPRIMES) {
        assert.ok(
          enGras(html, nom),
          `le modèle « ${modele} » n’écrit pas ${nom} en gras : le locataire 2 et les `
            + 'suivants se lisent comme une adresse',
        );
      }
    });
  }

  it('un document à un seul locataire le met aussi en gras', () => {
    for (const modele of MODELES_PROPOSES) {
      const html = rendreHtml(quittance({ locataires: [LOCATAIRES_IMPRIMES[0]] }), modele);
      assert.ok(
        enGras(html, LOCATAIRES_IMPRIMES[0]),
        `le modèle « ${modele} » ne met pas en gras un locataire unique`,
      );
    }
  });

  it('le bail met en gras chaque locataire, dans ses deux listes', () => {
    const html = rendreBail(bail());

    // La règle de style qui rend « nom » gras. Sans elle, la classe serait un
    // vœu pieux : le contrôle sur la classe passerait sur un document maigre.
    assert.match(
      html,
      /\.b-partie p\.nom \{[^}]*font-weight:\s*700/,
      'la règle qui met en gras la première ligne d’une partie a disparu : '
        + 'la classe « nom » ne ferait plus rien, et la liste des parties se lirait en maigre',
    );

    for (const l of LOCATAIRES) {
      const nom = nomDuLocataire(l);

      assert.ok(
        html.includes(`<div class="b-groupe"><p class="nom">${nom}</p>`),
        `le bail n’ouvre pas un groupe dont la première ligne est ${nom} : `
          + 'ce locataire ne serait pas en gras dans la liste des parties',
      );
      assert.ok(
        enGras(html, nom),
        `le bail n’écrit pas ${nom} en gras dans la liste des signatures`,
      );
    }

    // Un groupe par personne, plus celui du bailleur : sans cela, deux
    // locataires se liraient d'un trait et l'on ne saurait plus où finit le
    // premier.
    assert.equal(
      (html.match(/<div class="b-groupe">/g) ?? []).length,
      LOCATAIRES.length + 1,
      'le bail ne fait pas un groupe par locataire : les noms se suivraient sans séparation',
    );
  });

  it('les constats mettent en gras chaque locataire', () => {
    const html = corpsParties({
      bailleur: BAILLEUR,
      locataires: LOCATAIRES,
      mandataire: '',
    });

    for (const l of LOCATAIRES) {
      const nom = nomDuLocataire(l);
      assert.ok(
        enGras(html, nom),
        `l’état des lieux n’écrit pas ${nom} en gras : le locataire 2 et les suivants `
          + 'seraient moins lisibles que le premier',
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. La civilité devant le nom
// ---------------------------------------------------------------------------

describe('La civilité se place devant le nom', () => {
  it('un locataire se nomme civilité, prénom, nom', () => {
    assert.equal(
      nomDuLocataire({ civilite: 'Mlle', prenom: 'Danie', nom: 'SONIZARA' }),
      'Mlle Danie SONIZARA',
    );
    assert.equal(
      nomDuLocataire({ civilite: 'M.', prenom: 'Hery Ny Ony', nom: 'RAJAONAH' }),
      'M. Hery Ny Ony RAJAONAH',
    );
  });

  it('une civilité vide, nulle ou en blancs n’imprime rien du tout', () => {
    const attendu = 'Danie SONIZARA';

    for (const civilite of ['', null, undefined, '   ']) {
      assert.equal(
        nomDuLocataire({ civilite, prenom: 'Danie', nom: 'SONIZARA' }),
        attendu,
        `la civilité ${JSON.stringify(civilite)} ne doit rien imprimer : un document qui `
          + 'annoncerait « M. » sur une personne dont personne n’a rien dit affirmerait '
          + 'un fait que le bailleur n’a pas donné',
      );
    }
  });

  it('la quittance compose le nom du locataire avec sa civilité', () => {
    const base = { id: 'tit-1', bailId: 'bail-1', ordre: 1, nom: 'sonizara', prenom: 'Danie' };

    assert.equal(
      nomPourDocument({ ...base, civilite: 'Mlle' }),
      'Mlle Danie SONIZARA',
      'la quittance n’imprime pas la civilité devant le nom du locataire',
    );
    assert.equal(
      nomPourDocument({ ...base, civilite: '' }),
      'Danie SONIZARA',
      'une civilité vide ne doit pas laisser de trou devant le nom',
    );
    assert.equal(
      nomPourDocument({ ...base, civilite: 'Mme', nom: 'sonizara' }),
      'Mme Danie SONIZARA',
      'le nom de famille doit rester en capitales, quelle que soit la civilité',
    );
  });

  it('le bailleur suit les mêmes règles que le locataire', () => {
    assert.equal(nomDuBailleur({ ...BAILLEUR, civilite: 'Mme' }), 'Mme SCI LES TILLEULS');
    assert.equal(nomDuBailleur({ ...BAILLEUR, civilite: '' }), 'SCI LES TILLEULS');
    assert.equal(nomDuBailleur({ ...BAILLEUR, civilite: null }), 'SCI LES TILLEULS');
    assert.equal(nomDuBailleur(BAILLEUR), 'SCI LES TILLEULS');
  });

  it('la civilité du locataire s’imprime dans le bail', () => {
    const html = rendreBail(bail());

    for (const l of LOCATAIRES) {
      const nom = nomDuLocataire(l);
      assert.ok(
        texte(html).includes(nom),
        `le bail n’imprime pas « ${nom} » : la civilité du locataire ne serait pas sur le document`,
      );
    }
  });

  it('la civilité du bailleur s’imprime dans les trois modèles et dans le bail', () => {
    const civilite = 'Mme';

    for (const modele of MODELES_PROPOSES) {
      const corps = texte(
        rendreHtml(quittance({ emetteur: { ...quittance().emetteur, civilite } }), modele),
      );
      assert.ok(
        corps.includes(`${civilite} ${BAILLEUR.nom}`),
        `le modèle « ${modele} » n’imprime pas la civilité devant le nom du bailleur : `
          + 'les réglages l’annoncent pourtant « placée avant votre nom sur les documents »',
      );
    }

    assert.ok(
      texte(rendreBail(bail({ bailleur: { ...BAILLEUR, civilite } }))).includes(
        `${civilite} ${BAILLEUR.nom}`,
      ),
      'le bail n’imprime pas la civilité devant le nom du bailleur',
    );
  });

  it('la civilité réglée arrive jusqu’au bail', () => {
    const contenu = contenuDepuis({
      sources: SOURCES,
      brouillon: BROUILLON,
      reglages: { civiliteBailleur: 'M.' },
      etabliLe: ETABLI_LE,
    });

    assert.equal(
      contenu.bailleur.civilite,
      'M.',
      'la civilité saisie dans les réglages n’arrive pas jusqu’au contenu du bail',
    );
    assert.ok(
      texte(rendreBail(contenu)).includes(`M. ${BAILLEUR.nom}`),
      'la civilité réglée n’est pas imprimée sur le bail',
    );
  });

  it('sans civilité réglée, le bail est exactement celui d’avant', () => {
    // Aucune civilité nulle part : ni chez le bailleur, ni chez les locataires.
    // C'est l'état de tout ce qui a été enregistré avant cette version, et c'est
    // donc lui qu'il faut rendre pour dire quelque chose des documents déjà
    // remis.
    const sources: SourcesBail = {
      bailleur: BAILLEUR,
      logement: SOURCES.logement,
      locataires: LOCATAIRES.map(({ id, nom, prenom }) => ({ id, nom, prenom })),
    };

    const rendre = (reglages?: { civiliteBailleur?: string | null }) =>
      rendreBail(contenuDepuis({ sources, brouillon: BROUILLON, reglages, etabliLe: ETABLI_LE }));

    const reference = rendre();
    assert.equal(
      rendre({ civiliteBailleur: '' }),
      reference,
      'une civilité vide change le bail : les documents déjà remis ne seraient plus les mêmes',
    );
    assert.equal(
      rendre({ civiliteBailleur: null }),
      reference,
      'une civilité nulle change le bail : les documents déjà remis ne seraient plus les mêmes',
    );

    // La forme la plus précise de « rien devant le nom » : la première ligne de
    // la partie bailleur est le nom, et rien d'autre. Une civilité inventée s'y
    // glisserait, et un contrôle qui se contenterait d'un « ne contient pas Mme »
    // la laisserait passer.
    assert.ok(
      reference.includes(`<div class="b-groupe"><p class="nom">${BAILLEUR.nom}</p>`),
      'le bail place autre chose que le nom sur la première ligne du bailleur : '
        + 'une civilité que personne n’a saisie s’y serait glissée',
    );
    assert.doesNotMatch(
      texte(reference),
      /Mme|Mlle/,
      'le bail invente une civilité que le bailleur n’a pas saisie',
    );
  });

  it('sans civilité renseignée, les trois modèles disent le nom, et rien devant', () => {
    const sans = quittance({
      emetteur: { ...quittance().emetteur, civilite: '' },
      // Les locataires sont ici sans civilité : ce sont eux que l'on ne veut
      // pas voir précédés d'un mot que personne n'a choisi.
      locataires: ['Hery Ny Ony RAJAONAH', 'Danie SONIZARA'],
    });

    for (const modele of MODELES_PROPOSES) {
      const corps = texte(rendreHtml(sans, modele));

      assert.ok(
        corps.includes(BAILLEUR.nom),
        `le modèle « ${modele} » n’imprime pas le nom du bailleur`,
      );
      assert.doesNotMatch(
        corps,
        /M\.|Mme|Mlle/,
        `le modèle « ${modele} » invente une civilité que le bailleur n’a pas saisie`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Le choix, et la reconnaissance de ce qui est stocké
// ---------------------------------------------------------------------------

describe('La civilité se choisit, et se relit sans se deviner', () => {
  it('les trois civilités proposées sont exactement M., Mme et Mlle', () => {
    assert.deepEqual(
      [...CIVILITES],
      ['M.', 'Mme', 'Mlle'],
      'la liste des civilités proposées a changé : un écran et un document pourraient '
        + 'ne plus s’accorder sur ce qui s’imprime',
    );
  });

  it('les trois civilités se relisent telles quelles', () => {
    // Les trois valeurs sont nommées **une par une**, et non lues dans
    // `CIVILITES` : une liste dont une valeur aurait disparu se testerait alors
    // contre elle-même, et resterait verte.
    assert.equal(civiliteStockee('M.'), 'M.');
    assert.equal(civiliteStockee('Mme'), 'Mme');
    assert.equal(civiliteStockee('Mlle'), 'Mlle');
  });

  it('une civilité inconnue se lit comme vide', () => {
    // Ce qu'une base peut porter sans qu'aucun document ne l'ait proposé :
    // une valeur écrite à la main, une casse différente, un blanc de trop, ou
    // rien du tout. Aucune ne doit s'imprimer.
    for (const inconnue of ['Monsieur', 'mme', 'Mme ', ' M.', 'Mlle.', 'Dr', '', null, undefined]) {
      assert.equal(
        civiliteStockee(inconnue),
        '',
        `« ${String(inconnue)} » ne doit pas s’imprimer : ce serait un mot que le document `
          + 'n’a jamais proposé, et que personne n’a choisi dans la liste',
      );
    }
  });

  it('les deux écrans qui saisissent un locataire proposent les trois civilités', () => {
    // `attendus` est un plancher mesuré : la création d'un logement porte un
    // choix pour le titulaire **et** un pour chaque locataire ajouté.
    const ecrans = [
      { chemin: join('app', 'logement', 'nouveau.tsx'), attendus: 2 },
      { chemin: join('app', 'logement', '[id]', 'locataires.tsx'), attendus: 1 },
    ];

    for (const { chemin, attendus } of ecrans) {
      const source = readFileSync(join(ICI, '..', chemin), 'utf8');

      assert.ok(
        source.includes("'@/ui/components"),
        `${chemin} n’importe pas le contrôle partagé : il en aurait recopié un, et les `
          + 'deux écrans finiraient par ne plus proposer la même chose',
      );

      const poses = (source.match(/<ChoixCivilite/g) ?? []).length;
      assert.ok(
        poses >= attendus,
        `${chemin} ne pose le choix de civilité que ${poses} fois (${attendus} attendues) : `
          + 'le bailleur ne pourrait pas la saisir partout où un locataire se saisit',
      );
    }
  });

  it('le contrôle partagé tire ses valeurs du domaine', () => {
    const composant = readFileSync(
      join(ICI, '..', 'src', 'ui', 'components', 'ChoixCivilite.tsx'),
      'utf8',
    );

    // Le contrôle porte sur la **ligne d'import**, et non sur une occurrence
    // perdue dans le fichier : un composant qui importerait la liste tout en la
    // recopiant ailleurs ne serait pas plus juste pour autant, et un `grep`
    // satisfait par le mot « CIVILITES » ne le verrait pas.
    const ligne = composant
      .split('\n')
      .find((l) => l.includes("from '../../domain/types'"));

    assert.ok(
      ligne !== undefined,
      'le contrôle de civilité n’importe rien du domaine : la liste des civilités y est recopiée',
    );
    assert.match(
      ligne,
      /\bCIVILITES\b/,
      'le contrôle recopie la liste des civilités au lieu de la prendre au domaine : '
        + 'il pourrait proposer une valeur que le document refuse d’imprimer',
    );
  });
});

// ---------------------------------------------------------------------------
// 4. La signature se retrouve par identifiant
// ---------------------------------------------------------------------------

describe('La signature d’un locataire se retrouve par identifiant', () => {
  const TRACE = 'data:image/svg+xml;base64,PHN2Zy8+';

  /** Le nom tel qu'il figure sur le document, pour retrouver le signataire. */
  const nomDe = (rang: number) => nomDuLocataire(LOCATAIRES[rang]);

  /** Une signature telle que l'écran de saisie l'écrit : clavée par identifiant. */
  const signeePar = (cle: string, nom: string) => ({
    signataire: cle,
    nom,
    date: '2026-09-24',
    trace: TRACE,
  });

  it('une signature clavée par identifiant est rendue au bon locataire', () => {
    // C'est **exactement** ce que l'écran de saisie écrit : l'identifiant du
    // titulaire, jamais son nom. Mesuré le 24 septembre 2026 : le document
    // cherchait par nom, ne trouvait rien, et un bail signé s'imprimait
    // « Non signé ».
    const liste = signataires(bail({ signatures: [signeePar('tit-2', nomDe(1))] }));
    const signataire = liste.find((s) => s.nom === nomDe(1));

    assert.ok(signataire !== undefined, 'le locataire 2 ne figure pas parmi les signataires');
    assert.equal(
      signataire.signature?.trace,
      TRACE,
      'la signature clavée par identifiant n’est pas retrouvée : le bail s’imprimerait '
        + '« Non signé » sur un document pourtant signé',
    );
  });

  it('la signature d’un locataire ne se pose sur aucun autre', () => {
    const liste = signataires(bail({ signatures: [signeePar('tit-2', nomDe(1))] }));

    for (const rang of [0, 2]) {
      const autre = liste.find((s) => s.nom === nomDe(rang));
      assert.equal(
        autre?.signature,
        undefined,
        `la signature du locataire 2 se retrouve sur ${nomDe(rang)} : deux personnes `
          + 'porteraient le même accord',
      );
    }
  });

  it('le nom reste un second recours, pour un document déjà rangé', () => {
    // Des documents établis avant que l'identifiant ne soit transmis portent un
    // nom pour clé. Ils doivent rester lisibles : c'est la promesse qu'une mise
    // à jour ne rend pas illisible ce que le bailleur a déjà chez lui.
    const liste = signataires(bail({ signatures: [signeePar(nomDe(2), nomDe(2))] }));
    const signataire = liste.find((s) => s.nom === nomDe(2));

    assert.equal(
      signataire?.signature?.trace,
      TRACE,
      'un document déjà rangé, dont la signature est clavée par nom, ne se relit plus',
    );
  });

  it('l’émission du bail transmet l’identifiant de chaque locataire', () => {
    // Sans ce passage, le document n'a aucun identifiant à chercher et
    // retomberait sur le nom : la correction serait écrite et sans effet.
    const source = readFileSync(join(ICI, '..', 'src', 'pdf', 'emettre-bail.ts'), 'utf8');

    assert.match(
      source,
      /^\s*id: t\.id,$/m,
      'l’émission du bail ne transmet plus l’identifiant des titulaires : '
        + 'la signature ne pourrait plus être retrouvée, et le document dirait « Non signé »',
    );
    assert.match(
      source,
      /^\s*civilite: t\.civilite,$/m,
      'l’émission du bail ne transmet plus la civilité des titulaires',
    );
  });
});
