/**
 * Les écrans de sauvegarde ne promettent que ce qu'ils tiennent.
 *
 * Ce contrôle a changé de sens le 24 septembre 2026, et c'est la mesure qui l'a
 * changé. Il exigeait auparavant que l'export **avoue** que les fichiers PDF
 * n'étaient pas dans la sauvegarde : c'était vrai, et c'était une limite, parce
 * que les photos d'un état des lieux ou d'un inventaire n'existent **que** sous
 * forme de fichiers. La base ne porte que leur chemin. Un bailleur pouvait donc
 * restaurer son dossier et découvrir des constats sans images — sans recours,
 * puisque rien ne les reconstitue.
 *
 * La sauvegarde contient désormais les fichiers, chiffrés avec le reste. Ce que
 * ce contrôle exige est donc l'inverse : que les écrans le disent, et qu'aucun
 * ne reprenne l'ancienne phrase.
 *
 * Mesuré le 23 septembre 2026, et toujours vrai : l'export annonçait
 * « L'intégralité de vos données » avec « Documents émis — Inclus », et la
 * restauration promettait que « les PDF peuvent être régénérés à tout moment ».
 * Un bailleur pouvait croire ses quittances à l'abri, puis ne plus pouvoir les
 * ouvrir.
 *
 * Où ce contrôle s'arrête : il lit la **forme** des textes affichés et la
 * **forme** du contenu sauvegardé. Il ne juge pas une phrase inédite qui dirait
 * demain autre chose de faux ; il nomme les affirmations qui ont réellement
 * trompé, et les endroits du code où la vérification se fait. Le comportement,
 * lui, demande un appareil.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER_APP = join(ICI, '..', 'app', 'sauvegarde');
const DEPOT_IMPORT = join(ICI, '..', 'src', 'backup', 'import.ts');
const DEPOT_EXPORT = join(ICI, '..', 'src', 'backup', 'export.ts');

/** Un fichier lu qui ne dit rien est une anomalie, pas un résultat. */
const MINIMUM_DE_CARACTERES = 500;

function lire(chemin: string): string {
  const source = readFileSync(chemin, 'utf8');
  assert.ok(
    source.length > MINIMUM_DE_CARACTERES,
    `${chemin} : ${source.length} caractère(s) — le contrôle ne mesure rien`,
  );
  return source;
}

test('Sauvegarde : l’export annonce que les fichiers y sont', () => {
  const source = lire(join(DOSSIER_APP, 'export.tsx'));

  assert.match(
    source,
    /Fichiers PDF des quittances/,
    'l’export ne liste plus les fichiers PDF parmi ce qu’il contient ou non',
  );
  assert.match(
    source,
    /Fichiers PDF des quittances" valeur="Inclus/,
    'l’export doit dire « Inclus » en face des fichiers PDF',
  );
  assert.doesNotMatch(
    source,
    /Fichiers PDF des quittances" valeur="Non inclus/,
    'l’export annonce encore que les fichiers PDF ne sont pas dans la sauvegarde',
  );
  assert.match(
    source,
    /Photos des états des lieux et inventaires/,
    'l’export ne dit pas que les photos sont emportées : ce sont elles qu’on ne peut pas reconstituer',
  );
});

test('Sauvegarde : aucun écran ne promet « l’intégralité » des données', () => {
  for (const nom of ['export.tsx', 'import.tsx']) {
    const source = lire(join(DOSSIER_APP, nom));
    assert.doesNotMatch(
      source,
      /intégralité de vos données/,
      `${nom} : annonce l’intégralité des données alors que les PDF manquent`,
    );
  }
});

test('Sauvegarde : aucun écran ne promet que les PDF sont régénérés', () => {
  for (const nom of ['export.tsx', 'import.tsx']) {
    const source = lire(join(DOSSIER_APP, nom));
    assert.doesNotMatch(
      source,
      /PDF peuvent être régénérés/,
      `${nom} : promet une régénération que l’application ne fait pas`,
    );
  }
});

test('Sauvegarde : la restauration regarde les fichiers, pas les chemins', () => {
  const ecran = lire(join(DOSSIER_APP, 'import.tsx'));
  assert.match(
    ecran,
    /documentsSansFichier/,
    'l’écran de restauration ne compte plus les documents sans PDF',
  );

  const depot = lire(DEPOT_IMPORT);
  const debut = depot.indexOf('export async function documentsSansFichier');
  assert.notEqual(debut, -1, 'la fonction documentsSansFichier a disparu du dépôt');

  const corps = depot.slice(debut, depot.indexOf('\n}', debut));
  assert.match(
    corps,
    /documentExiste/,
    'elle ne regarde pas si le fichier existe réellement',
  );
  assert.doesNotMatch(
    corps,
    /!document\.cheminFichier/,
    'elle se fie au chemin : or la restauration récrit justement un chemin',
  );
});

test('Sauvegarde : le contenu emporte les fichiers, et se relit sans eux', () => {
  const source = lire(DEPOT_EXPORT);

  assert.match(
    source,
    /export const VERSION_CONTENU = 2;/,
    'la version du contenu n’a pas été portée à 2 : une sauvegarde neuve serait lue comme ancienne',
  );
  assert.match(
    source,
    /fichiers\?: FichierSauvegarde\[\];/,
    'le contenu sauvegardé ne porte plus de champ `fichiers` facultatif',
  );
  assert.match(
    source,
    /TAILLE_MAXIMALE_FICHIERS/,
    'aucun plafond : le chiffrement pourrait manquer de mémoire sans rien dire',
  );

  // Le chemin enregistré doit être **relatif** : un chemin absolu restauré sur
  // un autre téléphone désignerait un dossier qui n'existe pas, et toutes les
  // photos seraient perdues sans que rien ne le dise.
  const parcours = source.slice(source.indexOf('export async function rassemblerFichiers'));
  assert.match(
    parcours,
    /chemin\.slice\(FileSystem\.documentDirectory!?\.length\)/,
    'le chemin des fichiers n’est pas rendu relatif au dossier de l’application',
  );
  assert.doesNotMatch(
    parcours,
    /chemin:\s*chemin,/,
    'le chemin absolu est enregistré tel quel : la restauration sur un autre téléphone le perdrait',
  );
});

test('Sauvegarde : la restauration réécrit les fichiers, et les compte', () => {
  const source = lire(DEPOT_IMPORT);

  assert.match(
    source,
    /export async function restaurerFichiers/,
    'la restauration ne réécrit plus les fichiers de la sauvegarde',
  );
  const corps = source.slice(source.indexOf('export async function restaurerFichiers'));
  assert.match(
    corps,
    /EncodingType\.Base64/,
    'les fichiers sont écrits dans un autre encodage que celui de la lecture : ils seraient corrompus',
  );
  assert.match(
    corps,
    /makeDirectoryAsync/,
    'les sous-dossiers ne sont pas créés : les photos de `documents/photos/` échoueraient',
  );
  assert.match(
    source,
    /fichiers: number;/,
    'le bilan de restauration n’annonce plus le nombre de fichiers réécrits',
  );
});
