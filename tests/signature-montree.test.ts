import { readFileSync } from 'node:fs';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Une signature recueillie doit etre **montree**, dans le document comme sur
 * l'ecran.
 *
 * Le defaut d'origine : le trace etait bien enregistre, bien insere dans le
 * PDF — et l'ecran de relecture le resumait par le mot « Signe ». Le bailleur
 * signait, relisait, et voyait un cadre blanc ; il en a conclu que la signature
 * n'avait pas ete prise. Un controle qui se contente de verifier que la donnee
 * existe ne voit pas ce defaut : la donnee existait.
 *
 * Ce que ce controle exige, et qui manquait :
 *
 *  1. le document insere l'image du trace (`<img src="data:image/svg+xml;...>`)
 *     dans un cadre de signature ;
 *  2. l'ecran de relecture aussi — c'est la que le bailleur regarde avant
 *     d'imprimer ;
 *  3. un signataire qui n'a pas signe porte la mention « Non signe », pour que
 *     le cadre vide soit une information et non un oubli.
 *
 * Ce que ce controle ne peut pas faire, et qui est dit ici pour qu'on ne le lui
 * demande pas : il lit du **source**, il ne rend rien. Qu'un `Image` de React
 * Native affiche reellement une URI `data:` en SVG, c'est le comportement
 * documente de la plateforme, et aucun test sans emulateur ne le prouvera.
 */

const RACINE = new URL('..', import.meta.url);

function lire(chemin: string): string {
  return readFileSync(new URL(chemin, RACINE), 'utf8');
}

/** Le document de bail, tel qu'il est produit. */
const SOURCE_DOCUMENT = 'src/pdf/bail.ts';
/** L'ecran d'apercu du bail : ce que le bailleur relit avant de generer. */
const SOURCE_APERCU = 'app/bail/verification.tsx';
/** Le pave de signature, partage par le bail, l'etat des lieux et l'inventaire. */
const SOURCE_PAVE = 'src/ui/components/BlocSignature.tsx';

describe('une signature recueillie est montree', () => {
  it('le document insere le trace dans un cadre de signature', () => {
    const source = lire(SOURCE_DOCUMENT);
    assert.match(
      source,
      /<div class="b-cadre">/,
      'le cadre de signature du document a disparu : le trace n\'aurait plus ou se poser',
    );
    assert.match(
      source,
      /<img src="\$\{echapper\(s\.signature\.trace\)\}"/,
      'le document n\'insere plus l\'image du trace : la signature ne s\'imprimerait pas',
    );
    assert.match(
      source,
      /<span class="b-vide">Non signé<\/span>/,
      'un signataire sans trace doit porter « Non signé », et non laisser un cadre muet',
    );
  });

  it('l\'apercu du bail montre l\'image, et pas seulement le mot « Signé »', () => {
    const source = lire(SOURCE_APERCU);
    assert.match(
      source,
      /<Image\s+\n?\s*source=\{\{ uri: trace \}\}/,
      'l\'apercu ne rend plus d\'image de signature : le bailleur ne peut pas verifier la sienne',
    );
    assert.match(
      source,
      /trace=\{signatures\.find\(\(s\) => s\.signataire === SIGNATAIRE_BAILLEUR\)\?\.trace\}/,
      'le trace du bailleur n\'est plus passe a l\'apercu',
    );
    assert.match(
      source,
      /trace=\{signature\?\.trace\}/,
      'le trace de chaque locataire n\'est plus passe a l\'apercu',
    );
    assert.match(
      source,
      /style=\{styles\.bCadre\}/,
      'le cadre blanc du document doit se retrouver a l\'identique dans l\'apercu',
    );
    assert.match(
      source,
      /<Text style=\{styles\.bVide\}>Non signé<\/Text>/,
      'l\'apercu doit dire « Non signé » sur un cadre sans trace',
    );
  });

  it('le pave affiche le trace venu de l\'exterieur', () => {
    const source = lire(SOURCE_PAVE);
    assert.match(
      source,
      /const traceExterne = !vide && traits\.length === 0 && chemin \? chemin : null;/,
      'le pave ne distingue plus un trace externe d\'un trace en cours : il resterait blanc',
    );
    assert.match(
      source,
      /<Image\s+\n?\s*source=\{\{ uri: traceExterne \}\}/,
      'le pave n\'affiche plus le trace qu\'on lui passe',
    );
    assert.match(
      source,
      /largeur > 0 && !traceExterne/,
      'le pavé dessinerait ses points par-dessus l\'image venue de l\'exterieur',
    );
  });

  it('le formulaire de bail passe le trace courant a son pave', () => {
    const source = lire('app/bail/nouveau.tsx');
    assert.match(
      source,
      /chemin=\{signatureCourante\?\.trace \?\? ''\}/,
      'le formulaire ne passe plus le trace courant : le pave resterait vide apres signature',
    );
  });
});
