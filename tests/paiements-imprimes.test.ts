/**
 * Les lignes de paiement imprimées sur un document.
 *
 * Un défaut mesuré le 23 septembre 2026 : le rendu construisait **deux listes**
 * — les dates d'un côté, les modes de l'autre — chacune dédoublonnée de son
 * côté, puis les appariait par l'indice. Deux ensembles dédoublonnés
 * indépendamment ne s'apparient pas.
 *
 * Mesuré par `.verif/eprouver-paiements.py`, sur le papier et non dans le HTML,
 * avec un virement et des espèces le 5 août puis un chèque le 12 : le document
 * imprimait « Reçu le 12 août 2026 — Espèces ». Une quittance attestait donc un
 * encaissement en espèces qui n'avait pas eu lieu, et perdait le mode du second
 * paiement du 5.
 *
 * Le défaut ne touchait que les modèles **classique** et **moderne** : le modèle
 * officiel ne reprend ni les dates ni les modes de paiement.
 *
 * Chaque assertion porte son message : un échec doit dire la règle qu'il
 * protège, sans quoi il faut relire le test pour savoir ce qui a cassé.
 *
 * Où ce contrôle s'arrête : il lit des sources et des constantes, il ne rend
 * rien. C'est le banc cité ci-dessus qui imprime et qui lit le papier.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cumulerPaiementsPourCle, paiementsImprimes } from '../src/domain/payments.ts';
import { formaterDateFr, type ClePeriode } from '../src/domain/period.ts';
import type { Paiement } from '../src/domain/types.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const MODELES = join(ICI, '..', 'src', 'pdf', 'models.ts');
const RENDU = join(ICI, '..', 'src', 'pdf', 'render.ts');

/** En dessous, un fichier lu ne prouve rien. */
const MINIMUM_DE_CARACTERES = 500;

const CLE: ClePeriode = '2026-09';

function paiement(champs: Partial<Paiement> & { montant: number }): Paiement {
  return {
    id: `p-${champs.montant}-${champs.datePaiement ?? '2026-09-05'}-${champs.mode ?? 'virement'}`,
    bailId: 'bail-1',
    periode: CLE,
    datePaiement: '2026-09-05',
    mode: 'virement',
    note: null,
    creeLe: '2026-09-05T10:00:00.000Z',
    ...champs,
  };
}

function lignes(simples: (Partial<Paiement> & { montant: number })[]) {
  return paiementsImprimes(cumulerPaiementsPourCle(simples.map(paiement), CLE));
}

function lire(chemin: string): string {
  const source = readFileSync(chemin, 'utf8');
  assert.ok(
    source.length > MINIMUM_DE_CARACTERES,
    `${chemin} : ${source.length} caractère(s) — le contrôle ne mesure rien`,
  );
  return source;
}

describe('Lignes de paiement imprimées', () => {
  it('n’imprime rien quand aucun paiement n’est enregistré', () => {
    assert.deepEqual(
      lignes([]),
      [],
      'sans encaissement enregistré, il n’y a aucune ligne à imprimer',
    );
  });

  it('imprime une ligne par date, avec le mode de ce jour', () => {
    assert.deepEqual(
      lignes([
        { montant: 50000, datePaiement: '2026-09-05', mode: 'virement' },
        { montant: 35000, datePaiement: '2026-09-20', mode: 'cheque' },
      ]),
      [
        { date: '5 septembre 2026', modes: ['Virement'] },
        { date: '20 septembre 2026', modes: ['Chèque'] },
      ],
      'la date doit être écrite comme le document l’imprime, et porter son mode',
    );
  });

  it('nomme le mode de chaque encaissement, sans le décaler', () => {
    // Le défaut mesuré, exactement : le chèque du 12 s'imprimait « Espèces »,
    // qui était le mode du second paiement du 5.
    assert.deepEqual(
      lignes([
        { montant: 30000, datePaiement: '2026-09-05', mode: 'virement' },
        { montant: 20000, datePaiement: '2026-09-05', mode: 'especes' },
        { montant: 80000, datePaiement: '2026-09-12', mode: 'cheque' },
      ]),
      [
        { date: '5 septembre 2026', modes: ['Virement', 'Espèces'] },
        { date: '12 septembre 2026', modes: ['Chèque'] },
      ],
      'chaque date doit porter les modes de ses propres encaissements, et non '
        + 'ceux d’une autre date : c’est ce décalage qui faisait attester un '
        + 'paiement en espèces qui n’avait pas eu lieu',
    );
  });

  it('ne répète pas un mode enregistré deux fois le même jour', () => {
    assert.deepEqual(
      lignes([
        { montant: 30000, datePaiement: '2026-09-05', mode: 'especes' },
        { montant: 20000, datePaiement: '2026-09-05', mode: 'especes' },
      ]),
      [{ date: '5 septembre 2026', modes: ['Espèces'] }],
      'deux encaissements du même mode le même jour s’impriment une seule fois, '
        + 'sans répéter le mode',
    );
  });

  it('range les dates dans l’ordre chronologique', () => {
    const rendues = lignes([
      { montant: 10000, datePaiement: '2026-09-20', mode: 'cheque' },
      { montant: 10000, datePaiement: '2026-09-05', mode: 'virement' },
    ]);
    assert.deepEqual(
      rendues.map((l) => l.date),
      ['5 septembre 2026', '20 septembre 2026'],
      'les dates doivent sortir du plus ancien au plus récent, quel que soit '
        + 'l’ordre de saisie',
    );
  });

  it('nomme « Autre » un mode inconnu, sans perdre la ligne', () => {
    // Une sauvegarde restaurée peut porter un mode qu'une version antérieure
    // acceptait : la ligne doit rester, avec un libellé honnête.
    assert.deepEqual(
      lignes([{ montant: 10000, mode: 'espece' as never }]),
      [{ date: '5 septembre 2026', modes: ['Autre'] }],
      'un mode inconnu doit être nommé « Autre », et non faire disparaître '
        + 'l’encaissement de la quittance',
    );
  });

  it('décrit les mêmes jours que le cumul enregistré', () => {
    // Deux endroits calculent « les jours de paiement du mois » : `cumul.dates`,
    // écrit tel quel dans la fiche du document, et `paiementsImprimes`, imprimé
    // sur le papier. Ils ne peuvent pas se lire — l'un porte des dates civiles,
    // l'autre des dates écrites — donc l'accord est tenu ici.
    //
    // S'ils divergeaient, l'aperçu de l'application et le PDF ne diraient pas la
    // même chose, et rien ne le signalerait : les deux resteraient valides.
    const simples = [
      { montant: 30000, datePaiement: '2026-09-05', mode: 'virement' as const },
      { montant: 20000, datePaiement: '2026-09-05', mode: 'especes' as const },
      { montant: 80000, datePaiement: '2026-09-12', mode: 'cheque' as const },
      { montant: 10000, datePaiement: '2026-09-20', mode: 'especes' as const },
    ];
    const cumul = cumulerPaiementsPourCle(simples.map(paiement), CLE);

    assert.deepEqual(
      paiementsImprimes(cumul).map((l) => l.date),
      cumul.dates.map(formaterDateFr),
      'les jours imprimés et les jours enregistrés doivent être les mêmes, dans '
        + 'le même ordre : ce sont deux écritures d’une seule vérité',
    );
  });
});

describe('Lignes de paiement : le rendu ne refait pas l’appariement à la main', () => {
  it('le contenu porte les paiements, et non deux listes parallèles', () => {
    const source = lire(MODELES);

    assert.match(
      source,
      /contenu\.paiements/,
      'le modèle ne lit plus les paiements du contenu : l’appariement a peut-être '
        + 'été refait ailleurs, ou remplacé par deux listes',
    );
    assert.ok(
      !/modesPaiement\s*\[/.test(source),
      'le modèle indexe une liste de modes en parallèle des dates : c’est '
        + 'précisément la forme qui décalait les modes',
    );
  });

  it('le rendu confie l’appariement au domaine', () => {
    const source = lire(RENDU);

    assert.match(
      source,
      /paiementsImprimes\(/,
      'le rendu ne passe plus par `paiementsImprimes` : la règle vit alors en '
        + 'deux endroits, et rien ne garantit qu’ils s’accordent',
    );
    assert.ok(
      !/new Set\(\s*cumul\.paiements\.map/.test(source),
      'le rendu dédoublonne encore les modes de son côté : deux listes '
        + 'dédoublonnées séparément ne s’apparient pas',
    );
  });
});
