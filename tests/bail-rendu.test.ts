/**
 * Le rendu du bail.
 *
 * Le module est **pur** : il produit du HTML, et se vérifie donc sous
 * `node --test`, sans émulateur. Ce qu'on y protège n'est pas l'esthétique mais
 * trois choses qui engage­raient le bailleur :
 *
 *  - aucune donnée saisie ne peut s'échapper en balise ;
 *  - une signature dessinée à l'écran est **dite** pour ce qu'elle est ;
 *  - les fondements imprimés sont ceux qu'on a réellement lus.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatMontant } from '../src/domain/money.ts';
import { CATEGORIES_BAIL } from '../src/domain/bail.ts';
import {
  MENTION_SIGNATURE,
  finDuBail,
  finDuBailISO,
  rendreBail,
  signataires,
  traceEnDataUri,
} from '../src/pdf/bail.ts';
import type { ContenuBail } from '../src/pdf/bail.ts';

function contenu(extra: Partial<ContenuBail> = {}): ContenuBail {
  return {
    categorie: 'vide',
    bailleur: {
      nom: 'SCI Les Tilleuls',
      qualite: 'Représentée par Mme Dupont',
      adresse: '12 rue des Tilleuls',
      codePostal: '69003',
      ville: 'Lyon',
      telephone: '06 12 34 56 78',
      email: 'contact@tilleuls.fr',
      siret: '12345678900011',
    },
    locataires: [{ nom: 'Benali', prenom: 'Mohamed' }],
    logement: {
      nom: 'Appartement 1',
      complement: 'Bâtiment B',
      adresse: '4 avenue de la République',
      codePostal: '69003',
      ville: 'Lyon',
      surface: 62,
    },
    dateDebut: '2026-10-01',
    dureeMois: 36,
    loyer: 70000,
    charges: 5000,
    depotGarantie: 70000,
    jourEcheance: 1,
    diagnostics: [{ libelle: 'DPE', date: '2025-03-12' }],
    clausesParticulieres: 'Aucun animal.',
    annexes: ['diagnostic_technique', 'etat_des_lieux_entree'],
    signatures: [],
    lieu: 'Lyon',
    etabliLe: '2026-09-24',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

test('le rendu produit un document HTML complet', () => {
  const html = rendreBail(contenu());
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<\/html>$/);
  assert.match(html, /<meta charset="utf-8" \/>/);
});

test('les dix sections du bail sont présentes', () => {
  const html = rendreBail(contenu());
  for (const titre of [
    'Les parties',
    'Le logement',
    'Durée du bail',
    'Loyer, charges et dépôt de garantie',
    'Diagnostics',
    'Clauses particulières',
    'Points de vigilance de ce type de bail',
    'Annexes',
    'Signatures',
    'Fondements',
  ]) {
    assert.ok(html.includes(titre), `section absente : ${titre}`);
  }
});

test('le nom du bailleur, son SIRET et son adresse figurent', () => {
  const html = rendreBail(contenu());
  assert.ok(html.includes('SCI Les Tilleuls'));
  assert.ok(html.includes('12345678900011'));
  assert.ok(html.includes('12 rue des Tilleuls'));
  assert.ok(html.includes('69003 Lyon'));
});

test('chaque locataire figure sur le document', () => {
  const html = rendreBail(
    contenu({
      locataires: [
        { nom: 'Benali', prenom: 'Mohamed' },
        { nom: 'Traoré', prenom: 'Aïcha' },
      ],
    }),
  );
  assert.ok(html.includes('Mohamed Benali'));
  assert.ok(html.includes('Aïcha Traoré'));
  assert.ok(html.includes('Locataires'), 'l’étiquette doit se mettre au pluriel');
});

test('la civilité du locataire n’est jamais inventée', () => {
  // La base ne porte pas la civilité. Écrire « Né le » ou « Née le » revient à
  // la deviner : la première version du document annonçait
  // « Mohamed Benali — Née le 17/04/1988 ».
  const html = rendreBail(
    contenu({
      locataires: [{ nom: 'Benali', prenom: 'Mohamed', dateNaissance: '1988-04-17' }],
    }),
  );
  assert.ok(html.includes('Naissance : 17/04/1988'));
  assert.ok(!/N[ée]+e? le /.test(html), 'le document ne doit pas genrer le locataire');
});

test('chaque partie est un groupe distinct, jamais une suite de lignes', () => {
  const html = rendreBail(
    contenu({
      locataires: [
        { nom: 'Benali', prenom: 'Mohamed' },
        { nom: 'Traoré', prenom: 'Aïcha' },
      ],
    }),
  );
  const groupes = html.match(/class="b-groupe"/g) ?? [];
  assert.equal(groupes.length, 3, 'un groupe pour le bailleur, un par locataire');
});

// ---------------------------------------------------------------------------
// Échappement
// ---------------------------------------------------------------------------

test('une balise saisie dans les clauses est échappée, jamais exécutée', () => {
  const html = rendreBail(
    contenu({ clausesParticulieres: '<script>alert("x")</script> & <b>gras</b>' }),
  );
  assert.ok(!html.includes('<script>'), 'le script ne doit pas traverser');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
});

test('une balise saisie dans le nom du logement est échappée', () => {
  const html = rendreBail(
    contenu({ logement: { ...contenu().logement, nom: '<img src=x onerror=1>' } }),
  );
  assert.ok(!html.includes('<img src=x'), 'la balise ne doit pas traverser');
  assert.ok(html.includes('&lt;img'));
});

// ---------------------------------------------------------------------------
// Durée
// ---------------------------------------------------------------------------

test('un bail de douze mois finit la veille de son anniversaire', () => {
  assert.equal(finDuBail('2026-10-01', 12), '30/09/2027');
});

test('un bail de trois ans finit la veille du troisième anniversaire', () => {
  assert.equal(finDuBail('2026-10-01', 36), '30/09/2029');
});

test('un bail de neuf mois finit la veille du neuvième mois', () => {
  assert.equal(finDuBail('2026-09-15', 9), '14/06/2027');
});

test('une durée d’un mois ne déborde pas sur le mois suivant', () => {
  assert.equal(finDuBail('2027-01-31', 1), '27/02/2027');
});

test('la date de fin imprimée est celle du calcul', () => {
  const html = rendreBail(contenu({ dateDebut: '2026-10-01', dureeMois: 36 }));
  assert.ok(html.includes('30/09/2029'));
  assert.ok(html.includes('36 mois'));
});

// ---------------------------------------------------------------------------
// Argent et dépôt de garantie
// ---------------------------------------------------------------------------

test('le loyer, les charges et leur total sont imprimés', () => {
  const html = rendreBail(contenu());
  assert.ok(html.includes(formatMontant(70000)));
  assert.ok(html.includes(formatMontant(5000)));
  assert.ok(html.includes(formatMontant(75000)), 'le total mensuel doit apparaître');
});

test('un dépôt de garantie interdit est imprimé comme interdit', () => {
  const html = rendreBail(
    contenu({
      categorie: 'mobilite',
      dureeMois: 6,
      depotGarantie: 0,
      motifMobilite: 'Stage de six mois',
    }),
  );
  assert.ok(html.includes('Interdit pour ce type de bail'));
  assert.ok(!html.includes(formatMontant(0) + ' (plafond'), 'aucun montant ne doit être annoncé');
});

test('le plafond légal du dépôt est rappelé avec le montant', () => {
  const html = rendreBail(contenu({ categorie: 'meuble', dureeMois: 12, depotGarantie: 140000 }));
  assert.ok(html.includes('plafond légal : 2 mois'));
});

// ---------------------------------------------------------------------------
// Anneaux, diagnostics, vigilance
// ---------------------------------------------------------------------------

test('une annexe non jointe est dite « non jointe », pas omise', () => {
  // Une location meublée : c'est la catégorie qui porte l'inventaire du mobilier.
  const html = rendreBail(contenu({ categorie: 'meuble', dureeMois: 12, annexes: [] }));
  assert.ok(html.includes('Dossier de diagnostic technique'));
  assert.ok(html.includes('Inventaire et état détaillé du mobilier'));
  assert.ok(html.includes('non jointe à ce jour'));
});

test('une annexe jointe est cochée', () => {
  const html = rendreBail(contenu({ annexes: ['diagnostic_technique'] }));
  assert.ok(html.includes('☑ Dossier de diagnostic technique'));
  // L'apostrophe est échappée en `&#39;` par `echapper` : on cherche la forme
  // réellement imprimée, pas celle qu'on avait en tête.
  assert.ok(html.includes('☐ État des lieux d&#39;entrée — <strong>non jointe à ce jour</strong>'));
});

test('une catégorie sans annexe n’en annonce aucune', () => {
  const html = rendreBail(contenu({ categorie: 'stationnement', dureeMois: 12 }));
  assert.ok(!html.includes('Dossier de diagnostic technique'));
  assert.ok(!html.includes('non jointe à ce jour'));
});

test('un diagnostic périmé est signalé', () => {
  const html = rendreBail(
    contenu({ diagnostics: [{ libelle: 'DPE', date: '2015-03-12', perime: true }] }),
  );
  assert.ok(html.includes('à renouveler'));
  assert.ok(html.includes('b-diagnostic-perime'));
});

test('les points de vigilance de la catégorie sont imprimés', () => {
  const html = rendreBail(contenu({ categorie: 'mobilite', dureeMois: 6, motifMobilite: 'Stage' }));
  assert.ok(html.includes('titre Ier ter'));
  assert.ok(html.includes('solidarité'));
});

test('la mention de résidence principale n’apparaît que si elle est demandée', () => {
  const sans = rendreBail(contenu());
  assert.ok(!sans.includes('résidence principale</strong>'));
  const avec = rendreBail(contenu({ residencePrincipale: true }));
  assert.ok(avec.includes('résidence principale'));
});

// ---------------------------------------------------------------------------
// Signatures — la promesse la plus sensible du document
// ---------------------------------------------------------------------------

test('le bailleur et chaque locataire ont un cadre de signature', () => {
  const html = rendreBail(
    contenu({
      locataires: [
        { nom: 'Benali', prenom: 'Mohamed' },
        { nom: 'Traoré', prenom: 'Aïcha' },
      ],
    }),
  );
  const cadres = html.match(/class="b-cadre"/g) ?? [];
  assert.equal(cadres.length, 3, 'un cadre pour le bailleur, un par locataire');
});

test('un signataire sans signature est dit « Non signé »', () => {
  const html = rendreBail(contenu());
  assert.ok(html.includes('Non signé'));
});

test('une signature apposée est datée et nommée', () => {
  const html = rendreBail(
    contenu({
      signatures: [
        {
          signataire: 'bailleur',
          nom: 'SCI Les Tilleuls',
          date: '2026-09-24',
          trace: 'data:image/svg+xml;base64,AAAA',
        },
      ],
    }),
  );
  assert.ok(html.includes('Signature de SCI Les Tilleuls'));
  assert.ok(html.includes('Signé le 24/09/2026'));
});

test('le document dit qu’une signature tracée à l’écran n’est pas une signature électronique qualifiée', () => {
  const html = rendreBail(contenu());
  assert.ok(html.includes('ne constituent pas'), 'la réserve doit être imprimée en clair');
  assert.ok(html.includes('910/2014'), 'le règlement doit être nommé');
  assert.ok(/tracées au doigt/.test(html));
});

test('aucun balisage de rédaction n’atteint le papier, pour aucune catégorie', () => {
  // Le document est du HTML : les astérisques d'emphase s'y impriment
  // **littéralement**. C'est arrivé — « **ne constituent pas** » figurait tel
  // quel sous les signatures, et sur les points de vigilance de trois
  // catégories. Le contrôle porte sur toutes les catégories, pas sur celle
  // qu'on venait de corriger — et sur le seul texte visible.
  const categories = CATEGORIES_BAIL.map((c) => c.valeur);
  assert.equal(categories.length, 6);
  for (const categorie of categories) {
    const html = rendreBail(
      contenu({
        categorie,
        dureeMois: 36,
        motifMobilite: categorie === 'mobilite' ? 'Stage' : undefined,
        depotGarantie: categorie === 'mobilite' ? 0 : 70000,
      }),
    );
    // Le contrôle porte sur le texte visible : un astérisque dans un
    // commentaire CSS ne s'imprime pas, et l'inclure ferait crier le contrôle
    // sur un défaut qui n'existe pas. On retire donc la feuille de style —
    // et on vérifie qu'on l'a bien retirée, faute de quoi un changement de
    // balise rendrait le contrôle muet sans le dire.
    const visible = html.replace(/<style>[\s\S]*?<\/style>/g, '');
    assert.ok(visible.length < html.length, `feuille de style introuvable pour ${categorie}`);
    const asters = visible.match(/\*\*/g) ?? [];
    assert.equal(asters.length, 0, `balisage imprimé pour ${categorie}`);
  }
});

test('la réserve sur la signature ne promet ni certificat ni horodatage', () => {
  assert.match(MENTION_SIGNATURE, /ne délivre ni certificat, ni horodatage/);
});

test('les signataires sont rendus dans l’ordre : le bailleur, puis les locataires', () => {
  const liste = signataires(
    contenu({
      locataires: [
        { nom: 'Benali', prenom: 'Mohamed' },
        { nom: 'Traoré', prenom: 'Aïcha' },
      ],
    }),
  );
  assert.deepEqual(
    liste.map((s) => s.nom),
    ['SCI Les Tilleuls', 'Mohamed Benali', 'Aïcha Traoré'],
  );
  assert.equal(liste[0].role, 'Le bailleur');
  assert.equal(liste[1].role, 'Locataire');
});

test('un locataire seul est désigné au singulier', () => {
  const liste = signataires(contenu());
  assert.equal(liste[1].role, 'Le locataire');
});

// ---------------------------------------------------------------------------
// Fondements
// ---------------------------------------------------------------------------

test('les sources imprimées portent leur date de consultation', () => {
  const html = rendreBail(contenu());
  assert.ok(html.includes('Loi n° 89-462 du 6 juillet 1989, article 10'));
  assert.ok(html.includes('consulté le 24/09/2026'));
});

test('le changement des contrats types est imprimé dans les fondements', () => {
  const html = rendreBail(contenu());
  assert.ok(html.includes('1er octobre 2026'));
});

test('l’application dit qu’elle ne produit pas les annexes', () => {
  const html = rendreBail(contenu());
  assert.ok(html.includes('ne sont pas produites par cette application'));
});

// ---------------------------------------------------------------------------
// La fin du bail : une date civile, puis son écriture française
// ---------------------------------------------------------------------------

test('la fin du bail est rendue en date civile, puis en français', () => {
  // Deux formes, un seul calcul. La forme civile est celle que la base et les
  // comparaisons manipulent ; la forme française est celle du papier. Les
  // confondre avait produit une fin de bail écrite « 02/03/2027 » là où le
  // reste du projet attend `2027-03-02`.
  assert.equal(finDuBailISO('2026-10-01', 12), '2027-09-30');
  assert.equal(finDuBail('2026-10-01', 12), '30/09/2027');

  // Le jour est ramené au dernier jour du mois d'arrivée, **puis** on retire un
  // jour : le 31 février n'existe pas, l'anniversaire d'un 31 janvier tombe donc
  // le 28 février, et le bail finit la veille. Sans ce ramenage, `Date.UTC` sur
  // un 31 février déborde au 3 mars, et un bail d'un mois finirait deux jours
  // trop tard.
  assert.equal(finDuBailISO('2027-01-31', 1), '2027-02-27');
  assert.equal(finDuBailISO('2027-03-31', 1), '2027-04-29');

  // Une date illisible est rendue telle quelle dans les deux formes : inventer
  // une fin serait pire que de montrer ce qu'on n'a pas su lire.
  assert.equal(finDuBailISO('nawak', 12), 'nawak');
  assert.equal(finDuBail('nawak', 12), 'nawak');
});

test('la fin civile et la fin écrite décrivent le même jour', () => {
  for (const debut of ['2026-01-31', '2026-02-28', '2026-10-01', '2027-08-15']) {
    for (const duree of [1, 9, 12, 36]) {
      const iso = finDuBailISO(debut, duree);
      const [annee, mois, jour] = iso.split('-');
      assert.equal(finDuBail(debut, duree), `${jour}/${mois}/${annee}`, `${debut} + ${duree}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Le tracé d'une signature, transformé en image insérable
// ---------------------------------------------------------------------------

test('un tracé devient une image vectorielle encodée', () => {
  const uri = traceEnDataUri('M10 10 L20 20', 600, 240);
  assert.ok(uri.startsWith('data:image/svg+xml;base64,'), uri.slice(0, 40));

  const svg = Buffer.from(uri.split(',')[1], 'base64').toString('utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 600 240"/);
  assert.match(svg, /width="600"/);
  assert.match(svg, /height="240"/);
  // Le tracé est reproduit **tel quel** : une signature redessinée serait une
  // autre signature.
  assert.ok(svg.includes('d="M10 10 L20 20"'), svg);
});

test('une dimension nulle ne produit pas une image vide', () => {
  // Un pavé qui n'a pas encore été mesuré donnerait 0 : un `viewBox` de
  // largeur nulle rend une image invisible, et la signature disparaîtrait du
  // document sans que rien ne le signale.
  const svg = Buffer.from(traceEnDataUri('M0 0', 0, -5).split(',')[1], 'base64').toString('utf8');
  assert.match(svg, /viewBox="0 0 1 1"/);
});

test('une signature encodée s’insère dans le document et s’y voit', () => {
  const contenu: ContenuBail = {
    categorie: 'vide',
    bailleur: {
      nom: 'Mme Dupont',
      adresse: '12 rue des Lilas',
      codePostal: '69003',
      ville: 'Lyon',
    },
    locataires: [{ nom: 'Benali', prenom: 'Mohamed' }],
    logement: {
      nom: 'Appartement 1',
      adresse: '8 avenue Jean Jaurès',
      codePostal: '69007',
      ville: 'Lyon',
    },
    dateDebut: '2026-10-01',
    dureeMois: 36,
    loyer: 70000,
    charges: 5000,
    depotGarantie: 70000,
    jourEcheance: 5,
    annexes: [],
    signatures: [
      {
        signataire: 'bailleur',
        nom: 'Mme Dupont',
        date: '2026-09-24',
        trace: traceEnDataUri('M10 10 L90 80', 600, 240),
      },
    ],
    etabliLe: '2026-09-24',
  };

  const html = rendreBail(contenu);
  assert.ok(html.includes('data:image/svg+xml;base64,'), 'le tracé doit être inséré');
  // L'encodage base64 ne doit pas avoir été abîmé par l'échappement HTML : une
  // seule entité `&amp;` glissée dedans rendrait l'image illisible dans le PDF.
  assert.ok(!/data:image\/svg\+xml;base64,[^"]*&/.test(html), 'le data URI a été abîmé');
  assert.match(html, /Signé le 24\/09\/2026/);
});
