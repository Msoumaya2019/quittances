/**
 * Les écrans de sauvegarde ne promettent que ce qu'ils tiennent.
 *
 * Une sauvegarde contient la **trace** des documents, pas les fichiers PDF. Et
 * l'application ne régénère jamais un document émis. Les deux écrans qui
 * parlent de sauvegarde doivent donc le dire — et surtout pas le contraire.
 *
 * Mesuré le 23 septembre 2026 : l'export annonçait « L'intégralité de vos
 * données » avec « Documents émis — Inclus », et la restauration promettait que
 * « les PDF peuvent être régénérés à tout moment ». Un bailleur pouvait croire
 * ses quittances à l'abri, puis ne plus pouvoir les ouvrir — sans recours,
 * puisque rien ne les reconstitue.
 *
 * Où ce contrôle s'arrête : il lit la **forme** des textes affichés. Il ne juge
 * pas une phrase inédite qui dirait demain autre chose de faux ; il nomme les
 * deux affirmations qui ont réellement trompé, et l'endroit du code où la
 * vérification se fait. Le comportement, lui, demande un appareil.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER_APP = join(ICI, '..', 'app', 'sauvegarde');
const DEPOT_IMPORT = join(ICI, '..', 'src', 'backup', 'import.ts');

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

test('Sauvegarde : l’export annonce que les PDF n’y sont pas', () => {
  const source = lire(join(DOSSIER_APP, 'export.tsx'));

  assert.match(
    source,
    /Fichiers PDF des quittances/,
    'l’export ne liste pas les fichiers PDF parmi ce qu’il contient ou non',
  );
  assert.match(
    source,
    /Non inclus/,
    'l’export doit dire « Non inclus » en face des fichiers PDF',
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
