/**
 * Aucun écran ne promet un geste que l'application ne sait pas faire.
 *
 * Un message d'erreur invitait à « régénérer la quittance depuis la carte du
 * logement ». L'application ne régénère rien : une quittance émise reste celle
 * qui a été émise, et le seul bouton de la carte propose de la *voir*. Le
 * message envoyait donc l'utilisateur vers un geste inexistant — et il existait
 * en trois exemplaires, dans deux fichiers.
 *
 * Le contrôle interdit le mot dans les écrans, et se donne un plancher de
 * fichiers lus : sans lui, un dossier déplacé rendrait le test vert en ne
 * lisant rien.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER_APP = join(ICI, '..', 'app');

/** Le mot interdit dans les écrans, et ce qu'il promettait à tort. */
const PROMESSE_INTERDITE = 'régénérer';

/** Plancher : sans lui, un dossier vide rendrait le contrôle vert. */
const MINIMUM_DE_FICHIERS = 15;

function fichiersDe(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      trouves.push(...fichiersDe(chemin));
    } else if (/\.tsx?$/.test(entree)) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

test('Écrans : aucun ne promet de régénérer un document', () => {
  const fichiers = fichiersDe(DOSSIER_APP);

  assert.ok(
    fichiers.length >= MINIMUM_DE_FICHIERS,
    `seulement ${fichiers.length} fichier(s) lu(s) dans app/ — le contrôle ne mesure rien`,
  );

  const fautifs = fichiers.filter((chemin) =>
    readFileSync(chemin, 'utf8').includes(PROMESSE_INTERDITE),
  );

  assert.deepEqual(
    fautifs.map((chemin) => chemin.slice(DOSSIER_APP.length + 1)),
    [],
    "un écran promet de régénérer un document, or l'application ne sait pas le faire",
  );
});
