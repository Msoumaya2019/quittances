/**
 * La feuille tient sur une seule page, et son format est demandé au moteur.
 *
 * Un défaut mesuré le 23 septembre 2026 : les quittances sortaient sur **deux
 * pages**, le talon à découper seul sur la seconde. Le HTML était pourtant
 * correct — rendu par le moteur d'impression de Chromium, il tenait sur une page
 * A4, 210 × 297 mm. Le défaut était ailleurs : `expo-print` prend le format
 * **US Letter** par défaut (612 × 792 pt, soit 215,9 × 279,4 mm), et une feuille
 * de 297 mm n'entre pas dans une page de 279,4 mm. Mesuré : la même feuille,
 * rendue sur une page Letter, donne bien **deux** pages.
 *
 * Ce contrôle tient donc les deux bouts :
 *
 *   1. le format demandé au moteur contient la feuille, avec de la marge ;
 *   2. l'appel d'impression demande explicitement ce format — c'est **l'option
 *      oubliée** qui était le défaut, pas la géométrie ;
 *   3. la feuille elle-même tient dans 297 mm, par le haut : le volet prend le
 *      reste, le talon garde sa hauteur ;
 *   4. le cadre du tableau épouse son contenu au lieu de s'étirer pour remplir
 *      le volet, ce qui laissait une centaine de millimètres de dégradé vide.
 *
 * Où ce contrôle s'arrête : il lit des sources et des constantes, il ne rend
 * rien, et il ne compte aucune page. C'est `.verif/mesurer-pages.py` qui
 * **compte les pages** sur la pièce réellement produite : il régénère le rendu
 * par `.verif/rendre-officiel.ts`, imprime chaque document dans les deux
 * formats par le moteur de Chromium, et exige une page dans le format demandé
 * comme deux pages dans le format Letter — le témoin négatif, sans lequel un
 * banc qui annonce « une page » pourrait simplement n'avoir rien imprimé.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAGE_IMPRESSION, millimetresEnPoints } from '../src/pdf/page.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const STYLES = join(ICI, '..', 'src', 'pdf', 'styles-officiel.ts');
const RENDU = join(ICI, '..', 'src', 'pdf', 'render.ts');

/** La hauteur d'une page A4, en millimètres. */
const HAUTEUR_A4 = 297;

/** En dessous, un fichier lu ne prouve rien. */
const MINIMUM_DE_CARACTERES = 500;

function lire(chemin: string): string {
  const source = readFileSync(chemin, 'utf8');
  assert.ok(
    source.length > MINIMUM_DE_CARACTERES,
    `${chemin} : ${source.length} caractère(s) — le contrôle ne mesure rien`,
  );
  return source;
}

/** Le texte d'une règle CSS, du sélecteur à son accolade fermante. */
function regle(source: string, selecteur: string): string {
  const debut = source.indexOf(`${selecteur} {`);
  assert.ok(
    debut !== -1,
    `la règle ${selecteur} est introuvable : le contrôle ne mesure rien`,
  );
  const fin = source.indexOf('}', debut);
  assert.ok(fin > debut, `la règle ${selecteur} n'est pas fermée`);
  return source.slice(debut, fin);
}

/** La première longueur en millimètres qui suit une propriété. */
function millimetres(regleCss: string, propriete: string): number {
  const trouve = regleCss.match(new RegExp(`${propriete}\\s*:[^;]*?([0-9.]+)mm`));
  assert.ok(
    trouve,
    `${propriete} en millimètres est introuvable dans : ${regleCss.trim()}`,
  );
  return Number(trouve[1]);
}

test('Tenue en page : le format demandé au moteur contient la feuille', () => {
  const feuille = regle(lire(STYLES), '.feuille');

  const largeur = millimetres(feuille, 'width');
  const hauteur = millimetres(feuille, 'height');

  assert.ok(
    millimetresEnPoints(largeur) <= PAGE_IMPRESSION.largeurPt,
    `la page fait ${PAGE_IMPRESSION.largeurPt} pt et la feuille ${largeur} mm `
      + `(${millimetresEnPoints(largeur).toFixed(1)} pt) : la feuille déborde en largeur`,
  );
  assert.ok(
    millimetresEnPoints(hauteur) <= PAGE_IMPRESSION.hauteurPt,
    `la page fait ${PAGE_IMPRESSION.hauteurPt} pt et la feuille ${hauteur} mm `
      + `(${millimetresEnPoints(hauteur).toFixed(1)} pt) : la feuille déborde en hauteur`,
  );
});

test('Tenue en page : l’impression demande explicitement le format', () => {
  const source = lire(RENDU);
  const debut = source.indexOf('printToFileAsync(');
  assert.ok(
    debut !== -1,
    "aucun appel a printToFileAsync : le controle ne mesure rien",
  );
  const appel = source.slice(debut, source.indexOf('});', debut) + 3);

  assert.match(
    appel,
    /width:\s*PAGE_IMPRESSION\.largeurPt/,
    'l’appel d’impression ne demande pas la largeur de page : expo-print prend '
      + 'alors US Letter, et la feuille se scinde en deux',
  );
  assert.match(
    appel,
    /height:\s*PAGE_IMPRESSION\.hauteurPt/,
    'l’appel d’impression ne demande pas la hauteur de page',
  );
});

test('Tenue en page : la feuille tient dans 297 mm', () => {
  const source = lire(STYLES);

  const volet = millimetres(regle(source, '.volet'), 'min-height');
  const talon = millimetres(regle(source, '.talon'), 'flex');

  assert.ok(
    volet + talon <= HAUTEUR_A4,
    `volet ${volet} mm + talon ${talon} mm = ${volet + talon} mm, `
      + `au-delà des ${HAUTEUR_A4} mm d'une page A4`,
  );
});

test('Tenue en page : le cadre du tableau épouse son contenu', () => {
  const cadre = regle(lire(STYLES), '.cadre-tableau');

  assert.doesNotMatch(
    cadre,
    /max-height/,
    'un plafond sur le cadre rognerait une ligne de tableau en silence : '
      + 'une quittance ne doit jamais perdre une ligne',
  );
  assert.doesNotMatch(
    cadre,
    /flex:\s*[1-9]/,
    'le cadre s’étire pour remplir le volet : c’est ce qui laissait une '
      + 'centaine de millimètres de dégradé vide pour deux lignes de tableau',
  );
});
