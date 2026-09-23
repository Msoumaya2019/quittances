/**
 * Modèle officiel : la feuille du bailleur.
 *
 * Ce modèle reproduit un document papier fourni par le bailleur. Les contrôles
 * portent donc sur ce qui est vérifiable dans le texte produit : les mentions
 * relevées sur le papier, les couleurs mesurées, la structure des deux volets,
 * et surtout la règle qui empêche le document d'affirmer un paiement que la
 * base ne porte pas.
 *
 * Les comparaisons de texte passent par `texte()`, qui défait l'échappement
 * HTML. Sans cela, « l' » écrit `&#39;` ferait échouer la comparaison alors que
 * le document imprimé est juste — le contrôle porterait sur l'encodage au lieu
 * de porter sur le contenu.
 *
 * Ce qui relève du rendu — la tenue sur une page, les positions au millimètre —
 * ne se vérifie pas ici : `node --test` n'a pas de moteur de mise en page. Le
 * banc `.verif/rendre-officiel.ts` produit la feuille, à rasteriser pour la
 * comparer au modèle.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { rendreHtml, type ContenuDocument } from '../src/pdf/models.ts';
import { MENTION_ANNULATION_RECUS, MENTION_RESERVE_DROITS } from '../src/pdf/legal.ts';
import { STYLES_OFFICIEL } from '../src/pdf/styles-officiel.ts';

/** Le texte tel qu'un lecteur le voit : l'échappement HTML défait. */
function texte(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Le contenu du modèle papier, transcrit tel quel. */
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
      telephone: null,
      email: null,
      siret: null,
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

function officiel(partiel: Partial<ContenuDocument> = {}): string {
  return rendreHtml(contenu(partiel), 'officiel');
}

describe('Modèle officiel : structure de la feuille', () => {
  it('ne produit qu’un volet et un talon', () => {
    const html = officiel();
    assert.equal(html.match(/<section class="volet /g)?.length, 1, 'un seul volet');
    assert.equal(html.match(/<div class="talon">/g)?.length, 1, 'un seul talon');
    assert.equal(html.match(/<div class="feuille">/g)?.length, 1, 'une seule feuille');
  });

  it('déclare une page A4 sans marge, comme le modèle', () => {
    assert.match(STYLES_OFFICIEL, /@page\s*\{\s*size:\s*A4;\s*margin:\s*0;\s*\}/);
    assert.match(STYLES_OFFICIEL, /\.feuille\s*\{[^}]*height:\s*297mm/);
  });

  it('garde ses volets sous la hauteur de la page', () => {
    // Le talon est fixe, le volet prend le reste : leur minimum additionné doit
    // tenir dans 297 mm, sinon la feuille déborderait sur une deuxième page —
    // et le talon, qui doit être découpé, partirait seul sur la seconde.
    const talon = Number(/\.talon\s*\{[^}]*flex:\s*0 0 ([\d.]+)mm/.exec(STYLES_OFFICIEL)?.[1]);
    const volet = Number(/\.volet\s*\{[^}]*min-height:\s*([\d.]+)mm/.exec(STYLES_OFFICIEL)?.[1]);

    assert.ok(Number.isFinite(talon) && talon > 0, 'hauteur du talon lisible');
    assert.ok(Number.isFinite(volet) && volet > 0, 'hauteur minimale du volet lisible');
    assert.ok(
      talon + volet <= 297,
      `talon ${talon} mm + volet ${volet} mm dépassent la page de 297 mm`,
    );
  });

  it('porte les couleurs relevées sur le modèle', () => {
    const html = officiel();
    // Bandeau d'en-tête et onglet, fond du talon, rouge du tampon, bleu des
    // intitulés : quatre valeurs mesurées au pixel sur le papier du bailleur.
    for (const couleur of ['#32558D', '#DCE9F2', '#A4092B', '#005FA4']) {
      assert.ok(html.includes(couleur), `la couleur ${couleur} doit figurer`);
    }
  });

  it('porte la bande verticale du talon', () => {
    const html = officiel();
    assert.match(html, /<div class="bande-originale"><span>DOCUMENT ORIGINAL<\/span><\/div>/);
    assert.match(STYLES_OFFICIEL, /writing-mode:\s*vertical-rl/);
  });
});

describe('Modèle officiel : le contenu du papier du bailleur', () => {
  it('reprend les deux mentions légales mot pour mot', () => {
    const html = texte(officiel());
    assert.ok(html.includes(MENTION_RESERVE_DROITS), 'mention de réserve des droits');
    assert.ok(html.includes(MENTION_ANNULATION_RECUS), 'mention d’annulation des reçus');
  });

  it('n’imprime les mentions du bailleur que sur une quittance', () => {
    // Ces phrases parlent de ce que la quittance annule et se réserve. Les
    // poser sur un reçu ou un avis d'échéance leur ferait dire autre chose.
    const avis = texte(officiel({ type: 'avis_echeance', resteAPercevoir: 130000 }));
    assert.ok(!avis.includes(MENTION_RESERVE_DROITS));
    assert.ok(!avis.includes(MENTION_ANNULATION_RECUS));
    assert.ok(avis.includes("Cet avis d'échéance est un document d'information."));
  });

  it('reprend l’en-tête et les deux lignes du tableau', () => {
    const html = officiel();
    assert.ok(html.includes('Désignation des locaux ou opérations'));
    assert.match(STYLES_OFFICIEL, /text-transform:\s*uppercase/);
    assert.ok(html.includes('<div class="ligne">Appartement</div>'));
    assert.ok(html.includes('<div class="ligne">Provisions sur charges</div>'));
  });

  it('sépare loyer et charges, et les additionne dans la ligne de total', () => {
    const html = officiel();
    assert.ok(html.includes('<div class="ligne">1 180,00 €</div>'), 'loyer');
    assert.ok(html.includes('<div class="ligne">120,00 €</div>'), 'charges');
    assert.match(html, /<div class="montant-total">1 300,00 €<\/div>/);
  });

  it('n’ajoute pas de ligne de charges quand il n’y en a pas', () => {
    const html = officiel({ montants: { loyer: 130000, charges: 0, total: 130000 } });
    assert.ok(!html.includes('Provisions sur charges'));
    assert.match(html, /<div class="montant-total">1 300,00 €<\/div>/);
  });

  it('imprime les bornes de la période et l’exigibilité', () => {
    const html = texte(officiel());
    assert.match(html, /DU 01\/08\/2026 AU 31\/08\/2026/);
    assert.match(html, /<span class="etiquette">Période :<\/span>\s*DU 01\/08\/2026/);
    assert.ok(html.includes('Loyer exigible le 5 août 2026'));
  });

  it('place la colonne de désignation en bleu pour une quittance, en crème sinon', () => {
    assert.match(officiel(), /colonne-designation colonne-bleue/);
    assert.match(
      officiel({ type: 'avis_echeance', resteAPercevoir: 130000 }),
      /colonne-designation colonne-creme/,
    );
  });
});

describe('Modèle officiel : le solde commande l’onglet et le tampon', () => {
  it('ne tamponne « payé » que si le mois est soldé', () => {
    assert.match(officiel({ resteAPercevoir: 0 }), /<span class="tampon">Payé<\/span>/);
    assert.ok(!officiel({ resteAPercevoir: 1 }).includes('class="tampon"'));
  });

  it('laisse l’onglet vide quand tout est réglé, comme sur le modèle', () => {
    assert.match(officiel({ resteAPercevoir: 0 }), /<div class="onglet"><\/div>/);
  });

  it('écrit « A PAYER » dès qu’il reste quelque chose à percevoir', () => {
    assert.match(
      officiel({ type: 'avis_echeance', resteAPercevoir: 130000 }),
      /<div class="onglet">A PAYER<\/div>/,
    );
    // Un reçu de paiement partiel porte la même mention : le solde n'est pas nul.
    assert.match(officiel({ type: 'recu', resteAPercevoir: 50000 }), /A PAYER/);
  });

  it('n’affirme jamais « payé » et « à payer » en même temps', () => {
    for (const reste of [0, 1, 50000, 130000]) {
      const html = officiel({ resteAPercevoir: reste });
      const tampon = html.includes('class="tampon"');
      const aPayer = html.includes('>A PAYER<');
      assert.notEqual(tampon, aPayer, `solde ${reste} : tampon et onglet doivent se contredire`);
    }
  });
});

describe('Modèle officiel : échappement', () => {
  it('neutralise les caractères actifs d’un nom ou d’une adresse', () => {
    const html = officiel({
      locataires: ['M. <script>alert(1)</script>'],
      logement: { nom: 'Appartement & Cie', adresse: ['1 rue <b>Bold</b>'] },
    });

    assert.ok(!html.includes('<script>'), 'aucune balise script ne doit subsister');
    assert.ok(!html.includes('<b>Bold</b>'), 'aucune balise injectée ne doit subsister');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('Appartement &amp; Cie'));
    // Et le texte redevient lisible une fois l'échappement défait.
    assert.ok(texte(html).includes('M. <script>alert(1)</script>'));
  });

  it('conserve le texte des mentions sans le réécrire', () => {
    // Les mentions contiennent des apostrophes : elles ne doivent pas être
    // altérées par l'échappement, ni tronquées au premier caractère spécial.
    const html = texte(officiel());
    assert.ok(html.includes('sous réserve de tous les droits et actions du propriétaire'));
    assert.ok(html.includes("n'emporte pas présomption de paiement des termes antérieurs"));
    assert.ok(html.includes("ne saurait être considérée comme un titre de location"));
  });
});
