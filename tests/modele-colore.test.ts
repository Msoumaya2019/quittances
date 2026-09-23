/**
 * Modèle coloré : le fond, et la forme.
 *
 * Le contrôle qui compte ici n'est pas « le modèle coloré contient-il des
 * couleurs ? » — c'est **« les trois modèles disent-ils la même chose ? »**.
 * Choisir une présentation ne doit jamais retirer une information : c'est la
 * promesse qui rend le réglage anodin, et c'est elle qui est vérifiée, modèle
 * par modèle, sur les mêmes données.
 *
 * Le second contrôle porte sur le **tampon**. Il est piloté par
 * `resteAPercevoir`, la décision du domaine : un document ne peut donc pas
 * affirmer « Payé » sur un mois qui ne l'est pas, quel que soit le modèle.
 *
 * Ce que ce contrôle ne fait pas : il ne mesure aucune hauteur, et ne compte
 * aucune page. La tenue en page se prouve par `.verif/eprouver-paiements.py`,
 * qui imprime réellement chaque modèle avec 1 à 20 encaissements.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { rendreHtml, type ContenuDocument } from '../src/pdf/models.ts';
import { COULEURS_COLORE } from '../src/pdf/styles-colore.ts';
import { MODELES_PROPOSES, LIBELLE_MODELE } from '../src/domain/types.ts';

/**
 * Le texte du **document**, tel qu'un lecteur le voit : l'échappement défait.
 *
 * Le `<head>` et sa feuille de style sont retirés. Ce n'est pas un détail de
 * confort : un commentaire CSS n'est imprimé nulle part, et le contrôle du
 * tampon se satisfaisait de la phrase « Payé … Reste à payer » écrite en
 * commentaire dans `styles-colore.ts`. Il serait donc resté vert sur un
 * document qui n'affiche aucun tampon.
 *
 * L'absence de `<body>` fait échouer le contrôle au lieu de le laisser lire le
 * document entier : un motif devenu faux ne doit pas rendre le contrôle plus
 * permissif, mais le rendre bruyant.
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

/** Un contenu complet, sur lequel les trois modèles sont comparés. */
function contenu(partiel: Partial<ContenuDocument> = {}): ContenuDocument {
  return {
    type: 'quittance',
    numero: 'Q-2026-0001',
    periodeLibelle: 'Août 2026',
    dateEmission: '31 août 2026',
    emetteur: {
      nom: "SCI CHIKER'S HOUSE",
      civilite: '',
      adresse: ['8 RUE DE PIERREFITTE', '95360 MONTMAIGNY'],
      qualite: null,
      telephone: '06 00 00 00 00',
      email: 'contact@exemple.fr',
      siret: '12345678900012',
    },
    locataires: ['M. RAJAONAH Hery Ny Ony', 'Mme SONIZARA Danie'],
    logement: {
      nom: 'Appartement',
      adresse: ['2ème étage, appartement 443', '33 rue des Marais', '95210 St Gratien'],
    },
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
 * Les informations qu'aucun modèle n'a le droit d'oublier.
 *
 * Elles sont cherchées dans le texte **défait de son échappement**, pour que le
 * contrôle porte sur ce qu'un lecteur voit, et non sur la façon dont le HTML
 * l'écrit — l'apostrophe de `CHIKER'S` est échappée dans la source.
 */
const INFORMATIONS_OBLIGATOIRES: [string, string][] = [
  ['numéro du document', 'Q-2026-0001'],
  ['période', 'Août 2026'],
  ['date d’émission', '31 août 2026'],
  ['nom du bailleur', "SCI CHIKER'S HOUSE"],
  ['adresse du bailleur', '8 RUE DE PIERREFITTE'],
  ['premier locataire', 'M. RAJAONAH Hery Ny Ony'],
  ['second locataire', 'Mme SONIZARA Danie'],
  ['nom du logement', 'Appartement'],
  ['adresse du logement', '33 rue des Marais'],
  ['loyer', '1 180,00 €'],
  ['charges', '120,00 €'],
  ['total', '1 300,00 €'],
  ['date d’encaissement', '5 août 2026'],
  ['mode d’encaissement', 'Virement'],
  ['mention légale de quittance', 'et lui en donne quittance, sous réserve de tous droits'],
  ['référence à la loi de 1989', 'Loi n° 89-462 du 6 juillet 1989'],
  ['rappel au locataire', 'Conservez ce document'],
];

describe('Modèle coloré : les trois modèles portent les mêmes informations', () => {
  for (const modele of MODELES_PROPOSES) {
    it(`« ${LIBELLE_MODELE[modele]} » n’oublie rien`, () => {
      const rendu = texte(rendreHtml(contenu(), modele));

      for (const [quoi, attendu] of INFORMATIONS_OBLIGATOIRES) {
        assert.ok(
          rendu.includes(attendu),
          `le modèle « ${modele} » ne porte pas ${quoi} (${attendu})`,
        );
      }
    });
  }

  it('les trois modèles sont bien distincts', () => {
    const rendus = MODELES_PROPOSES.map((m) => rendreHtml(contenu(), m));

    assert.equal(
      new Set(rendus).size,
      MODELES_PROPOSES.length,
      'deux modèles produisent le même document : le réglage ne changerait rien',
    );
  });
});

describe('Modèle coloré : le tampon suit le domaine, jamais le modèle', () => {
  it('porte « Payé » quand il ne reste rien à percevoir', () => {
    const rendu = texte(rendreHtml(contenu({ resteAPercevoir: 0 }), 'colore'));

    assert.match(
      rendu,
      /Payé/,
      'le document n’annonce pas « Payé » alors que le domaine dit qu’il ne reste '
        + 'rien à percevoir',
    );
    assert.doesNotMatch(
      rendu,
      /Reste à payer/,
      'le document annonce « Reste à payer » alors que le domaine dit le contraire',
    );
  });

  it('porte « Reste à payer » quand il reste quelque chose', () => {
    const rendu = texte(rendreHtml(contenu({ resteAPercevoir: 30000 }), 'colore'));

    assert.match(
      rendu,
      /Reste à payer/,
      'le document n’annonce pas « Reste à payer » alors que le domaine dit qu’il '
        + 'reste quelque chose à percevoir',
    );
  });
});

/**
 * Un document ne peut pas se contredire, ni s'annoncer réglé quand il ne l'est
 * pas.
 *
 * Mesuré le 23 septembre 2026 : le modèle coloré annonçait « Total réglé »
 * au-dessus du total dû, suivi du tampon « Reste à payer », sur un reçu d'un
 * versement partiel. Les deux autres modèles nommaient déjà le montant reçu.
 *
 * Le contrôle porte sur les trois modèles, et pas seulement sur le coloré : la
 * règle est celle de tous, et c'est ce qui empêche le prochain modèle de
 * réintroduire le défaut.
 *
 * Il n'exige **aucun tampon** : tous les modèles n'en portent pas, et une
 * absence de tampon n'est pas une affirmation fausse. Ce qui est exigé, c'est
 * que le montant reçu, le reste dû et la nature du document soient lisibles —
 * trois faits, quelle que soit la mise en page.
 */
describe('Un reçu partiel ne s’annonce pas réglé', () => {
  const partiel = contenu({
    type: 'recu',
    numero: 'R-2026-0001',
    montantRecu: 50000,
    resteAPercevoir: 80000,
  });

  for (const modele of MODELES_PROPOSES) {
    it(`« ${LIBELLE_MODELE[modele]} » nomme le montant reçu et le reste dû`, () => {
      const rendu = texte(rendreHtml(partiel, modele));

      assert.ok(
        rendu.includes('500,00 €'),
        `le modèle « ${modele} » n’imprime pas le montant reçu`,
      );
      assert.ok(
        rendu.includes('800,00 €'),
        `le modèle « ${modele} » n’imprime pas le reste à percevoir`,
      );
      assert.doesNotMatch(
        rendu,
        /Total réglé/,
        `le modèle « ${modele} » annonce un total réglé sur un reçu partiel`,
      );
      assert.match(
        rendu,
        /ne vaut pas quittance/,
        `le modèle « ${modele} » ne dit pas qu’un reçu n’est pas une quittance`,
      );
    });
  }

  it('le modèle coloré porte « Reste à payer », et pas « Payé »', () => {
    const rendu = texte(rendreHtml(partiel, 'colore'));

    assert.match(
      rendu,
      /Reste à payer/,
      'le modèle coloré n’annonce pas le reste à payer sur un reçu partiel',
    );
    assert.doesNotMatch(
      rendu,
      /Payé/,
      'le modèle coloré annonce « Payé » sur un reçu partiel',
    );
  });
});

describe('Modèle coloré : sa palette ne suit pas le thème', () => {
  it('emploie ses propres couleurs, écrites en dur', () => {
    const rendu = rendreHtml(contenu(), 'colore');

    assert.ok(
      rendu.includes(COULEURS_COLORE.principale),
      'le document ne porte pas la couleur principale du modèle coloré : '
        + 'il suivrait donc le thème, et changer de thème changerait une '
        + 'quittance déjà remise',
    );
    assert.ok(
      rendu.includes(COULEURS_COLORE.principaleFonce),
      'le document ne porte pas la couleur foncée de sa palette',
    );
  });
});

describe('Le modèle retiré reste nommé', () => {
  it('« officiel » n’est plus proposé', () => {
    assert.ok(
      !(MODELES_PROPOSES as readonly string[]).includes('officiel'),
      'le modèle retiré est encore proposé dans les réglages',
    );
  });

  it('« officiel » garde un libellé, pour les documents déjà émis', () => {
    // Des documents émis avant le retrait portent ce modèle. Le libellé doit
    // continuer de le nommer : sans lui, la fiche d'un ancien document
    // afficherait un modèle vide, et l'on croirait à un défaut d'affichage.
    assert.equal(typeof LIBELLE_MODELE.officiel, 'string');
    assert.ok(
      LIBELLE_MODELE.officiel.length > 0,
      'le modèle retiré n’a plus de libellé : la fiche d’un ancien document '
        + 'afficherait un modèle vide, et l’on croirait à un défaut d’affichage',
    );
    assert.match(
      LIBELLE_MODELE.officiel,
      /ancien/,
      'le libellé ne dit pas que le modèle n’est plus proposé',
    );
  });

  it('les trois modèles proposés ont chacun un libellé', () => {
    for (const modele of MODELES_PROPOSES) {
      assert.ok(
        LIBELLE_MODELE[modele]?.length > 0,
        `le modèle « ${modele} » n’a pas de libellé`,
      );
    }
  });
});
