/**
 * « Voir le PDF » ouvre le document, et ne le fait pas imprimer.
 *
 * Signalé depuis le téléphone le 26 septembre 2026 : « lorsque je génère un
 * bail ou une quittance et je clique sur voir le pdf ça m'ouvre une fenêtre
 * d'impression comme si je voulais imprimer ».
 *
 * Le défaut tenait à un seul appel : `ouvrirDocument` confiait le fichier à
 * l'appel d'impression d'`expo-print`. Celui-ci ne montre jamais un document —
 * il demande au système de l'**imprimer**, et c'est donc une boîte d'impression
 * qui s'ouvre, avec le choix de l'imprimante. Le nom de la fonction disait
 * « ouvrir », le comportement disait « imprimer », et rien ne le relevait :
 * aucun test ne couvrait `ouvrirDocument`.
 *
 * Ce que ce contrôle exige :
 *
 *   1. le module d'ouverture ne touche plus à l'impression, ni par un appel ni
 *      par un import ;
 *   2. sur Android, l'ouverture passe par une intention de consultation
 *      (`ACTION_VIEW`) portant une **URI de contenu** et le drapeau qui autorise
 *      sa lecture — sans ce drapeau, le lecteur PDF n'a pas le droit de lire le
 *      fichier et Android refuse l'ouverture ;
 *   3. faute de lecteur, l'ouverture retombe sur la feuille de partage plutôt
 *      que d'échouer ;
 *   4. les écrans qui ouvrent un document et ceux qui annoncent « Voir le PDF »
 *      sont **les mêmes** — l'accord est vérifié dans les deux sens, pour
 *      qu'aucun des deux côtés ne dérive en silence.
 *
 * Ce que ce contrôle ne peut pas faire, et qui est dit ici pour qu'on ne le lui
 * demande pas : il lit du source. Qu'Android ouvre réellement le document dans
 * le lecteur installé, et qu'iOS présente sa feuille de partage, sont des
 * comportements de plateforme — aucun test sans émulateur ne les prouvera. Ce
 * qui est prouvé ici, c'est qu'on ne demande plus l'impression, et que la
 * demande faite à Android porte de quoi réussir.
 */

import { readdirSync, readFileSync } from 'node:fs';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const RACINE = new URL('..', import.meta.url);

function lire(chemin: string): string {
  return readFileSync(new URL(chemin, RACINE), 'utf8');
}

/** Tous les fichiers `.ts` et `.tsx` d'un dossier, récursivement. */
function fichiersSources(dossier: string): string[] {
  const trouves: string[] = [];

  for (const entree of readdirSync(new URL(`${dossier}/`, RACINE), { withFileTypes: true })) {
    const chemin = `${dossier}/${entree.name}`;
    if (entree.isDirectory()) trouves.push(...fichiersSources(chemin));
    else if (entree.name.endsWith('.ts') || entree.name.endsWith('.tsx')) trouves.push(chemin);
  }

  return trouves;
}

/** Le module qui ouvre et partage les documents. */
const SOURCE_PARTAGE = 'src/pdf/partage.ts';

/** Ce que l'écran annonce à la personne. */
const LIBELLE = 'libelle="Voir le PDF"';

describe('voir le PDF ouvre le document', () => {
  it("l'ouverture ne passe plus par l'impression", () => {
    const source = lire(SOURCE_PARTAGE);

    assert.doesNotMatch(
      source,
      /printAsync/,
      "l'ouverture d'un document demande de nouveau l'impression : "
        + "c'est une boîte d'impression qui s'ouvrira, pas le document",
    );
    assert.doesNotMatch(
      source,
      /from 'expo-print'/,
      "le module d'ouverture importe de nouveau l'impression",
    );
  });

  it('Android ouvre le document par une intention de consultation', () => {
    const source = lire(SOURCE_PARTAGE);

    assert.match(
      source,
      /const ACTION_VOIR = 'android\.intent\.action\.VIEW';/,
      "l'action de consultation a disparu",
    );
    assert.match(
      source,
      /await IntentLauncher\.startActivityAsync\(ACTION_VOIR, \{/,
      "l'ouverture n'envoie plus d'intention de consultation : le document ne s'ouvrirait pas",
    );
    assert.match(
      source,
      /type: 'application\/pdf',/,
      "le type du document n'est plus annoncé au système",
    );
    assert.match(
      source,
      /const LECTURE_AUTORISEE = 1;/,
      "la valeur du drapeau a changé : c'est le drapeau de lecture qu'il faut poser",
    );
    assert.match(
      source,
      /flags: LECTURE_AUTORISEE,/,
      "le drapeau de lecture n'est plus posé : Android refuserait l'ouverture",
    );
  });

  it("le chemin privé de l'application est converti en URI de contenu", () => {
    assert.match(
      lire(SOURCE_PARTAGE),
      /await FileSystem\.getContentUriAsync\(chemin\)/,
      "le fichier n'est plus converti en URI de contenu : "
        + 'aucun lecteur ne peut lire un chemin privé, et il n\'y a rien à ouvrir',
    );
  });

  it("sans lecteur installé, l'ouverture retombe sur la feuille de partage", () => {
    assert.match(
      lire(SOURCE_PARTAGE),
      /return partagerDocument\(chemin, 'Ouvrir le PDF'\);/,
      "le repli vers la feuille de partage a disparu : sans lecteur PDF, "
        + "l'ouverture échouerait au lieu de laisser choisir une application",
    );
  });

  /*
   * Les écrans sont **découverts par balayage**, et non listés ici : un écran
   * ajouté demain qui propose « Voir le PDF » entre dans le contrôle tout seul.
   * Une liste recopiée aurait laissé le nouveau venu hors de la vérification
   * sans que rien ne le signale.
   *
   * L'accord est exigé dans les deux sens. Vérifier seulement que chaque écran
   * qui annonce « Voir le PDF » ouvre bien le document laisserait passer le cas
   * où l'annonce disparaît : l'écran sortirait alors du contrôle, et le
   * contrôle serait vert sur un écran qui n'ouvre plus rien.
   */
  it('les écrans qui ouvrent un document sont ceux qui annoncent « Voir le PDF »', () => {
    const sources = fichiersSources('app');

    const parLibelle = sources.filter((chemin) => lire(chemin).includes(LIBELLE));
    const parAppel = sources.filter((chemin) => /ouvrirDocument\(/.test(lire(chemin)));

    assert.ok(
      parLibelle.length > 0,
      'aucun écran ne porte « Voir le PDF » : le contrôle ne vérifie plus rien',
    );

    for (const chemin of parLibelle) {
      assert.doesNotMatch(
        lire(chemin),
        /imprimerDocument/,
        `${chemin} demande l'impression là où la personne veut voir le document`,
      );
    }

    assert.deepEqual(
      parAppel.sort(),
      parLibelle.sort(),
      "les écrans qui ouvrent un document et ceux qui annoncent « Voir le PDF » "
        + 'ont divergé : un écran ouvre un PDF sans le dire, ou annonce « Voir le PDF » sans l\'ouvrir',
    );
  });
});
