/**
 * Les documents qui décrivent les fichiers livrables ne vieillissent pas seuls.
 *
 * Ce dépôt livre trois flux de travail GitHub, et trois documents en parlent.
 * Rien ne les reliait. Le 23 septembre 2026, trois affirmations exactes le jour
 * où elles ont été écrites étaient devenues fausses le jour où un flux a été
 * ajouté : le README annonçait qu'« aucun fichier iOS obtenable ici ne
 * s'installe sur un iPhone », ARCHITECTURE.md décrivait deux flux au lieu de
 * trois, et le guide de compilation parlait de « l'un des deux chemins » alors
 * qu'un troisième ne demande aucun compte Apple. Aucun contrôle ne lisait ces
 * documents, donc personne ne l'a vu.
 *
 * Ce contrôle les relie aux flux qu'ils décrivent :
 *
 *   1. chaque flux est nommé dans ARCHITECTURE.md, le document de référence ;
 *   2. chaque flux est nommé dans `.github/COMPILATION.md`, le guide du bailleur ;
 *   3. une compilation « pour l'appareil » annoncée dans la documentation est
 *      adossée à un flux qui compile réellement avec `-sdk iphoneos`.
 *
 * Où ce contrôle s'arrête : il vérifie qu'un flux est **cité**, pas que ce qui
 * en est dit soit vrai. Un document qui nommerait le bon fichier en le décrivant
 * de travers lui échapperait. Ce qui se mesure sur un binaire — sa plateforme,
 * sa signature — se mesure sur le binaire, et c'est le rôle de
 * `.verif/verifier-ipa-appareil.py`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DEPOT = join(ICI, '..');
const DOSSIER_DES_FLUX = join(DEPOT, '.github', 'workflows');

/**
 * Un dossier lu qui ne contient rien est une anomalie, pas un résultat : sans ce
 * plancher, un chemin devenu faux rendrait le contrôle vert en ne lisant rien.
 */
const MINIMUM_DE_FLUX = 3;

/** En dessous, un fichier lu ne prouve rien. */
const MINIMUM_DE_CARACTERES = 500;

/** Les documents qui décrivent ce que le dépôt produit. */
const DOCUMENTS_QUI_DECRIVENT = ['README.md', 'ARCHITECTURE.md', join('.github', 'COMPILATION.md')];

function lire(chemin: string): string {
  const source = readFileSync(chemin, 'utf8');
  assert.ok(
    source.length > MINIMUM_DE_CARACTERES,
    `${chemin} : ${source.length} caractère(s) — le contrôle ne mesure rien`,
  );
  return source;
}

function flux(): string[] {
  const noms = readdirSync(DOSSIER_DES_FLUX)
    .filter((nom) => nom.endsWith('.yml') || nom.endsWith('.yaml'))
    .sort();
  assert.ok(
    noms.length >= MINIMUM_DE_FLUX,
    `${noms.length} flux trouvé(s) dans ${DOSSIER_DES_FLUX}, `
      + `or ${MINIMUM_DE_FLUX} au moins sont attendus`,
  );
  return noms;
}

test('Documentation : chaque flux de travail est nommé dans ARCHITECTURE.md', () => {
  const architecture = lire(join(DEPOT, 'ARCHITECTURE.md'));

  for (const nom of flux()) {
    assert.ok(
      architecture.includes(nom),
      `ARCHITECTURE.md ne nomme pas ${nom} : un flux ajouté sans être décrit `
        + 'passe inaperçu, et c’est ainsi qu’un document devient faux',
    );
  }
});

test('Documentation : chaque flux de travail est nommé dans le guide de compilation', () => {
  const guide = lire(join(DEPOT, '.github', 'COMPILATION.md'));

  for (const nom of flux()) {
    assert.ok(
      guide.includes(nom),
      `le guide ne nomme pas ${nom} : le bailleur ne peut pas retrouver le flux `
        + 'à lancer, ni savoir qu’il existe',
    );
  }
});

test('Documentation : la compilation pour l’appareil est adossée à un flux', () => {
  const documents = DOCUMENTS_QUI_DECRIVENT.map((nom) => lire(join(DEPOT, nom)));
  const annonceLAppareil = documents.some((document) => document.includes('iphoneos'));

  assert.ok(
    annonceLAppareil,
    'aucun document ne dit pour quel appareil les fichiers sont compilés '
      + '(aucune mention de `iphoneos`) : le bailleur ne peut pas savoir ce qu’il '
      + 'télécharge, ni s’il peut l’installer',
  );

  const compilentPourLAppareil = flux().filter((nom) =>
    lire(join(DOSSIER_DES_FLUX, nom)).includes('-sdk iphoneos'),
  );

  assert.ok(
    compilentPourLAppareil.length > 0,
    'la documentation annonce une compilation pour l’appareil (`iphoneos`), or '
      + 'aucun flux ne compile avec `-sdk iphoneos` : la promesse n’a pas de source',
  );
});
