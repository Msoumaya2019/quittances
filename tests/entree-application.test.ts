/**
 * Garde-fou sur le point d'entrée de l'application.
 *
 * Ces trois vérifications existent parce que le défaut qu'elles empêchent a
 * réellement eu lieu, et qu'il était **silencieux** : `package.json` montait
 * `index.ts`, qui montait `App.tsx` — le modèle vide d'Expo. Le dossier `app/`
 * n'était donc jamais chargé, et la compilation produisait un APK affichant
 * « Open up App.tsx to start working on your app! ».
 *
 * Rien ne le signalait : les types passaient, les tests du domaine passaient,
 * et l'empaquetage réussissait — il empaquetait simplement 580 modules au lieu
 * de 1946, sans le code de l'application.
 *
 * Le fichier `App.tsx` est donc absent **volontairement** : sa seule présence
 * suffit à rendre un mauvais point d'entrée silencieux, puisque l'import
 * `./App` se résout alors sans erreur.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const racine = new URL('..', import.meta.url);
const chemin = (nom: string) => new URL(nom, racine);

const paquet = JSON.parse(readFileSync(chemin('package.json'), 'utf8')) as {
  main?: string;
  dependencies?: Record<string, string>;
};

describe("Point d'entrée : l'application passe bien par le routeur", () => {
  it('déclare expo-router/entry comme point d’entrée', () => {
    assert.equal(
      paquet.main,
      'expo-router/entry',
      "sans cela, le dossier app/ n'est jamais chargé et l'application reste vide",
    );
  });

  it('ne laisse aucun App.tsx à la racine, qui masquerait un mauvais point d’entrée', () => {
    assert.equal(
      existsSync(chemin('App.tsx')),
      false,
      'App.tsx est le modèle vide d’Expo : sa présence rend un point d’entrée fautif silencieux',
    );
  });

  it('ne laisse aucun index.ts à la racine pour la même raison', () => {
    assert.equal(
      existsSync(chemin('index.ts')),
      false,
      'index.ts montait App.tsx au lieu du routeur',
    );
  });

  it('possède bien la racine de navigation attendue par le routeur', () => {
    assert.ok(
      existsSync(chemin('app/_layout.tsx')),
      'sans app/_layout.tsx, expo-router ne trouve aucune racine',
    );
  });

  it('dépend d’expo-router, puisque le point d’entrée vient de lui', () => {
    assert.ok(
      paquet.dependencies?.['expo-router'],
      'le point d’entrée est fourni par expo-router, qui doit donc être une dépendance',
    );
  });
});
