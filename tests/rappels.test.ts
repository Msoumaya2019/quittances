/**
 * Règle des rappels de loyers.
 *
 * Ces tests construisent leurs dates avec des composantes **locales**
 * (`new Date(2026, 8, 10, 8, 0)`), jamais avec une chaîne ISO : le fuseau de la
 * machine de compilation ne doit pas changer le résultat.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  HEURE_RAPPEL,
  JOUR_RAPPEL_MAX,
  JOUR_RAPPEL_MIN,
  normaliserJourRappel,
  prochainRappel,
  texteRappel,
} from '../src/domain/rappels.ts';

describe('normaliserJourRappel : ramener un jour dans les bornes', () => {
  it('laisse passer un jour valable', () => {
    assert.equal(normaliserJourRappel(10), 10);
  });

  it('remonte un jour trop petit à la borne basse', () => {
    assert.equal(normaliserJourRappel(0), JOUR_RAPPEL_MIN);
    assert.equal(normaliserJourRappel(-5), JOUR_RAPPEL_MIN);
  });

  it('ramène un jour trop grand à la borne haute', () => {
    assert.equal(normaliserJourRappel(31), JOUR_RAPPEL_MAX);
    assert.equal(normaliserJourRappel(99), JOUR_RAPPEL_MAX);
  });

  it("refuse l'infini et le non-nombre plutôt que de propager NaN", () => {
    assert.equal(normaliserJourRappel(Number.NaN), JOUR_RAPPEL_MIN);
    assert.equal(normaliserJourRappel(Number.POSITIVE_INFINITY), JOUR_RAPPEL_MIN);
  });

  it('tronque une partie décimale', () => {
    assert.equal(normaliserJourRappel(10.9), 10);
  });

  it('garde la borne haute à 28, seul jour présent dans tous les mois', () => {
    assert.equal(JOUR_RAPPEL_MAX, 28);
    // Le 28 existe en février, même une année non bissextile.
    const fevrier = new Date(2027, 1, 28);
    assert.equal(fevrier.getMonth(), 1);
    assert.equal(fevrier.getDate(), 28);
  });
});

describe('prochainRappel : quand le rappel doit tomber', () => {
  it('vise ce mois-ci quand le jour est encore à venir', () => {
    const maintenant = new Date(2026, 8, 3, 14, 0); // 3 septembre 2026, 14 h
    const p = prochainRappel(10, maintenant);

    assert.equal(p.quand.getFullYear(), 2026);
    assert.equal(p.quand.getMonth(), 8);
    assert.equal(p.quand.getDate(), 10);
    assert.equal(p.mois, '2026-09');
  });

  it('reporte au mois suivant quand le jour est passé', () => {
    const maintenant = new Date(2026, 8, 15, 14, 0); // 15 septembre 2026
    const p = prochainRappel(10, maintenant);

    assert.equal(p.quand.getFullYear(), 2026);
    assert.equal(p.quand.getMonth(), 9, 'octobre attendu');
    assert.equal(p.quand.getDate(), 10);
    assert.equal(p.mois, '2026-10');
  });

  it("reporte au mois suivant si l'heure du rappel est passée le jour même", () => {
    const maintenant = new Date(2026, 8, 10, 14, 0); // le 10, à 14 h
    const p = prochainRappel(10, maintenant);

    assert.equal(p.quand.getMonth(), 9, 'le rappel de 9 h est passé, donc octobre');
  });

  it("garde le jour même si l'instant courant est exactement celui du rappel", () => {
    const maintenant = new Date(2026, 8, 10, HEURE_RAPPEL, 0, 0, 0);
    const p = prochainRappel(10, maintenant);

    assert.equal(p.quand.getMonth(), 8, 'ne pas sauter un rappel pour une seconde');
    assert.equal(p.quand.getDate(), 10);
  });

  it('franchit le passage à l’année sans cas particulier', () => {
    const maintenant = new Date(2026, 11, 20, 14, 0); // 20 décembre 2026
    const p = prochainRappel(10, maintenant);

    assert.equal(p.quand.getFullYear(), 2027);
    assert.equal(p.quand.getMonth(), 0, 'janvier attendu');
    assert.equal(p.quand.getDate(), 10);
    assert.equal(p.mois, '2027-01');
  });

  it('place toujours le rappel à la même heure, minute et seconde zéro', () => {
    for (const jour of [1, 10, 28]) {
      for (const maintenant of [
        new Date(2026, 0, 1, 0, 0),
        new Date(2026, 5, 15, 23, 59),
        new Date(2026, 11, 31, 12, 0),
      ]) {
        const p = prochainRappel(jour, maintenant);
        assert.equal(p.quand.getHours(), HEURE_RAPPEL);
        assert.equal(p.quand.getMinutes(), 0);
        assert.equal(p.quand.getSeconds(), 0);
        assert.equal(p.quand.getMilliseconds(), 0);
      }
    }
  });

  it('ne renvoie jamais une date déjà passée', () => {
    const maintenant = new Date(2026, 8, 3, 14, 0);
    for (const jour of [1, 5, 10, 20, 28]) {
      const p = prochainRappel(jour, maintenant);
      assert.ok(
        p.quand.getTime() >= maintenant.getTime(),
        `jour ${jour} : ${p.quand.toISOString()} devrait être après ${maintenant.toISOString()}`,
      );
    }
  });

  it("accepte un jour hors bornes sans produire de date invalide", () => {
    const maintenant = new Date(2026, 8, 3, 14, 0);
    for (const jour of [0, -3, 31, 99, Number.NaN]) {
      const p = prochainRappel(jour, maintenant);
      assert.ok(
        !Number.isNaN(p.quand.getTime()),
        `jour ${jour} : date invalide produite`,
      );
    }
  });

  it("accorde la clé de mois avec la date annoncée", () => {
    const maintenant = new Date(2026, 8, 3, 14, 0);
    for (const jour of [1, 10, 28]) {
      const p = prochainRappel(jour, maintenant);
      const attendu = `${p.quand.getFullYear()}-${String(p.quand.getMonth() + 1).padStart(2, '0')}`;
      assert.equal(p.mois, attendu);
    }
  });
});

describe('texteRappel : la promesse tenue par le message', () => {
  it('ne nomme aucun mois', () => {
    const { titre, corps } = texteRappel();
    const mois = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
    ];
    for (const m of mois) {
      assert.ok(!titre.includes(m), `le titre nomme « ${m} »`);
      assert.ok(!corps.includes(m), `le corps nomme « ${m} »`);
    }
    // Ni une année, qui serait fausse dès le mois de janvier suivant.
    assert.ok(!/\b20\d{2}\b/.test(corps), 'le corps nomme une année');
  });

  it('tient en une longueur affichable sur un écran verrouillé', () => {
    const { titre, corps } = texteRappel();
    assert.ok(titre.length > 0 && titre.length <= 40, `titre trop long : ${titre.length}`);
    assert.ok(corps.length > 0 && corps.length <= 120, `corps trop long : ${corps.length}`);
  });

  it('renvoie toujours un texte, quel que soit le jour demandé', () => {
    const maintenant = new Date(2026, 8, 3, 14, 0);
    for (const jour of [1, 28]) {
      const p = prochainRappel(jour, maintenant);
      assert.equal(p.titre, texteRappel().titre);
      assert.equal(p.corps, texteRappel().corps);
    }
  });
});
