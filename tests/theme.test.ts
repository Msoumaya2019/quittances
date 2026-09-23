/**
 * Tests des palettes de thème.
 *
 * Deux affirmations sont écrites en commentaire dans `palette.ts` : « le vert
 * reste vert » et « le libellé d'un bouton reste lisible ». Un commentaire ne
 * prouve rien. Ces tests les mesurent.
 *
 * La lisibilité est mesurée par le rapport de contraste de la WCAG 2.1, au
 * seuil de 4,5:1 — celui exigé pour un texte courant, et donc pour le libellé
 * d'un bouton. Ce seuil a une conséquence : le vert émeraude d'origine
 * (`#059669`) n'y satisfaisait pas, il plafonnait à 3,8:1 avec du blanc. Il a
 * donc été approfondi d'un cran dans `palette.ts`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COULEURS_THEME,
  composerPalette,
  PALETTE_PAR_DEFAUT,
  type CouleurTheme,
  type ModeTheme,
} from '../src/ui/palette.ts';

const COULEURS: CouleurTheme[] = COULEURS_THEME.map((c) => c.valeur);
const MODES: ModeTheme[] = ['clair', 'sombre'];

/** Les huit combinaisons, avec leur nom, pour des messages lisibles. */
const COMBINAISONS = COULEURS.flatMap((couleur) =>
  MODES.map((mode) => ({ couleur, mode, nom: `${couleur}/${mode}` })),
);

/** Décompose `#RRGGBB` en trois canaux 0-255. */
function canaux(hex: string): [number, number, number] {
  const valeur = hex.replace('#', '');
  return [
    parseInt(valeur.slice(0, 2), 16),
    parseInt(valeur.slice(2, 4), 16),
    parseInt(valeur.slice(4, 6), 16),
  ];
}

/** Luminance relative, selon la WCAG 2.1. */
function luminance(hex: string): number {
  const [r, g, b] = canaux(hex).map((canal) => {
    const normalise = canal / 255;
    return normalise <= 0.03928
      ? normalise / 12.92
      : Math.pow((normalise + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste entre deux couleurs, de 1 à 21. */
function contraste(a: string, b: string): number {
  const [clair, fonce] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (clair + 0.05) / (fonce + 0.05);
}

test('Palette : les quatre couleurs produisent des accents distincts', () => {
  const vus = new Map<string, string>();
  for (const { couleur, mode, nom } of COMBINAISONS) {
    const { accent } = composerPalette(couleur, mode);
    const deja = vus.get(accent);
    assert.equal(deja, undefined, `${nom} partage son accent (${accent}) avec ${deja}`);
    vus.set(accent, nom);
  }
  assert.equal(vus.size, 8);
});

test('Palette : le vert « payé » reste vert dans les huit combinaisons', () => {
  for (const { couleur, mode, nom } of COMBINAISONS) {
    const { succes } = composerPalette(couleur, mode);
    const [r, g, b] = canaux(succes);
    assert.ok(g > r, `${nom} : le canal vert (${g}) doit dominer le rouge (${r})`);
    assert.ok(g > b, `${nom} : le canal vert (${g}) doit dominer le bleu (${b})`);
  }
});

test('Palette : le vert « payé » ne dépend pas de l’accent choisi', () => {
  for (const mode of MODES) {
    const reference = composerPalette('vert', mode).succes;
    for (const couleur of COULEURS) {
      assert.equal(
        composerPalette(couleur, mode).succes,
        reference,
        `en mode ${mode}, le vert payé change avec l'accent ${couleur}`,
      );
    }
  }
});

test('Palette : le texte posé sur l’accent reste lisible', () => {
  const mesures: string[] = [];
  for (const { couleur, mode, nom } of COMBINAISONS) {
    const { accent, surAccent } = composerPalette(couleur, mode);
    const rapport = contraste(accent, surAccent);
    mesures.push(`${nom} ${rapport.toFixed(2)}:1`);
    assert.ok(
      rapport >= 4.5,
      `${nom} : contraste ${rapport.toFixed(2)}:1 entre ${accent} et ${surAccent}, sous 4,5:1`,
    );
  }
  // Le détail reste utile : il rend visible la marge de chaque couleur.
  console.log('    contrastes accent/texte :', mesures.join(' · '));
});

test('Palette : les textes lisibles sur le fond le sont aussi', () => {
  for (const { couleur, mode, nom } of COMBINAISONS) {
    const palette = composerPalette(couleur, mode);
    for (const [role, texte] of [
      ['texte', palette.texte],
      ['texteSecondaire', palette.texteSecondaire],
    ] as const) {
      const rapport = contraste(palette.fond, texte);
      assert.ok(
        rapport >= 4.5,
        `${nom} : ${role} sur fond donne ${rapport.toFixed(2)}:1, sous 4,5:1`,
      );
    }
  }
});

test('Palette : les libellés de statut restent lisibles sur leur pastille', () => {
  // Ces quatre-là portent un sens — payé, partiel, retard, information — et sont
  // donc fixes. Ils doivent rester lisibles dans les huit combinaisons.
  for (const { couleur, mode, nom } of COMBINAISONS) {
    const palette = composerPalette(couleur, mode);
    for (const [role, fond, texte] of [
      ['succès', palette.succesTresClair, palette.succesFonce],
      ['partiel', palette.orangeTresClair, palette.orange],
      ['retard', palette.rougeTresClair, palette.rouge],
      ['information', palette.bleuTresClair, palette.bleu],
    ] as const) {
      const rapport = contraste(fond, texte);
      assert.ok(
        rapport >= 4.5,
        `${nom} : statut ${role} donne ${rapport.toFixed(2)}:1, sous 4,5:1`,
      );
    }
  }
});

test('Palette : composer est pur — deux appels rendent le même objet', () => {
  for (const { couleur, mode } of COMBINAISONS) {
    assert.deepEqual(composerPalette(couleur, mode), composerPalette(couleur, mode));
  }
});

test('Palette : toutes les clés sont renseignées, aucune valeur vide', () => {
  const attendues = Object.keys(PALETTE_PAR_DEFAUT);
  for (const { couleur, mode, nom } of COMBINAISONS) {
    const palette = composerPalette(couleur, mode) as Record<string, unknown>;
    assert.deepEqual(Object.keys(palette).sort(), [...attendues].sort(), `${nom} : clés différentes`);
    for (const [cle, valeur] of Object.entries(palette)) {
      assert.equal(typeof valeur, 'string', `${nom} : ${cle} n'est pas une chaîne`);
      assert.ok((valeur as string).length > 0, `${nom} : ${cle} est vide`);
    }
  }
});

test('Palette : le mode nuit est réellement sombre, le mode clair réellement clair', () => {
  for (const couleur of COULEURS) {
    const clair = composerPalette(couleur, 'clair');
    const sombre = composerPalette(couleur, 'sombre');
    assert.ok(
      luminance(sombre.fond) < luminance(clair.fond),
      `${couleur} : le fond nuit n'est pas plus sombre que le fond clair`,
    );
    // Un fond sombre appelle un texte clair, et réciproquement.
    assert.ok(
      luminance(sombre.texte) > luminance(sombre.fond),
      `${couleur} : le texte nuit n'est pas plus clair que son fond`,
    );
    assert.ok(
      luminance(clair.texte) < luminance(clair.fond),
      `${couleur} : le texte clair n'est pas plus sombre que son fond`,
    );
  }
});
